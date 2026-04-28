import os
import re
import fitz  # PyMuPDF
import io
import xml.etree.ElementTree as ET
from dotenv import load_dotenv

# Ensure .env values override empty shell vars
load_dotenv(override=True)

PDF_MAX_PAGES = int(os.environ.get("PDF_MAX_PAGES", "2"))
PDF_MAX_CHARS = int(os.environ.get("PDF_MAX_CHARS", "4000"))
OCR_CONFIDENCE_THRESHOLD = float(os.environ.get("OCR_CONFIDENCE_THRESHOLD", "0.45"))

RAPIDOCR_ENGINE = None
def get_rapidocr_engine():
    global RAPIDOCR_ENGINE
    if RAPIDOCR_ENGINE is None:
        try:
            from rapidocr import RapidOCR
            print("DEBUG: Inicializando RapidOCR ONNX...", flush=True)
            RAPIDOCR_ENGINE = RapidOCR()
        except Exception as e:
            print(f"Failed to initialize RapidOCR: {e}", flush=True)
    return RAPIDOCR_ENGINE


# =============================================================================
# IMAGE PREPROCESSING — OpenCV pipeline for maximum OCR accuracy
# =============================================================================

def _preprocess_image(image_bytes: bytes) -> bytes:
    """
    Full OpenCV preprocessing pipeline applied as a fallback before RapidOCR:
    1. Upscale to at least 2400px on longest side (3x sharpness gain)
    2. Grayscale conversion
    3. Shadow / uneven illumination removal via large-kernel background subtraction
    4. Gaussian denoising
    5. Adaptive binarization (Otsu + Gaussian thresholding)
    6. Deskew (correct up to ±15° rotation)

    Falls back to original bytes if OpenCV is not available.
    """
    try:
        import cv2
        import numpy as np

        # Decode
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            print("DEBUG: cv2.imdecode returned None — skipping preprocessing")
            return image_bytes

        h, w = img.shape[:2]
        print(f"DEBUG: [preprocess] Original size: {w}x{h}", flush=True)

        # 1. Upscale — target longest side = 2400px (improves fine-print legibility)
        max_side = max(h, w)
        if max_side < 2400:
            scale = 2400 / max_side
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
            print(f"DEBUG: [preprocess] Upscaled to {img.shape[1]}x{img.shape[0]}", flush=True)

        # 2. Grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 3. Shadow removal — subtract blurred background (large Gaussian kernel)
        #    Effective on phone photos with uneven lighting / shadows
        blur_bg = cv2.GaussianBlur(gray, (95, 95), 0)
        # Invert background and add offset to normalize brightness
        shadow_free = cv2.addWeighted(gray, 1.5, blur_bg, -0.5, 0)
        shadow_free = np.clip(shadow_free, 0, 255).astype(np.uint8)

        # 4. Denoise (fast Non-Local Means for grayscale)
        denoised = cv2.fastNlMeansDenoising(shadow_free, h=10, templateWindowSize=7, searchWindowSize=21)

        # 5. Adaptive binarization — handles local contrast differences
        #    Otsu global threshold first; if std dev is high, use adaptive
        _, otsu = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        adaptive = cv2.adaptiveThreshold(
            denoised, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=31, C=10
        )
        # Blend: mostly adaptive (80%) + otsu (20%) — adaptive handles local variation better
        blended = cv2.addWeighted(adaptive, 0.8, otsu, 0.2, 0).astype(np.uint8)

        # 6. Deskew — detect dominant text angle and rotate to horizontal
        blended = _deskew(blended)

        # Encode back to JPEG bytes for RapidOCR
        _, encoded = cv2.imencode('.jpg', blended, [cv2.IMWRITE_JPEG_QUALITY, 97])
        result_bytes = encoded.tobytes()
        print(f"DEBUG: [preprocess] Done. Output size: {len(result_bytes)} bytes", flush=True)
        return result_bytes

    except ImportError:
        print("DEBUG: [preprocess] OpenCV not available — using raw image", flush=True)
        return image_bytes
    except Exception as e:
        print(f"DEBUG: [preprocess] Error in preprocessing: {e} — using raw image", flush=True)
        return image_bytes


