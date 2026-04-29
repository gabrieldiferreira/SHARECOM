from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from starlette.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List
import os
import uuid
import hashlib
import re
import time
from auth import verify_firebase_token

from database import engine, get_db, Base, DATABASE_URL
from export_routes import router as export_router
import models
import schemas
from sqlalchemy.exc import IntegrityError

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SHARECOM API",
    version="1.0.0",
    redirect_slashes=True
)

# Configure CORS - MOVED UP and expanded for better development stability
frontend_url = os.getenv("FRONTEND_URL", "https://www.sharecom.com.br")
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://sharecom.com.br",
    "https://www.sharecom.com.br",
    frontend_url
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if os.getenv("DEBUG") == "true" else origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Migração Automática: Garante que colunas novas existam (Útil para Render/Postgres)
@app.on_event("startup")
async def apply_migrations():
    from sqlalchemy import text, inspect
    columns_to_ensure = [
        ("transaction_type", "TEXT DEFAULT 'Outflow'"),
        ("payment_method", "TEXT"),
        ("destination_institution", "TEXT"),
        ("transaction_id", "TEXT"),
        ("masked_cpf", "TEXT"),
        ("note", "TEXT"),
        ("deleted_at", "TIMESTAMP"),
        ("user_id", "TEXT")
    ]

    try:
        inspector = inspect(engine)
        existing_columns = [c["name"] for c in inspector.get_columns("expenses")]
        existing_indexes = [idx['name'] for idx in inspector.get_indexes("expenses")]

        with engine.begin() as conn:
            for col_name, col_def in columns_to_ensure:
                if col_name not in existing_columns:
                    print(f"MIGRAÇÃO: Adicionando coluna {col_name}...")
                    conn.execute(text(f"ALTER TABLE expenses ADD COLUMN {col_name} {col_def}"))
            
            if "sqlite" in DATABASE_URL:
                # Step 1: Drop the global unique index on transaction_id if it exists.
                # This was incorrectly preventing different users from having the same transaction_id.
                for idx_name in existing_indexes:
                    if "transaction_id" in idx_name and "user" not in idx_name:
                        try:
                            print(f"MIGRAÇÃO: Removendo índice global incorreto: {idx_name}")
                            conn.execute(text(f"DROP INDEX IF EXISTS {idx_name}"))
                        except Exception as drop_err:
                            print(f"MIGRAÇÃO: Não foi possível remover {idx_name}: {drop_err}")

                # Step 2: Recreate as non-unique plain index (for query performance only)
                try:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_expenses_transaction_id ON expenses(transaction_id)"))
                    print("MIGRAÇÃO: Índice simples ix_expenses_transaction_id garantido.")
                except Exception as e:
                    print(f"MIGRAÇÃO: Índice simples já existe: {e}")

                # Step 3: Create per-user composite unique index (the correct behavior)
                if "uq_user_transaction_id" not in existing_indexes:
                    try:
                        conn.execute(text(
                            "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_transaction_id "
                            "ON expenses(user_id, transaction_id) "
                            "WHERE transaction_id IS NOT NULL"
                        ))
                        print("MIGRAÇÃO: Índice único composto (user_id, transaction_id) criado com sucesso.")
                    except Exception as idx_err:
                        print(f"MIGRAÇÃO: Índice composto já existe ou erro: {idx_err}")
            else:
                # PostgreSQL
                if "uq_user_transaction_id" not in existing_indexes:
                    try:
                        print("MIGRAÇÃO: Adicionando unique constraint (user_id, transaction_id)...")
                        conn.execute(text("ALTER TABLE expenses ADD CONSTRAINT uq_user_transaction_id UNIQUE(user_id, transaction_id)"))
                    except Exception as constraint_error:
                        print(f"MIGRAÇÃO: Unique constraint já existe ou erro: {constraint_error}")
        
        print("MIGRAÇÃO: Verificação concluída com sucesso.")
    except Exception as e:
        print(f"MIGRAÇÃO: Erro crítico durante migração: {e}")

# =============================================================================
# CACHE EM MEMÓRIA — LRU + TTL + STATS + WARM-UP
# =============================================================================
from collections import OrderedDict

