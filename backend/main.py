from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List
import os
import uuid
# import ai_agent # Removed as requested
import hashlib
from auth import verify_firebase_token

from database import engine, get_db, Base
from export_routes import router as export_router
import models
import schemas

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SHARECOM API", version="1.0.0")
app.include_router(export_router)

@app.get("/")
def read_root():
    return {"status": "online", "message": "SHARECOM API is running successfully!"}

# os.makedirs("uploads", exist_ok=True)
# app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads") # Removed for Read-and-Delete privacy policy

# Configure CORS - Restrict this in production!
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url] if frontend_url != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

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
    
    # Check if this 'Ata' already exists
    existing_expense = db.query(models.Expense).filter(models.Expense.receipt == sha256_hash).first()
    if existing_expense:
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
            }
        }
    
    # AI Disabled: Return defaults for manual entry
    extracted_data = {
        "total_amount": 0.0,
        "smart_category": "Outros",
        "merchant_name": "Pendente",
        "transaction_date": schemas.datetime.now().isoformat(),
        "needs_manual_review": True
    }
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
