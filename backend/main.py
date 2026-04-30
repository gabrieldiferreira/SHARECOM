from dotenv import load_dotenv
load_dotenv()  # Load .env before anything else

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from starlette.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import List
import os
import uuid
import hashlib
import re
import time
from auth import verify_firebase_token
import random

import firebase_admin
from firebase_admin import credentials, firestore, storage
import json

firebase_creds_str = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')
if firebase_creds_str:
    cred = credentials.Certificate(json.loads(firebase_creds_str))
else:
    cred = credentials.Certificate(os.getenv("FIREBASE_CREDENTIALS_PATH", "unidoc-493609-firebase-adminsdk-fbsvc-1380bed8ff.json"))

firebase_project_id = os.getenv("FIREBASE_PROJECT_ID") or getattr(cred, "project_id", None)
firebase_storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET") or (
    f"{firebase_project_id}.appspot.com" if firebase_project_id else ""
)
firebase_options = {}
if firebase_project_id:
    firebase_options["projectId"] = firebase_project_id
if firebase_storage_bucket:
    firebase_options["storageBucket"] = firebase_storage_bucket

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred, firebase_options or None)

fs = firestore.client()
bucket = storage.bucket() if firebase_storage_bucket else None

from export_routes import router as export_router
import schemas


app = FastAPI(
    title="SHARECOM API",
    version="1.0.0",
    redirect_slashes=True
)


def coerce_amount(value) -> float:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return 0.0
    return amount if amount > 0 else 0.0


def extract_amount_from_mapping(data: dict | None) -> float:
    if not data:
        return 0.0

    for key in ("total_amount", "amount", "value"):
        amount = coerce_amount(data.get(key))
        if amount > 0:
            return amount

    return 0.0


def with_amount_aliases(data: dict, amount: float) -> dict:
    return {
        **data,
        "amount": amount,
        "total_amount": amount,
        "value": amount,
    }


REVIEW_MERCHANT = "Comprovante salvo para revisão"
REVIEW_CATEGORY = "Revisão manual"


def is_review_placeholder_mapping(data: dict | None) -> bool:
    if not data:
        return False

    merchant = str(data.get("merchant_name") or data.get("merchant") or "").strip().lower()
    category = str(data.get("smart_category") or data.get("category") or "").strip().lower()
    return (
        bool(data.get("needs_manual_review"))
        or merchant == REVIEW_MERCHANT.lower()
        or category == REVIEW_CATEGORY.lower()
    )


def expense_to_ai_data(expense: dict, fallback: dict | None = None) -> dict:
    fallback = fallback or {}
    prefer_fallback = is_review_placeholder_mapping(expense) and not is_review_placeholder_mapping(fallback)
    primary = fallback if prefer_fallback else expense
    secondary = expense if prefer_fallback else fallback
    amount = extract_amount_from_mapping(primary) or extract_amount_from_mapping(secondary)
    return {
        **secondary,
        "total_amount": amount,
        "amount": amount,
        "value": amount,
        "merchant_name": primary.get("merchant") or primary.get("merchant_name") or secondary.get("merchant") or secondary.get("merchant_name") or "Desconhecido",
        "smart_category": primary.get("category") or primary.get("smart_category") or secondary.get("category") or secondary.get("smart_category") or "Outros",
        "transaction_date": primary.get("date") or primary.get("transaction_date") or secondary.get("date") or secondary.get("transaction_date") or schemas.datetime.now().isoformat(),
        "transaction_type": primary.get("transaction_type") or secondary.get("transaction_type", "Outflow"),
        "payment_method": primary.get("payment_method") or secondary.get("payment_method", "Desconhecido"),
        "description": primary.get("description") or secondary.get("description"),
        "destination_institution": primary.get("destination_institution") or secondary.get("destination_institution"),
        "transaction_id": primary.get("transaction_id") or secondary.get("transaction_id"),
        "masked_cpf": primary.get("masked_cpf") or secondary.get("masked_cpf"),
        "needs_manual_review": primary.get("needs_manual_review", secondary.get("needs_manual_review", False)),
    }