CACHE_TTL_SECONDS = 60   # TTL: dados válidos por 60 segundos
CACHE_MAX_SIZE    = 100  # LRU: máximo de entradas simultâneas na memória

class LRUCache:
    """Cache LRU com TTL e estatísticas de hit/miss."""
    def __init__(self, max_size: int, ttl: int):
        self.max_size = max_size
        self.ttl = ttl
        self._store: OrderedDict = OrderedDict()
        self.hits = 0
        self.misses = 0

    def get(self, key: str):
        if key not in self._store:
            self.misses += 1
            print(f"CACHE MISS  | key={key[:16]} | hits={self.hits} misses={self.misses}", flush=True)
            return None
        data, expires_at = self._store[key]
        if time.time() > expires_at:
            del self._store[key]
            self.misses += 1
            print(f"CACHE EXPIR | key={key[:16]} (TTL expirado)", flush=True)
            return None
        # Move para o final (LRU: mais recente)
        self._store.move_to_end(key)
        self.hits += 1
        print(f"CACHE HIT   | key={key[:16]} | {len(data)} registros | hits={self.hits}", flush=True)
        return data

    def set(self, key: str, data):
        if key in self._store:
            self._store.move_to_end(key)
        self._store[key] = (data, time.time() + self.ttl)
        # LRU eviction: remove o mais antigo se ultrapassar o limite
        if len(self._store) > self.max_size:
            oldest_key, _ = self._store.popitem(last=False)
            print(f"CACHE EVICT | LRU removeu key={oldest_key[:16]}", flush=True)
        print(f"CACHE SET   | key={key[:16]} | TTL={self.ttl}s | size={len(self._store)}/{self.max_size}", flush=True)

    def invalidate_all(self):
        count = len(self._store)
        self._store.clear()
        print(f"CACHE CLEAR | {count} entradas invalidadas", flush=True)

    def stats(self):
        total = self.hits + self.misses
        ratio = (self.hits / total * 100) if total > 0 else 0
        return {"hits": self.hits, "misses": self.misses, "hit_rate": f"{ratio:.1f}%", "size": len(self._store)}

_cache = LRUCache(max_size=CACHE_MAX_SIZE, ttl=CACHE_TTL_SECONDS)

# Atalhos para compatibilidade com o código existente
def cache_get(key: str): return _cache.get(key)
def cache_set(key: str, data): _cache.set(key, data)
def cache_invalidate(key: str): _cache.invalidate_all()  # Simples: invalida tudo
def cache_invalidate_all(): _cache.invalidate_all()


def archive_receipt(
    db: Session,
    uid: str,
    receipt_hash: str,
    filename: str,
    extension: str,
    content: bytes,
    status: str = "received",
    raw_text: str | None = None,
    error: str | None = None,
):
    archive = db.query(models.ReceiptArchive).filter(
        models.ReceiptArchive.user_id == uid,
        models.ReceiptArchive.receipt_hash == receipt_hash,
    ).first()

    if archive:
        archive.filename = archive.filename or filename
        archive.extension = archive.extension or extension
        archive.status = status
        archive.raw_text = raw_text if raw_text is not None else archive.raw_text
        archive.error = error
        return archive

    archive = models.ReceiptArchive(
        user_id=uid,
        receipt_hash=receipt_hash,
        filename=filename,
        extension=extension,
        content=content,
        status=status,
        raw_text=raw_text,
        error=error,
    )
    db.add(archive)
    return archive

app.include_router(export_router)

@app.on_event("startup")
async def warm_up_cache():
    # Warm-up desabilitado para evitar vazamento de dados entre usuários no cache global
    print("CACHE WARM-UP | Desabilitado para garantir isolamento por UID.", flush=True)

@app.middleware("http")
async def log_requests(request, call_next):
    start_time = time.time()
    path = request.url.path
    method = request.method

    if path != "/":
        print(f"DEBUG: REQUEST IN  | {method} {path} | Host: {request.headers.get('host')}", flush=True)

    response = await call_next(request)

    process_time = (time.time() - start_time) * 1000
    if path != "/":
        print(f"DEBUG: REQUEST OUT | {method} {path} | Status: {response.status_code} | {process_time:.2f}ms", flush=True)

    return response