def _deskew(image):
    """
    Detects text skew angle using Hough line transform and corrects it.
    Only corrects angles within ±15° to avoid false positives.
    """
    try:
        import cv2
        import numpy as np

        # Edge detection on inverted image (text is dark on white after binarization)
        inv = cv2.bitwise_not(image)
        edges = cv2.Canny(inv, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=100, maxLineGap=10)

        if lines is None or len(lines) == 0:
            return image

        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            if x2 - x1 == 0:
                continue
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            # Only consider near-horizontal lines (text lines)
            if -15 < angle < 15:
                angles.append(angle)

        if not angles:
            return image

        median_angle = float(np.median(angles))
        print(f"DEBUG: [deskew] Detected skew angle: {median_angle:.2f}°", flush=True)

        # Skip tiny corrections (< 0.5°) to avoid unnecessary resampling
        if abs(median_angle) < 0.5:
            return image

        h, w = image.shape
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        rotated = cv2.warpAffine(
            image, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE
        )
        return rotated
    except Exception as e:
        print(f"DEBUG: [deskew] Failed: {e}", flush=True)
        return image


def _preprocess_pdf_page(page) -> bytes:
    """
    Renders a PDF page at 3x scale (vs previous 2x) and applies
    the full image preprocessing pipeline.
    """
    pix = page.get_pixmap(matrix=fitz.Matrix(3, 3))  # 3x = ~216 DPI effective
    raw_bytes = pix.tobytes("jpeg")
    return _preprocess_image(raw_bytes)


# =============================================================================
# SVG TEXT EXTRACTION
# =============================================================================

def _extract_svg_text(file_bytes: bytes) -> str:
    """Extrai texto de SVGs sem depender de rasterização."""
    try:
        decoded = file_bytes.decode("utf-8", errors="ignore")
        root = ET.fromstring(decoded)
        texts: list[str] = []

        for elem in root.iter():
            tag_name = elem.tag.split("}")[-1].lower()
            if tag_name in {"text", "tspan", "title", "desc"}:
                content = " ".join("".join(elem.itertext()).split())
                if content:
                    texts.append(content)

        if not texts:
            stripped = re.sub(r"<[^>]+>", " ", decoded)
            stripped = re.sub(r"\s+", " ", stripped).strip()
            return stripped[:PDF_MAX_CHARS]

        unique_texts = list(dict.fromkeys(texts))
        return "\n".join(unique_texts)[:PDF_MAX_CHARS]
    except Exception as e:
        print(f"DEBUG: Falha ao extrair texto do SVG: {e}", flush=True)
        return ""


# =============================================================================
# INPUT PREPARATION — routes each file type to the right extraction path
# =============================================================================

def _prepare_input(file_bytes: bytes, extension: str) -> tuple[str, str | bytes]:
    ext = extension.lower()

    if ext == ".html":
        import re as _re
        html_text = file_bytes.decode('utf-8', errors='ignore')
        plain_text = _re.sub(r'<[^>]+>', ' ', html_text)
        plain_text = _re.sub(r'\s+', ' ', plain_text).strip()
        return "pdf_text", plain_text

    if ext == ".pdf":
        pdf_stream = io.BytesIO(file_bytes)
        doc = fitz.open(stream=pdf_stream, filetype="pdf")
        max_pages = min(PDF_MAX_PAGES, len(doc))

        text_context = "".join(doc[i].get_text() for i in range(max_pages))
        text_context = " ".join(text_context.split())[:PDF_MAX_CHARS]

        if len(text_context) < 50:
            print("PDF has little text — rendering page at 3x for Vision OCR + preprocessing.")
            page = doc[0]
            image_bytes = _preprocess_pdf_page(page)
            doc.close()
            return "image", image_bytes

        doc.close()
        return "pdf_text", text_context

    if ext == ".svg":
        svg_text = _extract_svg_text(file_bytes)
        return "pdf_text", svg_text

    # All image types — OCR will try raw first, then preprocessed fallback.
    return "image", file_bytes


# =============================================================================
# RAPIDOCR — PaddleOCR ONNX runtime with optional preprocessing fallback
# =============================================================================

def _decode_image_for_ocr(image_bytes: bytes):
    try:
        import cv2
        import numpy as np

        nparr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as e:
        print(f"DEBUG: Falha ao decodificar imagem para OCR: {e}", flush=True)
        return None