def build_expense_refresh_updates(
    extracted_data: dict,
    amount: float,
    date_obj,
    category: str,
    merchant: str,
    transaction_type: str,
    tx_id: str | None,
) -> dict:
    updates = {}

    if amount > 0:
        updates.update({
            "amount": amount,
            "total_amount": amount,
            "value": amount,
        })

    if merchant and merchant != REVIEW_MERCHANT:
        updates["merchant"] = merchant

    if category and category != REVIEW_CATEGORY:
        updates["category"] = category

    if date_obj:
        updates["date"] = date_obj if isinstance(date_obj, str) else date_obj.isoformat()

    description = extracted_data.get("description")
    if description and "arquivado automaticamente" not in str(description).lower():
        updates["description"] = description
    elif merchant and merchant != REVIEW_MERCHANT:
        updates["description"] = "Processado"

    updates["transaction_type"] = transaction_type
    updates["payment_method"] = extracted_data.get("payment_method", "Desconhecido")
    updates["destination_institution"] = extracted_data.get("destination_institution")
    updates["masked_cpf"] = extracted_data.get("masked_cpf")
    updates["transaction_id"] = tx_id
    updates["needs_manual_review"] = bool(extracted_data.get("needs_manual_review", False))

    return updates


def resolve_transaction_type(form_value: str | None, extracted_data: dict, raw_text: str = "") -> str:
    text = raw_text or ""
    if re.search(r'\b(PIX\s+RECEBIDO|RECEBIMENTO|RECEBIDO|DEP[OÓ]SITO\s+RECEBIDO|CR[EÉ]DITO\s+EM\s+CONTA)\b', text, re.IGNORECASE):
        return "Inflow"
    if re.search(r'\b(PIX\s+ENVIADO|ENVIADO|PAGAMENTO|PAGO|PAGADOR)\b', text, re.IGNORECASE):
        return "Outflow"
    return extracted_data.get("transaction_type") or form_value or "Outflow"

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

# Migração Automática foi removida (agora usando Firestore)

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
    uid: str,
    receipt_hash: str,
    filename: str,
    extension: str,
    content: bytes,
    status: str = "received",
    raw_text: str | None = None,
    error: str | None = None,
):
    doc_ref = fs.collection("receipt_archives").document(f"{uid}_{receipt_hash}")
    doc = doc_ref.get()
    
    if doc.exists:
        data = doc.to_dict()
        doc_ref.update({
            "filename": data.get("filename") or filename,
            "extension": data.get("extension") or extension,
            "status": status,
            "raw_text": raw_text if raw_text is not None else data.get("raw_text"),
            "error": error,
            "updated_at": firestore.SERVER_TIMESTAMP
        })
        return doc_ref.get().to_dict()

    archive_data = {
        "user_id": uid,
        "receipt_hash": receipt_hash,
        "filename": filename,
        "extension": extension,
        "status": status,
        "raw_text": raw_text,
        "error": error,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP
    }
    doc_ref.set(archive_data)
    return archive_data


# =============================================================================
# NEJIX FIREBASE CACHE & TRAINING PIPELINE
# =============================================================================
from datetime import datetime

async def upload_receipt_firebase(image_bytes: bytes, user_id: str, receipt_hash: str, bank: str) -> tuple[str, str]:
    if bucket is None:
        print("FIREBASE STORAGE: Bucket não configurado; pulando upload da imagem.", flush=True)
        return "", ""

    blob_original = bucket.blob(f"receipts/{user_id}/{receipt_hash}.jpg")
    blob_original.upload_from_string(image_bytes, content_type="image/jpeg")
    blob_original.make_public()
    original_url = blob_original.public_url

    blob_dataset = bucket.blob(f"nejix_dataset/{bank}/{receipt_hash}.jpg")
    blob_dataset.upload_from_string(image_bytes, content_type="image/jpeg")
    blob_dataset.make_public()
    dataset_url = blob_dataset.public_url

    print(f"FIREBASE STORAGE: Receipt uploaded -> {original_url}", flush=True)
    return original_url, dataset_url