@app.get("/")
def read_root():
    return {"status": "online", "message": "SHARECOM API is running successfully!", "debug": "v2-docker"}

@app.get("/cache/stats")
def get_cache_stats(_: dict = Depends(verify_firebase_token)):
    return _cache.stats()

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

@app.get("/expenses", response_model=List[schemas.Expense])
def read_expenses(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    user: dict = Depends(verify_firebase_token),
    include_deleted: bool = False
):
    uid = user.get("uid", "anonymous")
    cache_key = f"{uid}:{skip}:{limit}:{include_deleted}"

    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    query = db.query(models.Expense).filter(models.Expense.user_id == uid)
    if not include_deleted:
        query = query.filter(models.Expense.deleted_at == None)

    expenses = query.order_by(models.Expense.date.desc()).offset(skip).limit(limit).all()
    cache_set(cache_key, expenses)
    return expenses

@app.post("/expenses", response_model=schemas.Expense)
def create_expense(
    expense: schemas.ExpenseCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(verify_firebase_token),
):
    uid = user.get("uid", "anonymous")
    db_expense = models.Expense(**expense.model_dump())
    db_expense.user_id = uid
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    cache_invalidate_all()
    return db_expense

@app.patch("/expenses/{expense_id}", response_model=schemas.Expense)
def update_expense(
    expense_id: int,
    updates: dict,
    db: Session = Depends(get_db),
    user: dict = Depends(verify_firebase_token),
):
    uid = user.get("uid", "anonymous")
    db_expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.user_id == uid
    ).first()
    if not db_expense:
        raise HTTPException(status_code=404, detail="Gasto não encontrado ou acesso negado")
    
    for key, value in updates.items():
        if hasattr(db_expense, key):
            if key == 'deleted_at' and value:
                from datetime import datetime as dt
                try:
                    if isinstance(value, str):
                        setattr(db_expense, key, dt.fromisoformat(value.replace('Z', '')))
                    else:
                        setattr(db_expense, key, value)
                except:
                    setattr(db_expense, key, dt.utcnow())
            else:
                setattr(db_expense, key, value)
    
    db.commit()
    db.refresh(db_expense)
    cache_invalidate_all()
    return db_expense

