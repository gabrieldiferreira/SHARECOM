from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List
import os
import uuid
import ocr_processor
import hashlib
import re
from auth import verify_firebase_token

from database import engine, get_db, Base
from export_routes import router as export_router
import models
import schemas

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SHARECOM API", 
    version="1.0.0",
    redirect_slashes=True
)
app.include_router(export_router)

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"DEBUG: Requisição recebida: {request.method} {request.url.path}")
    return await call_next(request)

@app.get("/")
def read_root():
    return {"status": "online", "message": "SHARECOM API is running successfully!", "debug": "v2-docker"}

# os.makedirs("uploads", exist_ok=True)
# app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads") # Removed for Read-and-Delete privacy policy

# Configure CORS
frontend_url = os.getenv("FRONTEND_URL", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url] if frontend_url != "*" else ["*"],
    allow_credentials=True if frontend_url != "*" else False, # Credentials cannot be true with '*'
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
        
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

def generate_structural_map(text: str) -> str:
    """
    Converts text to a structural skeleton:
    'R$ 1.680,00' -> 'XX 0.000,00'
    '19/10/2017' -> '00/00/0000'
    """
    # Replace digits with 0
    text = re.sub(r'\d', '0', text)
    # Replace uppercase letters with X
    text = re.sub(r'[A-ZÀ-Ú]', 'X', text)
    # Replace lowercase letters with x
    text = re.sub(r'[a-zà-ú]', 'x', text)
    return text

@app.get("/expenses", response_model=List[schemas.Expense])
def read_expenses(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    user: dict = Depends(verify_firebase_token),
):
    # Filter by user if multi-tenancy is implemented later
    expenses = db.query(models.Expense).order_by(models.Expense.date.desc()).offset(skip).limit(limit).all()
    return expenses

@app.post("/expenses", response_model=schemas.Expense)
def create_expense(
    expense: schemas.ExpenseCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_firebase_token),
):
    db_expense = models.Expense(**expense.model_dump())
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return db_expense