async def check_receipt_cache(receipt_hash: str) -> dict:
    cache_ref = fs.collection("receipt_cache").document(receipt_hash)
    cache_doc = cache_ref.get()
    if cache_doc.exists:
        data = cache_doc.to_dict()
        cache_ref.update({"timesAccessed": firestore.Increment(1)})
        print(f"FIRESTORE CACHE HIT: {receipt_hash[:8]}... accessed {data.get('timesAccessed', 0) + 1}x", flush=True)
        return {"hit": True, "data": data}
    return {"hit": False}

async def save_to_firebase(receipt_hash: str, user_id: str, image_url: str, dataset_url: str, gemini_data: dict, tesseract_raw: str, bank: str, quality: str):
    cache_data = {
        "receiptHash": receipt_hash,
        "geminiExtracted": gemini_data,
        "tesseractRawText": tesseract_raw,
        "source": "gemini",
        "createdAt": firestore.SERVER_TIMESTAMP,
        "timesAccessed": 1,
        "bank": bank,
        "imageUrl": image_url,
        "imageQuality": quality,
        "userId": user_id
    }
    fs.collection("receipt_cache").document(receipt_hash).set(cache_data)

    nejix_data = {
        "receiptHash": receipt_hash,
        "imageUrl": dataset_url,
        "geminiGroundTruth": gemini_data,
        "userVerified": False,
        "userCorrections": {},
        "bank": bank,
        "imageQuality": quality,
        "usedForTraining": False,
        "nejixVersion": None,
        "createdAt": firestore.SERVER_TIMESTAMP
    }
    fs.collection("nejix_training_data").document(receipt_hash).set(nejix_data)
    await update_nejix_stats(bank)
    print(f"FIREBASE FIRESTORE: Cache + Nejix dataset saved", flush=True)

async def update_nejix_stats(bank: str):
    stats_ref = fs.collection("nejix_stats").document("current")
    stats_ref.set({
        "totalSamples": firestore.Increment(1),
        f"byBank.{bank}": firestore.Increment(1),
        "lastUpdated": firestore.SERVER_TIMESTAMP
    }, merge=True)
    
    total = stats_ref.get().to_dict().get("totalSamples", 0) if stats_ref.get().exists else 0
    milestones = {500: "Nejix v0.1", 2000: "Nejix v1.0", 5000: "Nejix v2.0"}
    next_milestone = next((f"{v} at {k} samples" for k, v in milestones.items() if total < k), "Nejix v3.0 - Production Ready")
    stats_ref.update({"nextMilestone": next_milestone})

async def track_gemini_usage(source: str):
    today = datetime.utcnow().strftime("%Y-%m-%d")
    usage_ref = fs.collection("gemini_usage").document(today)
    if source == "gemini":
        usage_ref.set({
            "callsMade": firestore.Increment(1),
            "estimatedCostUsd": firestore.Increment(0.001),
            "estimatedCostBrl": firestore.Increment(0.006)
        }, merge=True)
    else:
        usage_ref.set({"callsSavedByCache": firestore.Increment(1)}, merge=True)

def detect_bank_from_bytes(image_bytes: bytes) -> str:
    # Basic stub
    return "Desconhecido"