@app.post("/process-ata")
@app.post("/receipts")
async def process_ata(
    received_file: UploadFile = File(None),
    receipt_url: str = Form(None),
    note: str = Form(None),
    transaction_type: str = Form(None),
    force: bool = Form(False),
    db: Session = Depends(get_db),
    user: dict = Depends(verify_firebase_token),
):
    uid = user.get("uid", "anonymous")
    try:
        print(f"\n>>> DEBUG: INICIOU O PROCESSAMENTO. ARQUIVO: {received_file.filename if received_file else 'NENHUM'} | URL: {receipt_url} | NOTA: {note}", flush=True)

        content = b""
        sha256_hash = ""
        ext = ".txt"
        filename = "text_note.txt"
        tmp_file_path = None

        if received_file and received_file.filename:
            filename = received_file.filename
            content = await received_file.read()
            sha256_hash = hashlib.sha256(content).hexdigest()
            ext = os.path.splitext(filename)[1].lower() or ".jpg"

        elif receipt_url and receipt_url.strip().startswith("http"):
            import httpx
            clean_url = receipt_url.strip()
            try:
                print(f"DEBUG: Baixando URL: {clean_url}", flush=True)
                async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                    download_resp = await client.get(
                        clean_url,
                        headers={"User-Agent": "Mozilla/5.0 (Linux; Android 11; Mobile) AppleWebKit/537.36 Chrome/120.0 SHARECOM-Bot/2.0"}
                    )
                    content_type = download_resp.headers.get("content-type", "").lower()
                    print(f"DEBUG: Status={download_resp.status_code} | Content-Type={content_type} | Bytes={len(download_resp.content)}", flush=True)

                    if download_resp.status_code != 200:
                        raise ValueError(f"HTTP {download_resp.status_code} ao baixar URL")

                    if "pdf" in content_type: ext = ".pdf"
                    elif "png" in content_type: ext = ".png"
                    elif "webp" in content_type: ext = ".webp"
                    elif "gif" in content_type: ext = ".gif"
                    elif "jpeg" in content_type or "jpg" in content_type: ext = ".jpg"
                    elif "html" in content_type: ext = ".html"
                    else:
                        url_path = clean_url.lower().split("?")[0]
                        if url_path.endswith(".pdf"): ext = ".pdf"
                        elif url_path.endswith(".png"): ext = ".png"
                        elif url_path.endswith(".webp"): ext = ".webp"
                        else: ext = ".jpg"

                    content = download_resp.content

                    if ext == ".html":
                        import re as _re
                        html_text = content.decode('utf-8', errors='ignore')
                        gphotos_match = _re.search(r'property="og:image"\s+content="([^"]+)"', html_text)
                        if "photos.app.goo.gl" in clean_url and gphotos_match:
                            raw_img_url = gphotos_match.group(1)
                            if "=" in raw_img_url: raw_img_url = raw_img_url.split("=")[0] + "=s0"
                            try:
                                img_resp = await client.get(raw_img_url, timeout=20.0, follow_redirects=True)
                                if img_resp.status_code == 200:
                                    content = img_resp.content
                                    ext = ".jpg"
                            except: pass

                        if ext == ".html":
                            import urllib.parse
                            encoded_url = urllib.parse.quote(clean_url, safe='')
                            ml_url = f"https://api.microlink.io/?url={encoded_url}&screenshot=true&meta=false"
                            try:
                                ml_resp = await client.get(ml_url, timeout=30.0)
                                if ml_resp.status_code == 200:
                                    ml_data = ml_resp.json()
                                    screenshot_url = ml_data.get("data", {}).get("screenshot", {}).get("url")
                                    if screenshot_url:
                                        img_resp = await client.get(screenshot_url, timeout=20.0)
                                        if img_resp.status_code == 200:
                                            content = img_resp.content
                                            ext = ".png"
                            except: pass

                    sha256_hash = hashlib.sha256(content).hexdigest()
                    filename = clean_url.split("/")[-1].split("?")[0] or f"comprovante{ext}"

                    if ext not in (".html", ".txt"):
                        tmp_dir = "/tmp/sharecom"
                        os.makedirs(tmp_dir, exist_ok=True)
                        tmp_file_path = os.path.join(tmp_dir, f"{uuid.uuid4()}{ext}")
                        with open(tmp_file_path, "wb") as f:
                            f.write(content)

            except Exception as e:
                print(f"DEBUG: Falha ao baixar URL: {e}.", flush=True)
                content = clean_url.encode('utf-8')
                sha256_hash = hashlib.sha256(content).hexdigest()
                ext = ".txt"

        elif note:
            content = note.encode('utf-8')
            sha256_hash = hashlib.sha256(content).hexdigest()
            filename = "note_comprovante.txt"
        else:
            raise HTTPException(status_code=400, detail="Nenhum dado enviado.")

        archive_receipt(db, uid, sha256_hash, filename, ext, content, status="received")
        db.commit()

        # Check for idempotency (per user) using receipt hash
        existing_expense = db.query(models.Expense).filter(
            models.Expense.receipt == sha256_hash,
            models.Expense.user_id == uid
        ).first()
        if existing_expense and not force:
            archive_receipt(db, uid, sha256_hash, filename, ext, content, status="duplicate")
            db.commit()
            if tmp_file_path and os.path.exists(tmp_file_path): os.remove(tmp_file_path)
            print(f"DEBUG: Idempotency hit for receipt hash: {sha256_hash} - Returning duplicate warning", flush=True)
            return JSONResponse(
                status_code=200, 
                content={
                    "status": "duplicate_warning",
                    "message": "Este comprovante já foi escaneado anteriormente.",
                    "idempotent": True,
                    "database_id": existing_expense.id,
                    "receipt_hash": sha256_hash,
                    "existing": {
                        "id": existing_expense.id,
                        "amount": float(existing_expense.amount) if existing_expense.amount else 0.0,
                        "merchant": existing_expense.merchant,
                        "date": existing_expense.date.isoformat() if existing_expense.date else None,
                    },
                    "ai_data": {
                        "total_amount": float(existing_expense.amount) if existing_expense.amount else 0.0,
                        "merchant_name": existing_expense.merchant,
                        "transaction_date": str(existing_expense.date),
                        "transaction_type": existing_expense.transaction_type,
                        "smart_category": existing_expense.category,
                        "payment_method": existing_expense.payment_method,
                        "destination_institution": existing_expense.destination_institution,
                        "transaction_id": existing_expense.transaction_id,
                        "masked_cpf": existing_expense.masked_cpf,
                        "description": existing_expense.description,
                    }
                }
            )

        raw_text = note or ""
        extracted_data = None
        ai_error = None

        try:
            import ocr_processor
            ocr_fallback_data, raw_text = ocr_processor.extract_transaction_data(content, ext, file_path=tmp_file_path)
            extracted_data = ocr_fallback_data

            extracted_amount_candidate = extracted_data.get("total_amount") if extracted_data else 0
            try:
                extracted_amount_candidate = float(extracted_amount_candidate or 0)
            except (TypeError, ValueError):
                extracted_amount_candidate = 0

            if extracted_amount_candidate <= 0:
                from ai_processor import analyze_receipt_with_ai
                extracted_data_ai, ai_error = await analyze_receipt_with_ai(content, ext, ocr_text=raw_text)
                if extracted_data_ai is not None:
                    extracted_data = extracted_data_ai
            if not extracted_data:
                extracted_data = {"merchant_name": f"Erro: {ai_error or 'Desconhecido'}"}
        finally:
            if tmp_file_path and os.path.exists(tmp_file_path): os.remove(tmp_file_path)

        is_receipt = extracted_data.get("is_financial_receipt", True)
        extracted_amount = extracted_data.get("total_amount") if extracted_data.get("total_amount") is not None else 0.0
        try:
            extracted_amount = float(extracted_amount)
        except (TypeError, ValueError):
            extracted_amount = 0.0

        merchant_name = str(extracted_data.get("merchant_name") or "").strip()
        extraction_failed = is_receipt and (
            extracted_amount <= 0
            or extracted_data.get("needs_manual_review")
            or not merchant_name
            or "OCR Falhou" in merchant_name
            or merchant_name.lower().startswith("erro")
        )
        if extraction_failed:
            archive_receipt(
                db,
                uid,
                sha256_hash,
                filename,
                ext,
                content,
                status="pending_review",
                raw_text=raw_text,
                error=ai_error or "OCR não extraiu valor confiável.",
            )
            db.commit()
            extracted_data = {
                **extracted_data,
                "total_amount": 0.0,
                "merchant_name": "Comprovante salvo para revisão",
                "smart_category": "Revisão manual",
                "payment_method": extracted_data.get("payment_method") or "Desconhecido",
                "transaction_type": transaction_type or extracted_data.get("transaction_type", "Outflow"),
                "transaction_date": schemas.datetime.now().isoformat(),
                "description": "Comprovante arquivado automaticamente. Revise e preencha os dados manualmente.",
                "needs_manual_review": True,
            }
            is_receipt = True
            extracted_amount = 0.0
            merchant_name = extracted_data["merchant_name"]
        else:
            archive_receipt(
                db,
                uid,
                sha256_hash,
                filename,
                ext,
                content,
                status="processed",
                raw_text=raw_text,
            )
            db.commit()

        date_val = extracted_data.get("transaction_date")
        date_obj = schemas.datetime.now()
        if date_val:
            try: date_obj = schemas.datetime.fromisoformat(date_val.replace(" ", "T"))
            except: pass

        category = extracted_data.get("smart_category") or ("Informativo" if not is_receipt else "Outros")
        amount = extracted_amount if is_receipt else 0.0
        merchant = merchant_name or ("Link" if not is_receipt else "Desconhecido")

        tx_id = extracted_data.get("transaction_id")
        if force:
            tx_id = None
        elif tx_id and str(tx_id).strip():
            tx_id = re.sub(r'[^A-Z0-9]', '', str(tx_id).upper())
            tx_id = tx_id.replace('O', '0').replace('I', '1').replace('S', '5')
            # Check if THIS user already has this transaction_id (idempotency)
            existing = db.query(models.Expense).filter(
                models.Expense.transaction_id == tx_id,
                models.Expense.user_id == uid
            ).first()
            if existing:
                if existing.deleted_at:
                    existing.deleted_at = None
                    db.commit()
                    cache_invalidate_all()
                return {"idempotent": True, "receipt_hash": existing.receipt, "database_id": existing.id}
        else:
            tx_id = None

        # IDEMPOTENCY CHECK: Verify transaction doesn't already exist before db.add()
        if tx_id:
            existing_by_tx_id = db.query(models.Expense).filter(
                models.Expense.transaction_id == tx_id,
                models.Expense.user_id == uid
            ).first()
            if existing_by_tx_id:
                print(f"DEBUG: Duplicate transaction_id detected during pre-insert check: {tx_id} for user {uid}", flush=True)
                return {
                    "status": "duplicate",
                    "message": "Transaction already exists",
                    "expense_id": existing_by_tx_id.id,
                    "amount": existing_by_tx_id.amount,
                    "idempotent": True
                }
        
        db_expense = models.Expense(
            user_id=uid,
            date=date_obj, amount=amount, category=category, merchant=merchant,
            description=extracted_data.get("description") or "Processado",
            receipt=sha256_hash, transaction_type=transaction_type or extracted_data.get("transaction_type", "Outflow"),
            payment_method=extracted_data.get("payment_method", "Desconhecido"),
            destination_institution=extracted_data.get("destination_institution"),
            transaction_id=tx_id, note=note
        )
        
        try:
            db.add(db_expense)
            db.commit()
            db.refresh(db_expense)
            cache_invalidate_all()
            print(f"DEBUG: New expense created successfully - ID: {db_expense.id}, TX_ID: {tx_id}", flush=True)
            status = "pending_review" if extracted_data.get("needs_manual_review") else "processed"
            return {"idempotent": False, "receipt_hash": sha256_hash, "ai_data": extracted_data, "database_id": db_expense.id, "status": status}
        except IntegrityError as e:
            print('DEBUG: IntegrityError, checking for existing BEFORE rollback', flush=True)
            try:
                # Query globally because SQLite unique constraint on transaction_id might be global
                existing = db.query(models.Expense).filter(models.Expense.transaction_id == tx_id).first()
                print(f'DEBUG: Found existing (before rollback): {existing}', flush=True)
            except Exception as query_err:
                print(f'DEBUG: Query before rollback failed (PendingRollbackError?): {query_err}', flush=True)
                db.rollback()
                existing = db.query(models.Expense).filter(models.Expense.transaction_id == tx_id).first()
                print(f'DEBUG: Found existing (after rollback fallback): {existing}', flush=True)
            else:
                db.rollback()

            if existing:
                cache_invalidate_all()
                return JSONResponse(
                    status_code=200, 
                    content={
                        "idempotent": True,
                        "database_id": existing.id,
                        "receipt_hash": existing.receipt,
                        "ai_data": {
                            "total_amount": float(existing.amount) if existing.amount else 0.0,
                            "merchant_name": existing.merchant,
                            "transaction_date": str(existing.date),
                            "transaction_type": existing.transaction_type,
                            "smart_category": existing.category,
                            "payment_method": existing.payment_method,
                            "destination_institution": existing.destination_institution,
                            "transaction_id": existing.transaction_id,
                            "masked_cpf": existing.masked_cpf,
                            "description": existing.description,
                        },
                        "status": "duplicate"
                    }
                )
            else:
                all_txs = db.query(models.Expense).filter(models.Expense.user_id == uid).all()
                raise HTTPException(status_code=500, detail=f'Duplicate error but record not found. Searched globally for: {tx_id}. All for user: {[t.transaction_id for t in all_txs]}')
        except Exception as db_error:
            db.rollback()
            print(f"DEBUG: Database error caught - Type: {type(db_error).__name__}, Message: {str(db_error)}", flush=True)
            return JSONResponse(status_code=400, content={'status': 'error', 'message': str(db_error)})

    except Exception as e:
        import traceback
        error_msg = f"Erro crítico: {str(e)}"
        print(f"ERROR: {error_msg}\n{traceback.format_exc()}", flush=True)
        raise HTTPException(status_code=500, detail=error_msg)