@app.post("/process-ata")
@app.post("/receipts") # Keep legacy endpoint for frontend compatibility
async def process_ata(
    received_file: UploadFile = File(...),
    note: str = Form(None),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_firebase_token),
):
    print(f"\n>>> DEBUG: INICIOU O PROCESSAMENTO DO ARQUIVO: {received_file.filename}", flush=True)
    """
    Absolute Privacy Processing: 
    Reads the file into memory, extracts data via AI, and destroys the buffer.
    Zero persistence to disk.
    """
    if not received_file.filename:
        raise HTTPException(status_code=400, detail="Documento não identificado.")
    
    # Read directly into RAM
    content = await received_file.read()
    
    # Calculate SHA-256 for idempotency (prevents duplicate 'Atas')
    sha256_hash = hashlib.sha256(content).hexdigest()
    print(f"DEBUG: Hash do arquivo: {sha256_hash}", flush=True)
    
    # Check if this 'Ata' already exists
    existing_expense = db.query(models.Expense).filter(models.Expense.receipt == sha256_hash).first()
    if existing_expense:
        print(f"DEBUG: BLOQUEIO - Arquivo já existe no banco (ID: {existing_expense.id}). Retornando dados antigos.", flush=True)
        # Clear sensitive bytes immediately
        del content
        return {
            "idempotent": True,
            "ai_data": {
                "total_amount": existing_expense.amount,
                "merchant_name": existing_expense.merchant,
                "smart_category": existing_expense.category,
                "transaction_id": existing_expense.transaction_id,
                "needs_manual_review": False
            },
            "database_id": existing_expense.id
        }
    
    # 2. Process File via OCR (The Scout)
    ext = os.path.splitext(received_file.filename)[1] or ".jpg"
    extracted_data, raw_text = await run_in_threadpool(ocr_processor.extract_transaction_data, content, ext)
    structural_map = generate_structural_map(raw_text)
    
    # 3. Hybrid Logic: AI goes first for unknown places (patterns)
    import ai_processor
    # Check by structural map (layout) instead of file hash
    pattern_exists = db.query(models.PatternLog).filter(models.PatternLog.structural_map == structural_map).first()
    
    if not pattern_exists:
        print(f"DEBUG: Padrão NOVO detectado. IA batedora entrando em campo...", flush=True)
        ai_data, ai_error = await ai_processor.analyze_receipt_with_ai(content, ext)
        if ai_data:
            extracted_data.update(ai_data)
            extracted_data["needs_manual_review"] = False
            print(f"DEBUG: IA mapeou o padrão com sucesso.", flush=True)
        else:
            print(f"DEBUG: IA indisponível ou erro: {ai_error}. Usando OCR local.", flush=True)
    else:
        print(f"DEBUG: Padrão CONHECIDO. OCR local assume a glória.", flush=True)

    # 4. Save to Pattern Bank (only if this specific file hash is new)
    import json
    existing_log = db.query(models.PatternLog).filter(models.PatternLog.hash == sha256_hash).first()
    if not existing_log:
        new_pattern = models.PatternLog(
            filename=received_file.filename,
            raw_text=raw_text,
            structural_map=structural_map,
            extracted_json=json.dumps(extracted_data),
            hash=sha256_hash
        )
        db.add(new_pattern)
        db.commit()
    else:
        print(f"DEBUG: Padrão estrutural já existe no banco. Pulando salvamento.", flush=True)
    
    # Convert extracted date string to Python datetime object
    date_val = extracted_data.get("transaction_date")
    if date_val:
        try:
            date_obj = schemas.datetime.fromisoformat(date_val.replace(" ", "T"))
        except (ValueError, TypeError):
            date_obj = schemas.datetime.now()
    else:
        date_obj = schemas.datetime.now()

    # Save to database immediately after extraction to ensure zero data loss
    db_expense = models.Expense(
        date=date_obj,
        amount=extracted_data.get("total_amount", 0),
        category=extracted_data.get("smart_category", "Outros"),
        merchant=extracted_data.get("merchant_name", "Desconhecido"),
        description=f"Extracted from {received_file.filename}",
        receipt=sha256_hash, # Link to the unique hash of the file
        transaction_type=extracted_data.get("transaction_type", "Outflow"),
        payment_method=extracted_data.get("payment_method", "Desconhecido"),
        destination_institution=extracted_data.get("destination_institution"),
        transaction_id=extracted_data.get("transaction_id") or None,
        masked_cpf=extracted_data.get("masked_cpf") or None,
        note=note
    )
    
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)

    # Explicitly nullify content buffer to hint GC
    del content
        
    return {
        "idempotent": False,
        "filename": sha256_hash, 
        "ai_data": extracted_data,
        "note": note,
        "database_id": db_expense.id
    }

@app.delete("/expenses/{expense_id}")
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_firebase_token),
):
    print(f"DEBUG: TENTANDO DELETAR ID: {expense_id}", flush=True)
    db_expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not db_expense:
        print(f"DEBUG: ERRO - ID {expense_id} não encontrado no banco.", flush=True)
        raise HTTPException(status_code=404, detail="Gasto não encontrado")
    db.delete(db_expense)
    db.commit()
    print(f"DEBUG: ID {expense_id} DELETADO COM SUCESSO.", flush=True)
    return {"message": "Deletado com sucesso"}

@app.post("/expenses/clear-all")
def clear_all_expenses(
    db: Session = Depends(get_db),
    _: dict = Depends(verify_firebase_token),
):
    print("DEBUG: >>> LIMPANDO TODO O BANCO DE DADOS <<<", flush=True)
    try:
        num_deleted = db.query(models.Expense).delete()
        db.commit()
        print(f"DEBUG: BANCO LIMPO. {num_deleted} registros removidos.", flush=True)
        return {"message": "Banco de dados resetado com sucesso"}

    except Exception as e:
        print(f"DEBUG: ERRO AO LIMPAR BANCO: {e}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/patterns")
def get_patterns(
    db: Session = Depends(get_db),
    _: dict = Depends(verify_firebase_token),
):
    return db.query(models.PatternLog).order_by(models.PatternLog.timestamp.desc()).all()