def assess_image_quality(image_bytes: bytes) -> str:
    return "High" if len(image_bytes) > 50000 else "Low"


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
    user: dict = Depends(verify_firebase_token),
    include_deleted: bool = False
):
    uid = user.get("uid", "anonymous")
    cache_key = f"{uid}:{skip}:{limit}:{include_deleted}"

    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    expenses_ref = fs.collection("expenses")
    query = expenses_ref.where("user_id", "==", uid)
    if not include_deleted:
        query = query.where("deleted_at", "==", None)
    
    # We load all to memory, sort, and slice because composite index might not exist
    docs = query.stream()
    expenses = []
    for doc in docs:
        d = doc.to_dict()
        if "id" not in d: d["id"] = int(doc.id)
        amount = extract_amount_from_mapping(d)
        d = with_amount_aliases(d, amount)
        if not d.get("scanned_at"):
            d["scanned_at"] = doc.create_time.isoformat() if doc.create_time else d.get("date")
        if "date" in d and hasattr(d["date"], "isoformat"):
            d["date"] = d["date"].isoformat()
        if "scanned_at" in d and hasattr(d["scanned_at"], "isoformat"):
            d["scanned_at"] = d["scanned_at"].isoformat()
        if "deleted_at" in d and hasattr(d["deleted_at"], "isoformat"):
            d["deleted_at"] = d["deleted_at"].isoformat()
        expenses.append(d)
        
    expenses.sort(key=lambda x: x.get("scanned_at") or x.get("date", ""), reverse=True)
    expenses = expenses[skip:skip+limit]

    cache_set(cache_key, expenses)
    return expenses

@app.post("/expenses", response_model=schemas.Expense)
def create_expense(
    expense: schemas.ExpenseCreate,
    user: dict = Depends(verify_firebase_token),
):
    uid = user.get("uid", "anonymous")
    import random
    from datetime import datetime
    new_id = random.randint(100000000, 999999999)
    expense_data = expense.model_dump()
    expense_data = with_amount_aliases(expense_data, coerce_amount(expense_data.get("amount")))
    expense_data["id"] = new_id
    expense_data["user_id"] = uid
    now = datetime.utcnow()
    if not expense_data.get("date"):
        expense_data["date"] = now
    if not expense_data.get("scanned_at"):
        expense_data["scanned_at"] = now
    fs.collection("expenses").document(str(new_id)).set(expense_data)
    cache_invalidate_all()
    return expense_data

@app.patch("/expenses/{expense_id}", response_model=schemas.Expense)
def update_expense(
    expense_id: int,
    updates: dict,
    user: dict = Depends(verify_firebase_token),
):
    uid = user.get("uid", "anonymous")
    doc_ref = fs.collection("expenses").document(str(expense_id))
    doc = doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != uid:
        raise HTTPException(status_code=404, detail="Gasto não encontrado ou acesso negado")
    
    from datetime import datetime as dt
    for key, value in updates.items():
        if key == 'deleted_at' and value:
            try:
                if isinstance(value, str):
                    updates[key] = dt.fromisoformat(value.replace('Z', ''))
            except:
                updates[key] = dt.utcnow()
                
    doc_ref.update(updates)
    cache_invalidate_all()
    updated_doc = doc_ref.get().to_dict()
    if "id" not in updated_doc: updated_doc["id"] = expense_id
    return updated_doc