@app.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db), user: dict = Depends(verify_firebase_token)):
    uid = user.get("uid", "anonymous")
    db_expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.user_id == uid
    ).first()
    if not db_expense: raise HTTPException(status_code=404, detail="Gasto não encontrado ou acesso negado")
    db.delete(db_expense)
    db.commit()
    cache_invalidate_all()
    return {"message": "Deletado"}

@app.post("/expenses/clear-all")
def clear_all_expenses(db: Session = Depends(get_db), user: dict = Depends(verify_firebase_token), only_trash: bool = False):
    uid = user.get("uid", "anonymous")
    query = db.query(models.Expense).filter(models.Expense.user_id == uid)
    if only_trash: query = query.filter(models.Expense.deleted_at != None)
    num_deleted = query.delete(synchronize_session=False)
    db.commit()
    cache_invalidate_all()
    return {"message": f"{num_deleted} removidos"}
    
# =============================================================================
# GOALS ENDPOINTS
# =============================================================================
@app.get("/goals", response_model=List[schemas.Goal])
def read_goals(
    db: Session = Depends(get_db),
    user: dict = Depends(verify_firebase_token)
):
    uid = user.get("uid", "anonymous")
    return db.query(models.Goal).filter(models.Goal.user_id == uid).order_by(models.Goal.created_at.desc()).all()

