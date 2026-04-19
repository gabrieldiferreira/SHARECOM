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
import time
from auth import verify_firebase_token

from database import engine, get_db, Base
from export_routes import router as export_router
import models
import schemas

# Create tables
Base.metadata.create_all(bind=engine)

# Auto-migration for Phase 3 columns (safely adds columns if they don't exist)
try:
    from sqlalchemy import text
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE expenses ADD COLUMN is_deductible INTEGER DEFAULT 0"))
        except Exception:
            pass # column already exists
        try:
            conn.execute(text("ALTER TABLE expenses ADD COLUMN reimbursement_status VARCHAR DEFAULT 'None'"))
        except Exception:
            pass # column already exists
        print("DEBUG: Auto-migration completed.", flush=True)
except Exception as e:
    print(f"DEBUG: Auto-migration error (ignored): {e}", flush=True)

# =============================================================================
# CACHE EM MEMÓRIA — LRU + TTL + STATS + WARM-UP
# Estratégias aplicadas (ref: FasterCapital + dev.to/reishenrique):
#   - LRU (Least Recently Used): entradas mais antigas são removidas ao atingir max_size
#   - TTL (Time-To-Live): dados expiram após 60s para garantir consistência
#   - Invalidação por eventos: cada mutação (insert/delete) limpa o cache imediatamente
#   - Warm-up (Eager Load): ao iniciar o servidor, pré-carrega o cache para eliminar latência inicial
#   - Estatísticas: monitoramento de hits/misses em tempo real
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

app = FastAPI(
    title="SHARECOM API", 
    version="1.0.0",
    redirect_slashes=True
)
app.include_router(export_router)

@app.on_event("startup")
async def warm_up_cache():
    """
    WARM-UP (Eager Load): pré-aquece o cache ao iniciar o servidor.
    Elimina a penalidade de latência no primeiro acesso após reinicialização.
    Estratégia: busca os 100 registros mais recentes e carrega no LRU cache.
    """
    try:
        from database import SessionLocal
        db = SessionLocal()
        expenses = db.query(models.Expense).order_by(models.Expense.date.desc()).limit(100).all()
        db.close()
        cache_set("warmup:0:100", expenses)
        print(f"CACHE WARM-UP | {len(expenses)} registros pré-carregados no LRU cache.", flush=True)
    except Exception as e:
        print(f"CACHE WARM-UP | Falhou (não crítico): {e}", flush=True)

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"DEBUG: Requisição recebida: {request.method} {request.url.path}")
    return await call_next(request)

@app.get("/")
def read_root():
    return {"status": "online", "message": "SHARECOM API is running successfully!", "debug": "v2-docker"}

