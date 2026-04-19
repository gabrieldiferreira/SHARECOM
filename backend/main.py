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
    allow_origins=["*"],
    allow_credentials=False, # Credentials cannot be true with '*'
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
    received_file: UploadFile = File(None),
    receipt_url: str = Form(None),
    note: str = Form(None),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_firebase_token),
):
    print(f"\n>>> DEBUG: INICIOU O PROCESSAMENTO. ARQUIVO: {received_file.filename if received_file else 'NENHUM'} | URL: {receipt_url} | NOTA: {note}", flush=True)
    
    content = b""
    sha256_hash = ""
    ext = ".txt"
    filename = "text_note.txt"

    if received_file and received_file.filename:
        filename = received_file.filename
        content = await received_file.read()
        sha256_hash = hashlib.sha256(content).hexdigest()
        ext = os.path.splitext(filename)[1] or ".jpg"
    elif receipt_url and receipt_url.strip().startswith("http"):
        # Campo dedicado de URL: tenta baixar a imagem/PDF
        import httpx
        clean_url = receipt_url.strip()
        try:
            print(f"DEBUG: Baixando URL: {clean_url}", flush=True)
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                download_resp = await client.get(
                    clean_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; SHARECOM-Bot/1.0)"}
                )
                content_type = download_resp.headers.get("content-type", "")
                print(f"DEBUG: Status={download_resp.status_code}, Content-Type={content_type}", flush=True)

                if download_resp.status_code == 200:
                    # Rejeita HTML — provavelmente página de login ou erro
                    if "text/html" in content_type:
                        print("DEBUG: URL retornou HTML (página protegida ou redirect). Usando URL como texto.", flush=True)
                        # Tenta extrair texto da página HTML como último recurso
                        content = download_resp.content
                        sha256_hash = hashlib.sha256(content).hexdigest()
                        ext = ".html"
                        filename = "downloaded_page.html"
                    elif "pdf" in content_type:
                        content = download_resp.content
                        sha256_hash = hashlib.sha256(content).hexdigest()
                        ext = ".pdf"
                        filename = clean_url.split("/")[-1].split("?")[0] or "comprovante.pdf"
                        print(f"DEBUG: PDF baixado com sucesso ({len(content)} bytes).", flush=True)
                    elif any(img in content_type for img in ["image/jpeg", "image/png", "image/webp", "image/gif"]):
                        content = download_resp.content
                        sha256_hash = hashlib.sha256(content).hexdigest()
                        if "png" in content_type: ext = ".png"
                        elif "webp" in content_type: ext = ".webp"
                        else: ext = ".jpg"
                        filename = clean_url.split("/")[-1].split("?")[0] or f"imagem{ext}"
                        print(f"DEBUG: Imagem baixada com sucesso ({len(content)} bytes).", flush=True)
                    else:
                        # Tipo desconhecido — tenta inferir pela URL
                        url_lower = clean_url.lower()
                        if ".pdf" in url_lower: ext = ".pdf"
                        elif ".png" in url_lower: ext = ".png"
                        elif ".webp" in url_lower: ext = ".webp"
                        else: ext = ".jpg"
                        content = download_resp.content
                        sha256_hash = hashlib.sha256(content).hexdigest()
                        filename = clean_url.split("/")[-1].split("?")[0] or f"arquivo{ext}"
                        print(f"DEBUG: Tipo de conteúdo desconhecido ({content_type}). Tentando como {ext}.", flush=True)
                else:
                    print(f"DEBUG: Falha ao baixar URL (status {download_resp.status_code}). Usando URL como texto.", flush=True)
                    content = clean_url.encode('utf-8')
                    sha256_hash = hashlib.sha256(content).hexdigest()
                    ext = ".txt"
        except Exception as e:
            print(f"DEBUG: Exceção ao baixar URL: {e}. Usando URL como texto.", flush=True)
            content = clean_url.encode('utf-8')
            sha256_hash = hashlib.sha256(content).hexdigest()
            ext = ".txt"
    elif note:
        # Texto puro como fonte
        content = note.encode('utf-8')
        sha256_hash = hashlib.sha256(content).hexdigest()
        filename = "note_comprovante.txt"
    else:
        raise HTTPException(status_code=400, detail="Nenhum dado (arquivo, URL ou texto) enviado.")
    
    # Check for idempotency
    existing_expense = db.query(models.Expense).filter(models.Expense.receipt == sha256_hash).first()
    if existing_expense:
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
    
    # Process Data
    extracted_data = {
        "total_amount": 0.0,
        "merchant_name": "Processando...",
        "smart_category": "Outros",
        "transaction_date": None
    }
    raw_text = note or ""
    structural_map = ""

    # Extração via OCR Local (Reforço)
    import ocr_processor
    ocr_fallback_data, raw_text = ocr_processor.extract_transaction_data(content, ext)
    
    # 3. Análise IA (Vision) com apoio do OCR
    from ai_processor import analyze_receipt_with_ai
    extracted_data, ai_error = await analyze_receipt_with_ai(content, ext, ocr_text=raw_text)
    
    if extracted_data is None:
        # Se a IA falhou, usamos o OCR puro como fallback (plano B)
        extracted_data = ocr_fallback_data
        print(f"DEBUG: IA falhou ({ai_error}). Usando OCR de fallback.", flush=True)
    
    if not extracted_data:
        extracted_data = {"merchant_name": f"Erro: {ai_error or 'Desconhecido'}"}

    # Save to database
    import json
    date_val = extracted_data.get("transaction_date")
    date_obj = schemas.datetime.now()
    if date_val:
        try:
            date_obj = schemas.datetime.fromisoformat(date_val.replace(" ", "T"))
        except:
            pass

    # Determina se é um gasto real ou apenas informação
    is_receipt = extracted_data.get("is_financial_receipt", True)
    category = extracted_data.get("smart_category") or ("Informativo" if not is_receipt else "Outros")
    amount = extracted_data.get("total_amount") if is_receipt and extracted_data.get("total_amount") is not None else 0.0
    merchant = extracted_data.get("merchant_name") or ("Link Informativo" if not is_receipt else "Desconhecido")

    db_expense = models.Expense(
        date=date_obj,
        amount=amount,
        category=category,
        merchant=merchant,
        description=extracted_data.get("description") or f"Processado via {('Arquivo' if received_file else 'Link')}",
        receipt=sha256_hash,
        transaction_type=extracted_data.get("transaction_type", "Outflow"),
        payment_method=extracted_data.get("payment_method", "Desconhecido"),
        destination_institution=extracted_data.get("destination_institution"),
        transaction_id=extracted_data.get("transaction_id"),
        note=note
    )
    
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    
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