@app.post("/goals", response_model=schemas.Goal)
def create_goal(
    goal: schemas.GoalCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(verify_firebase_token)
):
    uid = user.get("uid", "anonymous")
    db_goal = models.Goal(**goal.model_dump(), user_id=uid)
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return db_goal

@app.patch("/goals/{goal_id}", response_model=schemas.Goal)
def update_goal(
    goal_id: int,
    updates: dict,
    db: Session = Depends(get_db),
    user: dict = Depends(verify_firebase_token)
):
    uid = user.get("uid", "anonymous")
    db_goal = db.query(models.Goal).filter(models.Goal.id == goal_id, models.Goal.user_id == uid).first()
    if not db_goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    
    for key, value in updates.items():
        if hasattr(db_goal, key):
            setattr(db_goal, key, value)
            
    db.commit()
    db.refresh(db_goal)
    return db_goal

@app.delete("/goals/{goal_id}")
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(verify_firebase_token)
):
    uid = user.get("uid", "anonymous")
    db_goal = db.query(models.Goal).filter(models.Goal.id == goal_id, models.Goal.user_id == uid).first()
    if not db_goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    
    db.delete(db_goal)
    db.commit()
    return {"message": "Deletado"}


@app.get("/patterns")
def get_patterns(db: Session = Depends(get_db), user: dict = Depends(verify_firebase_token)):
    uid = user.get("uid", "anonymous")
    return db.query(models.PatternLog).filter(models.PatternLog.user_id == uid).order_by(models.PatternLog.timestamp.desc()).all()