def _rapidocr_to_lines(result) -> tuple[list[tuple[float, float, str, float]], float]:
    txts_raw = getattr(result, "txts", None)
    scores_raw = getattr(result, "scores", None)
    boxes_raw = getattr(result, "boxes", None)

    txts = list(txts_raw) if txts_raw is not None else []
    scores = list(scores_raw) if scores_raw is not None else []
    boxes = list(boxes_raw) if boxes_raw is not None else []

    lines: list[tuple[float, float, str, float]] = []
    accepted_scores: list[float] = []

    for idx, text in enumerate(txts):
        text = str(text).strip()
        if not text:
            continue

        score = float(scores[idx]) if idx < len(scores) and scores[idx] is not None else 1.0
        if score < OCR_CONFIDENCE_THRESHOLD:
            continue

        box = boxes[idx] if idx < len(boxes) else None
        try:
            xs = [float(point[0]) for point in box]
            ys = [float(point[1]) for point in box]
            y_pos = sum(ys) / len(ys)
            x_pos = sum(xs) / len(xs)
        except Exception:
            y_pos = float(idx)
            x_pos = 0.0

        lines.append((y_pos, x_pos, text, score))
        accepted_scores.append(score)

    avg_score = sum(accepted_scores) / len(accepted_scores) if accepted_scores else 0.0
    return lines, avg_score


def _run_rapidocr(engine, image_input, label: str) -> tuple[str, float, int]:
    try:
        result = engine(image_input)
        lines, avg_score = _rapidocr_to_lines(result)
        lines.sort(key=lambda item: (round(item[0] / 12) * 12, item[1]))
        text = "\n".join(line[2] for line in lines)
        print(
            f"DEBUG: RapidOCR {label} concluído. Caracteres: {len(text)}, "
            f"Blocos: {len(lines)}, Confiança média: {avg_score:.2f}",
            flush=True
        )
        return text, avg_score, len(lines)
    except Exception as e:
        print(f"DEBUG: ERRO no RapidOCR {label}: {e}", flush=True)
        return "", 0.0, 0


def _extract_text_rapidocr(image_bytes: bytes, file_path: str = None) -> str:
    """
    Runs RapidOCR/PaddleOCR ONNX. It tries the original image first because
    PaddleOCR generally handles natural document photos better than binarized
    images, then falls back to the existing preprocessing pipeline when needed.
    """
    engine = get_rapidocr_engine()
    if not engine:
        print("DEBUG: ERRO - Falha ao obter o engine do RapidOCR.")
        return ""

    try:
        if file_path and os.path.exists(file_path):
            print(f"DEBUG: RapidOCR lendo de arquivo: {file_path}", flush=True)
            with open(file_path, "rb") as f:
                raw_bytes = f.read()
        else:
            print(f"DEBUG: RapidOCR lendo de bytes ({len(image_bytes)} bytes)", flush=True)
            raw_bytes = image_bytes

        raw_img = _decode_image_for_ocr(raw_bytes)
        raw_text, raw_score, raw_blocks = _run_rapidocr(engine, raw_img if raw_img is not None else raw_bytes, "raw")

        if len(raw_text.strip()) >= 20 and raw_blocks >= 3:
            print(f"--- DEBUG OCR (RapidOCR raw) ---\n{raw_text}\n-----------------", flush=True)
            return raw_text

        processed_bytes = _preprocess_image(raw_bytes)
        processed_img = _decode_image_for_ocr(processed_bytes)
        processed_text, processed_score, processed_blocks = _run_rapidocr(
            engine,
            processed_img if processed_img is not None else processed_bytes,
            "preprocessado"
        )

        if (processed_blocks, processed_score, len(processed_text)) > (raw_blocks, raw_score, len(raw_text)):
            print(f"--- DEBUG OCR (RapidOCR preprocessado) ---\n{processed_text}\n-----------------", flush=True)
            return processed_text

        print(f"--- DEBUG OCR (RapidOCR raw fallback) ---\n{raw_text}\n-----------------", flush=True)
        return raw_text

    except Exception as e:
        print(f"DEBUG: ERRO no RapidOCR: {e}", flush=True)
        return ""


def _extract_text_easyocr(image_bytes: bytes, file_path: str = None) -> str:
    """Backward-compatible alias for legacy tests/scripts."""
    return _extract_text_rapidocr(image_bytes, file_path=file_path)


# =============================================================================
# MAIN EXTRACTION — regex heuristics on the cleaned OCR text
# =============================================================================