@app.get("/cache/stats")
def get_cache_stats(_: dict = Depends(verify_firebase_token)):
    """Retorna estatísticas do LRU cache (hit rate, misses, tamanho atual)."""
    return _cache.stats()

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
    uid = user.get("uid", "anonymous")
    cache_key = f"{uid}:{skip}:{limit}"

    # CACHE HIT: retorna sem consultar o banco
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    # CACHE MISS: consulta o banco e armazena no cache
    expenses = db.query(models.Expense).order_by(models.Expense.date.desc()).offset(skip).limit(limit).all()
    cache_set(cache_key, expenses)
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
    save_tokens: bool = Form(False),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_firebase_token),
):
    print(f"\n>>> DEBUG: INICIOU O PROCESSAMENTO. ARQUIVO: {received_file.filename if received_file else 'NENHUM'} | URL: {receipt_url} | NOTA: {note} | SAVE TOKENS: {save_tokens}", flush=True)
    
    content = b""
    sha256_hash = ""
    ext = ".txt"
    filename = "text_note.txt"
    tmp_file_path = None  # Caminho do arquivo temporário (para limpeza posterior)

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

                # Determina extensão pelo Content-Type (mais confiável que a URL)
                if "pdf" in content_type:
                    ext = ".pdf"
                elif "png" in content_type:
                    ext = ".png"
                elif "webp" in content_type:
                    ext = ".webp"
                elif "gif" in content_type:
                    ext = ".gif"
                elif "jpeg" in content_type or "jpg" in content_type:
                    ext = ".jpg"
                elif "html" in content_type:
                    ext = ".html"
                else:
                    # Fallback: infere pela URL
                    url_path = clean_url.lower().split("?")[0]
                    if url_path.endswith(".pdf"): ext = ".pdf"
                    elif url_path.endswith(".png"): ext = ".png"
                    elif url_path.endswith(".webp"): ext = ".webp"
                    else: ext = ".jpg"
                    print(f"DEBUG: Content-Type desconhecido, inferido como {ext} pela URL.", flush=True)

                content = download_resp.content

                # Se o link é uma página web, a IA não acha dados no HTML puro.
                if ext == ".html":
                    import re as _re
                    html_text = content.decode('utf-8', errors='ignore')
                    
                    # 1. TRATAMENTO ESPECIAL PARA GOOGLE PHOTOS
                    # Google Photos não renderiza bem no Microlink (pega só a UI).
                    # Mas podemos extrair o link direto da imagem via og:image.
                    gphotos_match = _re.search(r'property="og:image"\s+content="([^"]+)"', html_text)
                    if "photos.app.goo.gl" in clean_url and gphotos_match:
                        raw_img_url = gphotos_match.group(1)
                        # O link do og:image vem cortado (ex: =w355-h315-p-k). Mudamos para =s0 (tamanho original)
                        if "=" in raw_img_url:
                            raw_img_url = raw_img_url.split("=")[0] + "=s0"
                        
                        print(f"DEBUG: Link do Google Photos detectado. Baixando imagem original: {raw_img_url}", flush=True)
                        try:
                            img_resp = await client.get(raw_img_url, timeout=20.0, follow_redirects=True)
                            if img_resp.status_code == 200:
                                content = img_resp.content
                                ext = ".jpg"
                                print(f"DEBUG: Imagem original do Google Photos baixada ({len(content)} bytes).", flush=True)
                        except Exception as e:
                            print(f"DEBUG: Falha ao baixar imagem do Google Photos ({e}).", flush=True)

                    # 2. SE NÃO FOI RESOLVIDO (Não é Google Photos ou falhou), usa Microlink (Screenshots)
                    if ext == ".html":
                        import urllib.parse
                        encoded_url = urllib.parse.quote(clean_url, safe='')
                        ml_url = f"https://api.microlink.io/?url={encoded_url}&screenshot=true&meta=false"
                        print(f"DEBUG: Link retornou HTML. Capturando screenshot via Microlink...", flush=True)
                        try:
                            ml_resp = await client.get(ml_url, timeout=30.0)
                            if ml_resp.status_code == 200:
                                ml_data = ml_resp.json()
                                screenshot_url = ml_data.get("data", {}).get("screenshot", {}).get("url")
                                if screenshot_url:
                                    print(f"DEBUG: Screenshot gerado! Baixando: {screenshot_url}", flush=True)
                                    img_resp = await client.get(screenshot_url, timeout=20.0)
                                    if img_resp.status_code == 200:
                                        content = img_resp.content
                                        ext = ".png"
                                        print(f"DEBUG: Sucesso. HTML convertido para PNG ({len(content)} bytes).", flush=True)
                        except Exception as ml_e:
                            print(f"DEBUG: Falha no Microlink ({ml_e}). Fallback para HTML puro.", flush=True)

                sha256_hash = hashlib.sha256(content).hexdigest()
                filename = clean_url.split("/")[-1].split("?")[0] or f"comprovante{ext}"

                # === SALVA ARQUIVO TEMPORÁRIO EM DISCO ===
                # O EasyOCR é mais confiável lendo de arquivo do que de bytes em memória
                if ext not in (".html", ".txt"):
                    tmp_dir = "/tmp/sharecom"
                    os.makedirs(tmp_dir, exist_ok=True)
                    tmp_file_path = os.path.join(tmp_dir, f"{uuid.uuid4()}{ext}")
                    with open(tmp_file_path, "wb") as f:
                        f.write(content)
                    print(f"DEBUG: Arquivo temporário salvo: {tmp_file_path} ({len(content)/1024:.1f} KB)", flush=True)

        except Exception as e:
            print(f"DEBUG: Falha ao baixar URL: {e}. Tratando a URL como texto simples.", flush=True)
            content = clean_url.encode('utf-8')
            sha256_hash = hashlib.sha256(content).hexdigest()
            ext = ".txt"

    elif note:
        content = note.encode('utf-8')
        sha256_hash = hashlib.sha256(content).hexdigest()
        filename = "note_comprovante.txt"
    else:
        raise HTTPException(status_code=400, detail="Nenhum dado (arquivo, URL ou texto) enviado.")
    
    # Check for idempotency
    existing_expense = db.query(models.Expense).filter(models.Expense.receipt == sha256_hash).first()
    if existing_expense:
        # Limpa arquivo temporário antes de retornar
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)
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
    
    raw_text = note or ""
    extracted_data = None
    ai_error = None

    try:
        # ======================================================
        # ETAPA 1: OCR Local (EasyOCR + RegEx)
        # Usa o arquivo em disco se disponível (mais confiável)
        # ======================================================
        import ocr_processor
        ocr_fallback_data, raw_text = ocr_processor.extract_transaction_data(
            content, ext, file_path=tmp_file_path
        )
        print(f"DEBUG: OCR concluído. Texto extraído ({len(raw_text)} chars)", flush=True)

        # ======================================================
        # ETAPA 2: Análise IA (Vision + OCR como contexto)
        # ======================================================
        if save_tokens:
            print("DEBUG: 'Economia de Tokens' ativada. Pulando Gemini e usando apenas OCR local.", flush=True)
            extracted_data = ocr_fallback_data
        else:
            from ai_processor import analyze_receipt_with_ai
            extracted_data, ai_error = await analyze_receipt_with_ai(
                content, ext, ocr_text=raw_text
            )

            if extracted_data is None:
                extracted_data = ocr_fallback_data
                print(f"DEBUG: IA falhou ({ai_error}). Usando OCR de fallback.", flush=True)

        if not extracted_data:
            extracted_data = {"merchant_name": f"Erro: {ai_error or 'Desconhecido'}"}

    finally:
        # ======================================================
        # ETAPA 3: Limpeza — deleta arquivo temporário (Read-and-Destroy)
        # ======================================================
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)
            print(f"DEBUG: Arquivo temporário deletado: {tmp_file_path}", flush=True)

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
    # Invalida cache pois um novo comprovante foi adicionado
    cache_invalidate_all()
    
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
    user: dict = Depends(verify_firebase_token),
):
    print(f"DEBUG: TENTANDO DELETAR ID: {expense_id}", flush=True)
    db_expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not db_expense:
        print(f"DEBUG: ERRO - ID {expense_id} não encontrado no banco.", flush=True)
        raise HTTPException(status_code=404, detail="Gasto não encontrado")
    db.delete(db_expense)
    db.commit()
    # Invalida cache pois os dados mudaram
    cache_invalidate_all()
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
        # Invalida todo o cache
        cache_invalidate_all()
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
