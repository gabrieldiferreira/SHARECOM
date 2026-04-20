import os
import re
import fitz # PyMuPDF
from PIL import Image
import io
import xml.etree.ElementTree as ET
from dotenv import load_dotenv

# Ensure .env values override empty shell vars
load_dotenv(override=True)

PDF_MAX_PAGES = int(os.environ.get("PDF_MAX_PAGES", "2"))
PDF_MAX_CHARS = int(os.environ.get("PDF_MAX_CHARS", "4000"))

EASYOCR_READER = None
def get_easyocr_reader():
    global EASYOCR_READER
    if EASYOCR_READER is None:
        try:
            import warnings
            warnings.filterwarnings("ignore", category=UserWarning, module="torch.utils.data.dataloader")
            import easyocr
            EASYOCR_READER = easyocr.Reader(['pt', 'en'], gpu=False)
        except Exception as e:
            print(f"Failed to initialize EasyOCR: {e}")
    return EASYOCR_READER

def _extract_svg_text(file_bytes: bytes) -> str:
    """Extrai texto de SVGs sem depender de rasterização.
    Funciona bem para exports vetoriais com <text>, <tspan>, <title> e <desc>.
    """
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
            # Fallback: remove tags e preserva apenas texto visível do XML.
            stripped = re.sub(r"<[^>]+>", " ", decoded)
            stripped = re.sub(r"\s+", " ", stripped).strip()
            return stripped[:PDF_MAX_CHARS]

        unique_texts = list(dict.fromkeys(texts))
        return "\n".join(unique_texts)[:PDF_MAX_CHARS]
    except Exception as e:
        print(f"DEBUG: Falha ao extrair texto do SVG: {e}", flush=True)
        return ""

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
        
        text_context = "".join(doc[page_index].get_text() for page_index in range(max_pages))
        text_context = " ".join(text_context.split())[:PDF_MAX_CHARS]
        
        if len(text_context) < 50:
            print("PDF has little text content. Rendering first page for Vision OCR.")
            page = doc[0]
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            image_bytes = pix.tobytes("jpeg")
            doc.close()
            return "image", image_bytes
            
        doc.close()
        return "pdf_text", text_context

    if ext == ".svg":
        svg_text = _extract_svg_text(file_bytes)
        return "pdf_text", svg_text

    return "image", file_bytes

def _extract_text_easyocr(image_bytes: bytes, file_path: str = None) -> str:
    """Extrai texto da imagem usando EasyOCR.
    Prefere ler de arquivo em disco (mais confiável) quando file_path é fornecido.
    """
    reader = get_easyocr_reader()
    if not reader:
        print("DEBUG: ERRO - Falha ao obter o reader do EasyOCR.")
        return ""
    try:
        import numpy as np
        if file_path and os.path.exists(file_path):
            # Leitura direta do arquivo com pré-processamento para grayscale
            print(f"DEBUG: EasyOCR lendo de arquivo: {file_path}")
            img = Image.open(file_path).convert("L")
            result = reader.readtext(np.array(img), detail=0, paragraph=True)
        else:
            # Fallback: leitura de bytes em memória
            print(f"DEBUG: EasyOCR lendo de bytes ({len(image_bytes)} bytes)")
            img = Image.open(io.BytesIO(image_bytes)).convert("L") # Escala de cinza para melhor precisão
            result = reader.readtext(np.array(img), detail=0, paragraph=True)

        text = "\n".join(result)
        print(f"--- DEBUG OCR ---\n{text}\n-----------------")
        print(f"DEBUG: EasyOCR concluído. Caracteres: {len(text)}")
        return text
    except Exception as e:
        print(f"DEBUG: ERRO no EasyOCR: {e}")
        return ""