def extract_transaction_data(file_bytes: bytes, extension: str, file_path: str = None) -> dict:
    """Extrai dados de transação do conteúdo fornecido."""
    print(f"DEBUG: [ocr_processor] Extensão: {extension} | Arquivo em disco: {file_path}", flush=True)
    fallback_data = {
        "total_amount": 0.0,
        "currency": "BRL",
        "transaction_date": "",
        "transaction_type": "Outflow",
        "payment_method": "Desconhecido",
        "merchant_name": "Erro na Leitura (OCR Falhou)",
        "destination_institution": "",
        "transaction_id": "",
        "masked_cpf": "",
        "smart_category": "Outros",
        "needs_manual_review": True
    }

    try:
        input_kind, prepared_input = _prepare_input(file_bytes, extension.lower())

        raw_text = ""
        if input_kind == "image":
            raw_text = _extract_text_rapidocr(prepared_input, file_path=file_path)
        elif input_kind == "pdf_text":
            raw_text = prepared_input

        print(f"DEBUG: Texto Bruto Extraído:\n'{raw_text}'\n" + "="*30)

        if len(raw_text.strip()) < 5:
            print(f"DEBUG: OCR extraiu pouco texto: '{raw_text}'", flush=True)
            return fallback_data, raw_text

        print(f"DEBUG: Analisando texto bruto com RegEx...", flush=True)

        # 1. VALOR — multi-strategy extraction
        #    Strategy A: Keyword + number
        def clean_val(v):
            # Handle both BR format (1.234,56) and US format (1,234.56)
            v = v.strip().replace(" ", "")
            if re.search(r'\d+\.\d{3},\d{2}', v):  # BR: 1.234,56
                v = v.replace(".", "").replace(",", ".")
            elif re.search(r'\d+,\d{3}\.\d{2}', v):  # US: 1,234.56
                v = v.replace(",", "")
            else:
                v = v.replace(",", ".")
            try:
                return float(re.sub(r'[^\d.]', '', v))
            except:
                return 0.0

        all_amounts = re.findall(r'(\d[\d\.,\s]*[\.,]\d{2})(?!\d)', raw_text)
        print(f"DEBUG: Candidatos a valor encontrados: {all_amounts}", flush=True)

        val_match = re.search(
            r'(?:R\$|RS|R\s*\$|Valor|TOTAL|DINHEIRO|PAGO|QUANTIA|PAGAMENTO|AMOUNT)[:\s]*([R$\s]*[\d\.,]{3,})',
            raw_text, re.IGNORECASE
        )
        if val_match:
            raw_val = re.sub(r'[R$\s]', '', val_match.group(1))
            fallback_data["total_amount"] = clean_val(raw_val)
            print(f"DEBUG: Valor extraído via Palavra-Chave: {fallback_data['total_amount']}", flush=True)

        # Strategy B: Largest plausible value among all candidates
        if fallback_data["total_amount"] == 0 and all_amounts:
            candidates = [clean_val(a) for a in all_amounts]
            # Exclude implausible values (e.g. CPF-like numbers > 99999)
            plausible = [c for c in candidates if 0.01 <= c <= 99999.99]
            if plausible:
                fallback_data["total_amount"] = max(plausible)
                print(f"DEBUG: Valor extraído via Heurística (Maior plausível): {fallback_data['total_amount']}", flush=True)

        if fallback_data["total_amount"] == 0:
            print("DEBUG: RegEx Valor NÃO encontrado por nenhuma regra.", flush=True)

        # 2. MÉTODO DE PAGAMENTO
        pm_patterns = [
            (r'\bPIX\b', "PIX"),
            (r'DEPOSITO|DEPÓSITO', "Depósito"),
            (r'TRANSFERENCIA|TRANSFERÊNCIA|TED\b|DOC\b', "Transferência"),
            (r'CARTAO\s+DE\s+CREDITO|CARTÃO\s+DE\s+CRÉDITO|CREDITO\b|CRÉDITO\b', "Cartão de Crédito"),
            (r'CARTAO\s+DE\s+DEBITO|CARTÃO\s+DE\s+DÉBITO|DEBITO\b|DÉBITO\b', "Cartão de Débito"),
            (r'CARTAO|CARTÃO', "Cartão"),
            (r'BOLETO|PAGAMENTO\s+DE\s+TITULO', "Boleto"),
            (r'DINHEIRO|ESPECIE|ESPÉCIE', "Dinheiro"),
        ]
        for pattern, method in pm_patterns:
            if re.search(pattern, raw_text, re.IGNORECASE):
                fallback_data["payment_method"] = method
                break

        # 3. DATA E HORA
        date_matches = re.finditer(r'(\d{2})[/\-\.](\d{2})[/\-\.](\d{2,4})', raw_text)
        found_date = False
        for dm in date_matches:
            day, month, year = dm.group(1), dm.group(2), dm.group(3)
            if len(year) == 2: year = "20" + year
            iy, im = int(year), int(month)
            if im <= 12 and 2000 <= iy <= 2030:
                fallback_data["transaction_date"] = f"{year}-{month}-{day}T12:00:00"
                print(f"DEBUG: RegEx Data encontrada: {fallback_data['transaction_date']}", flush=True)
                found_date = True
                break

        if not found_date:
            compact_month_match = re.search(
                r'\b(\d{1,2})(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(\d{4})\b',
                raw_text, re.IGNORECASE
            )
            if compact_month_match:
                day = compact_month_match.group(1).zfill(2)
                month_str = compact_month_match.group(2).lower()
                year = compact_month_match.group(3)
                months = {
                    "jan": "01", "fev": "02", "mar": "03", "abr": "04",
                    "mai": "05", "jun": "06", "jul": "07", "ago": "08",
                    "set": "09", "out": "10", "nov": "11", "dez": "12"
                }
                month = months[month_str]
                fallback_data["transaction_date"] = f"{year}-{month}-{day}T12:00:00"
                print(f"DEBUG: RegEx Data encontrada (Compacta): {fallback_data['transaction_date']}", flush=True)
                found_date = True

        if not found_date:
            date_match = re.search(
                r'(\d{2})\s+(?:de\s+)?([A-Za-z]{3,10})\s+(?:de\s+)?(\d{4})',
                raw_text, re.IGNORECASE
            )
            if date_match:
                day, month_str, year = date_match.group(1), date_match.group(2).lower()[:3], date_match.group(3)
                months = {
                    "jan": "01", "fev": "02", "mar": "03", "abr": "04",
                    "mai": "05", "jun": "06", "jul": "07", "ago": "08",
                    "set": "09", "out": "10", "nov": "11", "dez": "12"
                }
                month = months.get(month_str)
                if month:
                    fallback_data["transaction_date"] = f"{year}-{month}-{day}T12:00:00"
                    print(f"DEBUG: RegEx Data encontrada (Extenso): {fallback_data['transaction_date']}", flush=True)

        # 4. NOME DO DESTINATÁRIO / MERCHANT
        name_match = re.search(
            r'(?:NOME|DESTINAT[AÁ]RIO|RECEBEDOR|FAVORECIDO|PARA|BENEFICI[AÁ]RIO)[:\s-]*\n?([A-ZÀ-Úa-zà-ú\s]{5,50})(?:\n|$)',
            raw_text, re.IGNORECASE
        )
        if name_match:
            candidate = name_match.group(1).strip()
            if len(candidate) > 4 and not re.search(r'REALIZADA|COMPROVANTE', candidate, re.IGNORECASE):
                fallback_data["merchant_name"] = candidate
                print(f"DEBUG: Nome extraído via Label: {fallback_data['merchant_name']}", flush=True)

        if fallback_data["merchant_name"] == "Erro na Leitura (OCR Falhou)" or "Banking" in fallback_data["merchant_name"]:
            lines = [l.strip() for l in raw_text.split('\n') if len(l.strip()) > 5]
            skip_words = r'SISBB|BANCO|COMPROVANTE|SISTEMA|EXTRATO|PAGAMENTO|DATA|VALOR|PIX|TED|DOC'
            for line in lines:
                if not re.search(skip_words, line, re.IGNORECASE):
                    fallback_data["merchant_name"] = line
                    print(f"DEBUG: Nome extraído via Heurística de Linha: {fallback_data['merchant_name']}", flush=True)
                    break

        # 5. ID DE TRANSAÇÃO / AUTENTICAÇÃO
        auth_patterns = [
            r'(?:ID\s*da\s*transa[cç][aã]o|ID\s*datransacao|IDdatransacao|E2E|ENDTOEND)[:\s-]*\n?\s*([A-Za-z0-9]{15,80})',
            r'(?:AUTENTICA[CÇ][AÃ]O|AUTENTICACAO|CONTROLE)[:\s-]*\n?\s*([A-Za-z0-9]{20,80})',
            r'(?:DOCUMENTO|DOC)[:\s-]*\n?\s*([0-9]{5,30})',
        ]
        for pattern in auth_patterns:
            auth_match = re.search(pattern, raw_text, re.IGNORECASE)
            if auth_match:
                fallback_data["transaction_id"] = auth_match.group(1).strip()
                print(f"DEBUG: RegEx ID encontrado: {fallback_data['transaction_id']}", flush=True)
                break

        # 6. CPF / CNPJ (inclusive mascarados)
        cpf_pattern = r'((?:\d{3}|\*{3})[\.\s]?(?:\d{3}|\*{3})[\.\s]?(?:\d{3}|\*{3})[\-\s]?(?:\d{2}|\*{2})|\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[/\s]?\d{4}[\-\s]?\d{2})'
        cpf_match = re.search(cpf_pattern, raw_text)
        if cpf_match:
            candidate_cpf = cpf_match.group(1).strip()
            if len(re.sub(r'[\.\-\s]', '', candidate_cpf)) >= 11:
                fallback_data["masked_cpf"] = candidate_cpf
                print(f"DEBUG: RegEx CPF/CNPJ encontrado: {fallback_data['masked_cpf']}", flush=True)

        # 7. CATEGORIZAÇÃO INTELIGENTE
        categories_map = {
            "Alimentação": ["RESTAURANTE", "IFOOD", "UBER EATS", "PADARIA", "LANCHONETE", "CAFE", "COFFEE",
                            "MCDONALDS", "BURGER KING", "STARBUCKS", "PIZZARIA", "CHURRASCARIA", "SUSHI"],
            "Compras": ["MERCADO LIVRE", "AMAZON", "SHOPEE", "MAGAZINE LUIZA", "LOJA", "VESTUARIO", "ROUPA",
                        "CALCADO", "AMERICANAS", "CASAS BAHIA", "SUBMARINO"],
            "Transporte": ["UBER", "99APP", "POSTO", "COMBUSTIVEL", "SHELL", "IPIRANGA", "PETROBRAS",
                           "ESTACIONAMENTO", "PEDAGIO", "PASSAGEM", "METRÔ", "ONIBUS"],
            "Casa": ["CONDOMINIO", "ALUGUEL", "LUZ", "ENEL", "CPFL", "AGUA", "SABESP", "INTERNET",
                     "CLARO", "VIVO", "OI", "TIM", "GAS", "COMGAS"],
            "Saúde": ["FARMACIA", "DROGASIL", "RAIA", "HOSPITAL", "CLINICA", "MEDICO", "DENTISTA", "EXAME",
                      "DROGA", "PACHECO"],
            "Educação": ["ESCOLA", "FACULDADE", "CURSO", "LIVRARIA", "MENSALIDADE", "UNIVERSIDADE"],
            "Lazer": ["CINEMA", "SHOW", "TEATRO", "VIAGEM", "HOTEL", "AIRBNB", "BAR", "PUB", "DISNEY",
                      "NETFLIX", "SPOTIFY", "YOUTUBE", "STEAM", "PLAYSTATION"],
            "Serviços": ["ACADEMIA", "SMARTFIT", "ASSINATURA", "CLOUD", "ICLOUD", "GOOGLE", "APPLE",
                         "SEGURO", "IPTU", "IPVA"],
        }

        found_category = False
        text_to_search = (raw_text + " " + fallback_data["merchant_name"]).upper()
        for cat, keywords in categories_map.items():
            for kw in keywords:
                if kw in text_to_search:
                    fallback_data["smart_category"] = cat
                    found_category = True
                    break
            if found_category:
                break

        # 8. TIPO DE TRANSAÇÃO
        if re.search(r'RECEBIMENTO|RECEBIDO|DEPOSITO\s+RECEBIDO|CREDITO\s+EM\s+CONTA', raw_text, re.IGNORECASE):
            fallback_data["transaction_type"] = "Inflow"
            fallback_data["smart_category"] = "Receita"

        fallback_data["needs_manual_review"] = False
        return fallback_data, raw_text

    except Exception as e:
        print(f"Extraction Pipeline Fatal Error: {e}")
        import traceback
        traceback.print_exc()
        error_fallback = dict(fallback_data)
        error_fallback["merchant_name"] = f"Erro no Processamento: {str(e)[:50]}"
        return error_fallback, ""
    finally:
        del file_bytes