import psutil
import os
from datetime import datetime

MEMORY_THRESHOLD_MB = 512

def get_memory_usage_mb():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

def check_database_connection():
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except Exception as e:
        return False, str(e)

@app.get("/api/health")
def health_check():
    start_time = datetime.utcnow()
    
    db_status, db_error = check_database_connection()
    memory_mb = get_memory_usage_mb()
    memory_healthy = memory_mb < MEMORY_THRESHOLD_MB
    
    healthy = db_status and memory_healthy
    
    response = {
        "status": "healthy" if healthy else "unhealthy",
        "timestamp": start_time.isoformat(),
        "checks": {
            "database": {
                "status": "up" if db_status else "down",
                "error": db_error,
            },
            "memory": {
                "status": "ok" if memory_healthy else "high",
                "usage_mb": round(memory_mb, 2),
                "threshold_mb": MEMORY_THRESHOLD_MB,
            },
        },
        "metrics": {
            "queries_per_request_avg": 0,
            "memory_trend": "stable",
            "error_rate": 0,
        },
    }
    
    status_code = 200 if healthy else 503
    return response, status_code

@app.get("/api/health/ready")
def readiness_check():
    db_status, _ = check_database_connection()
    if not db_status:
        return {"ready": False, "reason": "database not ready"}, 503
    return {"ready": True}, 200

@app.get("/api/health/live")
def liveness_check():
    return {"alive": True}, 200