@app.post("/process-ata")
@app.post("/receipts")
async def process_ata(
    received_file: UploadFile = File(None),
    receipt_url: str = Form(None),
    note: str = Form(None),
    transaction_type: str = Form(None),
    force: bool = Form(False),
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

        archive_receipt(uid, sha256_hash, filename, ext, content, status="received")
        

        # Check for idempotency (per user) using receipt hash against FIREBASE
        cache_result = await check_receipt_cache(sha256_hash)
        if cache_result['hit'] and not force:
            cached_data = cache_result['data']
            cached_existing = cached_data.get('geminiExtracted', {})
            if extract_amount_from_mapping(cached_existing) > 0 and not is_review_placeholder_mapping(cached_existing):
                if tmp_file_path and os.path.exists(tmp_file_path): os.remove(tmp_file_path)
                return JSONResponse(
                    status_code=200,
                    content={
                        "status": "duplicate_warning",
                        "message": f"Este comprovante já foi escaneado {cached_data.get('timesAccessed', 1)}x anteriormente. Os dados estão salvos no Firebase e serão usados para treinar o Nejix.",
                        "existing": cached_existing,
                        "times_scanned": cached_data.get('timesAccessed', 1),
                        "receipt_hash": sha256_hash,
                        "can_continue": True
                    }
                )
            print("DEBUG: Cache hit ignorado porque dados cached ainda exigem revisão; reprocessando OCR.", flush=True)

        raw_text = note or ""
        extracted_data = None
        ai_error = None

        try:
            import ocr_processor
            ocr_fallback_data, raw_text = ocr_processor.extract_transaction_data(content, ext, file_path=tmp_file_path)
            extracted_data = ocr_fallback_data

            extracted_amount_candidate = extract_amount_from_mapping(extracted_data)

            if extracted_amount_candidate <= 0:
                bank = detect_bank_from_bytes(content)
                quality = assess_image_quality(content)
                source = 'gemini'
                
                if cache_result['hit']:
                    print('NEJIX HINT: Using Firebase cached Gemini data', flush=True)
                    extracted_data = cache_result['data'].get('geminiExtracted', {})
                    source = 'cache_enhanced'
                    
                    if force:
                        print(f"FORCE SUBMIT: User chose to add duplicate receipt {sha256_hash[:8]}...")
                        fs.collection('receipt_cache').document(sha256_hash).update({'timesAccessed': firestore.Increment(1)})
                        fs.collection('nejix_training_data').document(sha256_hash).update({'timesSubmitted': firestore.Increment(1), 'lastSubmittedAt': firestore.SERVER_TIMESTAMP})
                        source = 'cache_forced'
                else:
                    from ai_processor import analyze_receipt_with_ai
                    extracted_data_ai, ai_error = await analyze_receipt_with_ai(content, ext, ocr_text=raw_text)
                    if extracted_data_ai is not None:
                        extracted_data = extracted_data_ai
                    if not extracted_data:
                        extracted_data = {"merchant_name": f"Erro: {ai_error or 'Desconhecido'}"}

                if not cache_result['hit']:
                    image_url = ""
                    dataset_url = ""
                    try:
                        image_url, dataset_url = await upload_receipt_firebase(content, uid, sha256_hash, bank)
                    except Exception as fb_err:
                        print(f"DEBUG: Firebase upload failed: {fb_err}", flush=True)

                    try:
                        await save_to_firebase(sha256_hash, uid, image_url, dataset_url, extracted_data, raw_text, bank, quality)
                    except Exception as fb_err:
                        print(f"DEBUG: Firebase cache save failed: {fb_err}", flush=True)
                
                await track_gemini_usage(source)
        finally:
            if tmp_file_path and os.path.exists(tmp_file_path): os.remove(tmp_file_path)

        is_receipt = extracted_data.get("is_financial_receipt", True)
        extracted_amount = extract_amount_from_mapping(extracted_data)

        merchant_name = str(extracted_data.get("merchant_name") or "").strip()
        resolved_transaction_type = resolve_transaction_type(transaction_type, extracted_data, raw_text)
        extracted_data = {**extracted_data, "transaction_type": resolved_transaction_type}
        extraction_failed = is_receipt and (
            extracted_amount <= 0
            or extracted_data.get("needs_manual_review")
            or not merchant_name
            or "OCR Falhou" in merchant_name
            or merchant_name.lower().startswith("erro")
        )
        if extraction_failed:
            archive_receipt(
                uid,
                sha256_hash,
                filename,
                ext,
                content,
                status="pending_review",
                raw_text=raw_text,
                error=ai_error or "OCR não extraiu valor confiável.",
            )
            
            extracted_data = {
                **extracted_data,
                "total_amount": extracted_amount,
                "amount": extracted_amount,
                "value": extracted_amount,
                "merchant_name": "Comprovante salvo para revisão",
                "smart_category": "Revisão manual",
                "payment_method": extracted_data.get("payment_method") or "Desconhecido",
                "transaction_type": resolved_transaction_type,
                "transaction_date": schemas.datetime.now().isoformat(),
                "description": "Comprovante arquivado automaticamente. Revise e preencha os dados manualmente.",
                "needs_manual_review": True,
            }
            is_receipt = True
            merchant_name = extracted_data["merchant_name"]
        else:
            archive_receipt(
                uid,
                sha256_hash,
                filename,
                ext,
                content,
                status="processed",
                raw_text=raw_text,
            )
            

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
            docs = fs.collection("expenses").where("user_id", "==", uid).where("transaction_id", "==", tx_id).limit(1).get()
            if docs:
                existing = docs[0].to_dict()
                existing_id = existing.get("id") or int(docs[0].id)
                persisted_amount = extract_amount_from_mapping(existing)
                updates = {}
                if amount > 0 and persisted_amount != amount:
                    existing = with_amount_aliases(existing, amount)
                    updates.update({
                        "amount": amount,
                        "total_amount": amount,
                        "value": amount,
                    })
                if is_review_placeholder_mapping(existing) and not is_review_placeholder_mapping(extracted_data):
                    updates.update(build_expense_refresh_updates(
                        extracted_data,
                        amount,
                        date_obj,
                        category,
                        merchant,
                        resolved_transaction_type,
                        tx_id,
                    ))
                if existing.get("deleted_at"):
                    updates["deleted_at"] = None
                if updates:
                    fs.collection("expenses").document(docs[0].id).update(updates)
                    existing.update(updates)
                    cache_invalidate_all()
                cache_invalidate_all()
                return {
                    "idempotent": True,
                    "receipt_hash": existing.get("receipt") or sha256_hash,
                    "ai_data": expense_to_ai_data(existing, extracted_data),
                    "database_id": existing_id,
                    "scanned_at": existing.get("scanned_at"),
                    "status": "processed",
                }
        else:
            tx_id = None

        # IDEMPOTENCY CHECK: Verify transaction doesn't already exist before db.add()
        if tx_id:
            docs = fs.collection("expenses").where("user_id", "==", uid).where("transaction_id", "==", tx_id).limit(1).get()
            if docs:
                existing_by_tx_id = docs[0].to_dict()
                existing_id = existing_by_tx_id.get("id") or int(docs[0].id)
                persisted_amount = extract_amount_from_mapping(existing_by_tx_id)
                updates = {}
                if amount > 0 and persisted_amount != amount:
                    existing_by_tx_id = with_amount_aliases(existing_by_tx_id, amount)
                    updates.update({
                        "amount": amount,
                        "total_amount": amount,
                        "value": amount,
                    })
                if is_review_placeholder_mapping(existing_by_tx_id) and not is_review_placeholder_mapping(extracted_data):
                    updates.update(build_expense_refresh_updates(
                        extracted_data,
                        amount,
                        date_obj,
                        category,
                        merchant,
                        resolved_transaction_type,
                        tx_id,
                    ))
                if updates:
                    fs.collection("expenses").document(docs[0].id).update(updates)
                    existing_by_tx_id.update(updates)
                    cache_invalidate_all()
                cache_invalidate_all()
                print(f"DEBUG: Duplicate transaction_id detected during pre-insert check: {tx_id} for user {uid}", flush=True)
                return {
                    "status": "duplicate",
                    "message": "Transaction already exists",
                    "expense_id": existing_id,
                    "database_id": existing_id,
                    "amount": extract_amount_from_mapping(existing_by_tx_id),
                    "total_amount": extract_amount_from_mapping(existing_by_tx_id),
                    "value": extract_amount_from_mapping(existing_by_tx_id),
                    "ai_data": expense_to_ai_data(existing_by_tx_id, extracted_data),
                    "receipt_hash": existing_by_tx_id.get("receipt") or sha256_hash,
                    "scanned_at": existing_by_tx_id.get("scanned_at"),
                    "idempotent": True,
                }
        
        try:
            import random
            from datetime import datetime
            new_id = random.randint(100000000, 999999999)
            scanned_at = datetime.utcnow().isoformat()
            db_expense = {
                "id": new_id,
                "user_id": uid,
                "date": date_obj if isinstance(date_obj, str) else date_obj.isoformat() if hasattr(date_obj, 'isoformat') else datetime.utcnow().isoformat(),
                "scanned_at": scanned_at,
                "amount": amount,
                "category": category,
                "merchant": merchant,
                "description": extracted_data.get("description") or "Processado",
                "receipt": sha256_hash,
                "transaction_type": resolved_transaction_type,
                "payment_method": extracted_data.get("payment_method", "Desconhecido"),
                "destination_institution": extracted_data.get("destination_institution"),
                "transaction_id": tx_id,
                "masked_cpf": extracted_data.get("masked_cpf"),
                "needs_manual_review": extracted_data.get("needs_manual_review", False),
                "note": note,
                "deleted_at": None
            }
            db_expense = with_amount_aliases(db_expense, amount)
            fs.collection("expenses").document(str(new_id)).set(db_expense)
            cache_invalidate_all()
            print(f"DEBUG: New expense created successfully - ID: {new_id}, TX_ID: {tx_id}", flush=True)
            status = "pending_review" if extracted_data.get("needs_manual_review") else "processed"
            return {"idempotent": False, "receipt_hash": sha256_hash, "ai_data": extracted_data, "database_id": new_id, "scanned_at": scanned_at, "status": status}
        except Exception as fb_error:
            print(f"DEBUG: Firestore error caught - Type: {type(fb_error).__name__}, Message: {str(fb_error)}", flush=True)
            return JSONResponse(status_code=400, content={'status': 'error', 'message': str(fb_error)})

    except Exception as e:
        import traceback
        error_msg = f"Erro crítico: {str(e)}"
        print(f"ERROR: {error_msg}\n{traceback.format_exc()}", flush=True)
        raise HTTPException(status_code=500, detail=error_msg)

@app.delete("/expenses/{expense_id}")
def delete_expense(
    expense_id: int,
    permanent: bool = False,
    user: dict = Depends(verify_firebase_token),
):
    uid = user.get("uid", "anonymous")
    doc_ref = fs.collection("expenses").document(str(expense_id))
    doc = doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != uid:
        raise HTTPException(status_code=404, detail="Gasto não encontrado ou acesso negado")
    
    if permanent:
        doc_ref.delete()
        status = "deleted"
    else:
        from datetime import datetime
        doc_ref.update({"deleted_at": datetime.utcnow().isoformat()})
        status = "soft_deleted"
        
    cache_invalidate_all()
    return {"status": status}

@app.patch("/expenses/{expense_id}/restore")
def restore_expense(expense_id: int, user: dict = Depends(verify_firebase_token)):
    uid = user.get("uid", "anonymous")
    doc_ref = fs.collection("expenses").document(str(expense_id))
    doc = doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != uid:
        raise HTTPException(status_code=404, detail="Gasto não encontrado ou acesso negado")
        
    doc_ref.update({"deleted_at": None})
    cache_invalidate_all()
    return {"status": "restored"}

@app.post("/expenses/clear-all")
def clear_all_expenses(user: dict = Depends(verify_firebase_token), only_trash: bool = False):
    uid = user.get("uid", "anonymous")
    docs = fs.collection("expenses").where("user_id", "==", uid).stream()
    batch = fs.batch()
    count = 0
    for doc in docs:
        d = doc.to_dict()
        if only_trash and not d.get("deleted_at"):
            continue
        batch.delete(doc.reference)
        count += 1
    if count > 0:
        batch.commit()
    cache_invalidate_all()
    return {"message": f"{count} removidos"}
    
# =============================================================================
# GOALS ENDPOINTS
# =============================================================================
@app.get("/goals", response_model=List[schemas.Goal])
def read_goals(
    user: dict = Depends(verify_firebase_token)
):
    uid = user.get("uid", "anonymous")
    docs = fs.collection("goals").where("user_id", "==", uid).stream()
    goals = []
    for doc in docs:
        d = doc.to_dict()
        if "id" not in d: d["id"] = int(doc.id)
        goals.append(d)
    goals.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return goals

@app.post("/goals", response_model=schemas.Goal)
def create_goal(
    goal: schemas.GoalCreate,
    user: dict = Depends(verify_firebase_token)
):
    uid = user.get("uid", "anonymous")
    import random
    from datetime import datetime
    new_id = random.randint(100000000, 999999999)
    goal_data = goal.model_dump()
    goal_data["id"] = new_id
    goal_data["user_id"] = uid
    if not goal_data.get("created_at"):
        goal_data["created_at"] = datetime.utcnow().isoformat()
    fs.collection("goals").document(str(new_id)).set(goal_data)
    return goal_data

@app.patch("/goals/{goal_id}", response_model=schemas.Goal)
def update_goal(
    goal_id: int,
    updates: dict,
    user: dict = Depends(verify_firebase_token)
):
    uid = user.get("uid", "anonymous")
    doc_ref = fs.collection("goals").document(str(goal_id))
    doc = doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != uid:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    
    doc_ref.update(updates)
    updated_doc = doc_ref.get().to_dict()
    if "id" not in updated_doc: updated_doc["id"] = goal_id
    return updated_doc

@app.delete("/goals/{goal_id}")
def delete_goal(
    goal_id: int,
    user: dict = Depends(verify_firebase_token)
):
    uid = user.get("uid", "anonymous")
    doc_ref = fs.collection("goals").document(str(goal_id))
    doc = doc_ref.get()
    if not doc.exists or doc.to_dict().get("user_id") != uid:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    
    doc_ref.delete()
    return {"message": "Deletado"}


@app.get("/patterns")
def get_patterns(user: dict = Depends(verify_firebase_token)):
    uid = user.get("uid", "anonymous")
    docs = fs.collection("patterns").where("user_id", "==", uid).stream()
    patterns = [d.to_dict() for d in docs]
    patterns.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return patterns

import psutil
import os
from datetime import datetime

MEMORY_THRESHOLD_MB = 512

def get_memory_usage_mb():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

def check_database_connection():
    try:
        # Check Firestore connection
        fs.collection("health").document("check").get()
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

@app.get("/test-gemini")
async def test_gemini():
    import google.generativeai as genai
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"status": "error", "message": "GEMINI_API_KEY not found in environment variables. Add GEMINI_API_KEY=your_key to backend/.env"}
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content("Say hello in Portuguese")
        return {"status": "ok", "api_key_prefix": api_key[:8] + "...", "response": response.text}
    except Exception as e:
        return {"status": "error", "api_key_prefix": api_key[:8] + "...", "message": str(e)}


# =============================================================================
# COST MONITORING AND NEJIX STATS ENDPOINT
# =============================================================================

@app.get("/nejix/stats")
async def get_nejix_stats(
    user: dict = Depends(verify_firebase_token),
):
    stats_doc = fs.collection('nejix_stats').document('current').get()
    stats = stats_doc.to_dict() if stats_doc.exists else {}
    
    from datetime import datetime
    today = datetime.utcnow().strftime('%Y-%m-%d')
    usage_doc = fs.collection('gemini_usage').document(today).get()
    usage = usage_doc.to_dict() if usage_doc.exists else {}
    
    return {
        'nejix': stats,
        'today_gemini_calls': usage.get('callsMade', 0),
        'today_calls_saved': usage.get('callsSavedByCache', 0),
        'today_cost_usd': usage.get('estimatedCostUsd', 0.0),
        'today_cost_brl': usage.get('estimatedCostBrl', 0.0)
    }