def extract_transaction_data(file_bytes: bytes, extension: str, file_path: str = None) -> dict:
    """Extrai dados de transação do conteúdo fornecido.
    
    Args:
        file_bytes: Conteúdo do arquivo em memória
        extension: Extensão do arquivo (.jpg, .png, .pdf, .html, .txt, .svg)
        file_path: Caminho opcional para arquivo em disco (preferido para imagens da web)
    """
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
            # Passa o file_path para o EasyOCR preferir leitura de disco
            raw_text = _extract_text_easyocr(prepared_input, file_path=file_path)
        elif input_kind == "pdf_text":
            raw_text = prepared_input

        print(f"DEBUG: Texto Bruto Extraído:\n'{raw_text}'\n" + "="*30)

        if len(raw_text.strip()) < 5:
            print(f"DEBUG: OCR extraiu pouco texto: '{raw_text}'", flush=True)
            return fallback_data, raw_text

        print(f"DEBUG: Analisando texto bruto com RegEx...", flush=True)
        
        # 1. Valor (Amount) - Heurística Robusta
        # Primeiro, extraímos todos os possíveis números que parecem dinheiro
        all_amounts = re.findall(r'(\d[\d\.,\s]*[\.,]\d{2})(?!\d)', raw_text)
        print(f"DEBUG: Candidatos a valor encontrados: {all_amounts}", flush=True)
        
        def clean_val(v):
            digits = re.sub(r'\D', '', v)
            return float(digits) / 100.0 if digits else 0.0

        # Tentativa A: Palavra-chave + Número
        val_match = re.search(r'(?:R\$|RS|R\s*\$|Valor|TOTAL|DINHEIRO|PAGO|QUANTIA|PAGAMENTO):?\s*([\d\.,]{3,})', raw_text, re.IGNORECASE)
        if val_match:
            fallback_data["total_amount"] = clean_val(val_match.group(1))
            print(f"DEBUG: Valor extraído via Palavra-Chave: {fallback_data['total_amount']}", flush=True)
        
        # Tentativa B: Se a tentativa A falhou ou deu 0, pega o maior valor da lista de candidatos
        if fallback_data["total_amount"] == 0 and all_amounts:
            fallback_data["total_amount"] = max([clean_val(a) for a in all_amounts])
            print(f"DEBUG: Valor extraído via Heurística (Maior valor): {fallback_data['total_amount']}", flush=True)

        if fallback_data["total_amount"] == 0:
            print("DEBUG: RegEx Valor NÃO encontrado por nenhuma regra.", flush=True)
                
        # 2. Método de Pagamento (Payment Method)
        if re.search(r'PIX', raw_text, re.IGNORECASE):
            fallback_data["payment_method"] = "PIX"
        elif re.search(r'DEPOSITO|DEPÓSITO', raw_text, re.IGNORECASE):
            fallback_data["payment_method"] = "Depósito"
        elif re.search(r'TRANSFERENCIA|TRANSFERÊNCIA|DOC|TED', raw_text, re.IGNORECASE):
            fallback_data["payment_method"] = "Transferência"
        elif re.search(r'CARTAO|CARTÃO|DEBITO|DÉBITO|CREDITO|CRÉDITO', raw_text, re.IGNORECASE):
            fallback_data["payment_method"] = "Cartão"
        elif re.search(r'BOLETO|PAGAMENTO DE TITULO', raw_text, re.IGNORECASE):
            fallback_data["payment_method"] = "Boleto"
            
        # 3. Data e Hora (Date and Time)
        # Tenta evitar padrões de hora (ex: 11.30.15) verificando se o ano é plausível
        date_matches = re.finditer(r'(\d{2})[/\-\.](\d{2})[/\-\.](\d{2,4})', raw_text)
        found_date = False
        for dm in date_matches:
            day, month, year = dm.group(1), dm.group(2), dm.group(3)
            if len(year) == 2: year = "20" + year
            iy = int(year)
            im = int(month)
            # Se o mês > 12 ou ano muito fora da realidade, provavelmente é hora ou ID
            if im <= 12 and 2000 <= iy <= 2030:
                fallback_data["transaction_date"] = f"{year}-{month}-{day}T12:00:00"
                print(f"DEBUG: RegEx Data encontrada: {fallback_data['transaction_date']}", flush=True)
                found_date = True
                break
        
        if not found_date:
            # Tenta formatos extensos: 19 Out 2026
            date_match = re.search(r'(\d{2})\s+(?:de\s+)?([A-Za-z]{3,10})\s+(?:de\s+)?(\d{4})', raw_text, re.IGNORECASE)
            if date_match:
                day, month_str, year = date_match.group(1), date_match.group(2).lower()[:3], date_match.group(3)
                months = {"jan": "01", "fev": "02", "mar": "03", "abr": "04", "mai": "05", "jun": "06", 
                          "jul": "07", "ago": "08", "set": "09", "out": "10", "nov": "11", "dez": "12"}
                month = months.get(month_str, "01")
                fallback_data["transaction_date"] = f"{year}-{month}-{day}T12:00:00"
                print(f"DEBUG: RegEx Data encontrada (Extenso): {fallback_data['transaction_date']}", flush=True)

        # 4. Nome do Destinatário (Merchant Name)
        # Prioridade absoluta para o campo NOME: ou NOME DO DESTINATÁRIO:
        name_match = re.search(r'(?:NOME|DESTINAT[AÁ]RIO|RECEBEDOR|FAVORECIDO|PARA|BENEFICI[AÁ]RIO)[:\s-]*\n?([A-ZÀ-Úa-zà-ú\s]{5,50})(?:\n|$)', raw_text, re.IGNORECASE)
        if name_match:
            candidate = name_match.group(1).strip()
            # Se o nome capturado for apenas "NOME" ou palavras genéricas, tentamos as linhas
            if len(candidate) > 4 and not re.search(r'REALIZADA|COMPROVANTE', candidate, re.IGNORECASE):
                fallback_data["merchant_name"] = candidate
                print(f"DEBUG: Nome extraído via Label: {fallback_data['merchant_name']}", flush=True)
        
        if fallback_data["merchant_name"] == "Erro na Leitura (OCR Falhou)" or "Banking" in fallback_data["merchant_name"]:
            # Se falhou ou pegou "Private Banking", tenta pegar a linha mais provável
            lines = [l.strip() for l in raw_text.split('\n') if len(l.strip()) > 5]
            for line in lines:
                if not re.search(r'SISBB|BANCO|COMPROVANTE|SISTEMA|EXTRATO|PAGAMENTO', line, re.IGNORECASE):
                    fallback_data["merchant_name"] = line
                    print(f"DEBUG: Nome extraído via Heurística de Linha: {fallback_data['merchant_name']}", flush=True)
                    break

        # 5. ID da Transação (Autenticação)
        # Procura por strings alfanuméricas longas (ID da transação)
        auth_match = re.search(r'(?:ID|AUTENTICA[CÇ][AÃ]O|CONTROLE|DOC|N[ÚU]MERO)[:\s-]*\n?([A-Z0-9]{15,60})', raw_text, re.IGNORECASE)
        if auth_match:
            fallback_data["transaction_id"] = auth_match.group(1).strip()
            print(f"DEBUG: RegEx ID encontrado (Longo): {fallback_data['transaction_id']}", flush=True)

        # 6. CPF / CNPJ (Inclusive Mascarados como ***.123.456-**)
        # Padrão: 3 dígitos ou 3 asteriscos, seguidos de separadores e mais blocos, terminando em 2 dígitos ou 2 asteriscos
        cpf_pattern = r'((?:\d{3}|\*{3})[\.\s]?(?:\d{3}|\*{3})[\.\s]?(?:\d{3}|\*{3})[\-\s]?(?:\d{2}|\*{2})|\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[/\s]?\d{4}[\-\s]?\d{2})'
        cpf_match = re.search(cpf_pattern, raw_text)
        if cpf_match:
            candidate_cpf = cpf_match.group(1).strip()
            # Validação simples: não pode ser apenas asteriscos e tem que ter um tamanho mínimo
            if len(re.sub(r'[\.\-\s]', '', candidate_cpf)) >= 11:
                fallback_data["masked_cpf"] = candidate_cpf
                print(f"DEBUG: RegEx CPF/CNPJ encontrado: {fallback_data['masked_cpf']}", flush=True)

        return fallback_data, raw_text

    except Exception as e:
        print(f"Extraction Pipeline Fatal Error: {e}")
        error_fallback = dict(fallback_data)
        error_fallback["merchant_name"] = f"Erro no Processamento: {str(e)[:50]}"
        return error_fallback, ""
    finally:
        del file_bytes
