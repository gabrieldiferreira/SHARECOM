import os
import re
import fitz # PyMuPDF
import io
from dotenv import load_dotenv

# Ensure .env values override empty shell vars
load_dotenv(override=True)

PDF_MAX_PAGES = int(os.environ.get("PDF_MAX_PAGES", "2"))
PDF_MAX_CHARS = int(os.environ.get("PDF_MAX_CHARS", "4000"))

def _prepare_input(file_bytes: bytes, extension: str) -> tuple[str, str | bytes]:
    ext = extension.lower()
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

    return "image", file_bytes

def _extract_text_easyocr(image_bytes: bytes) -> str:
    print("Iniciando extração via RapidOCR local...")
    try:
        from ocr_processor import _extract_text_rapidocr
        return _extract_text_rapidocr(image_bytes)
    except Exception as e:
        print(f"RapidOCR Failed: {e}")
        return ""

def extract_transaction_data(file_bytes: bytes, extension: str) -> dict:
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
            raw_text = _extract_text_easyocr(prepared_input)
        elif input_kind == "pdf_text":
            raw_text = prepared_input

        if len(raw_text.strip()) < 5:
            return fallback_data

        print("Using RegEx best effort on raw text.")
        
        print(f"Texto extraído (primeiros 200 caracteres):\n{raw_text[:200]}")

        # 1. Valor (Amount) - Regex mais flexível
        # Busca por padrões como: 50,00 | 1.250,00 | R$ 10.00 | RS 5,50
        val_match = re.search(r'(?:R\$|RS|R\s*\$|Valor|Total|Pago|[\$])?[:\s]*(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})', raw_text, re.IGNORECASE)

        if not val_match:
            # Tenta pegar qualquer número com duas casas decimais no final se o primeiro falhar
            val_match = re.search(r'(\d+[\.,]\d{2})', raw_text)

        if val_match:
            try:
                # Normaliza: remove pontos de milhar e troca vírgula por ponto
                val_str = val_match.group(1).replace('.', '').replace(',', '.')
                # Se após a limpeza o ponto sumiu ou ficou errado (ex: 5000), corrigimos
                if '.' not in val_str and len(val_str) > 2:
                    val_str = val_str[:-2] + "." + val_str[-2:]
                
                amount = float(val_str)
                if amount > 0:
                    fallback_data["total_amount"] = amount
                    fallback_data["merchant_name"] = "Comprovante Identificado"
            except Exception as e:
                print(f"Erro ao converter valor: {e}")

        # 2. Data e Hora (Date and Time) - Regex mais abrangente
        date_match = re.search(r'(\d{2})[/.-](\d{2})[/.-](\d{2,4})', raw_text)
        if date_match:
            day, month, year = date_match.groups()
            if len(year) == 2: year = "20" + year
            fallback_data["transaction_date"] = f"{year}-{month}-{day}T12:00:00"
            
        # 2.5 Método de Pagamento (Payment Method)
        method_match = re.search(r'(?:Tipo de transfer[êe]ncia|M[ée]todo|Pagamento|Forma|Tipo)[\s:]*(Pix|TED|DOC|Transfer[êe]ncia|Boleto|Cart[aã]o)', raw_text, re.IGNORECASE)
        if method_match:
            fallback_data["payment_method"] = method_match.group(1).title()
        
        # 3. Nome do Destinatário (Merchant Name)
        # Look for "Destino ... Nome" or "NOME:"
        name_match = re.search(r'(?:DESTINO|DESTINAT[AÁ]RIO|RECEBEDOR)[\s\S]{0,50}?(?:NOME)[:\s-]*\n?([A-ZÀ-Úa-zà-ú\s]{5,40})(?:\n|$)', raw_text, re.IGNORECASE)
        if not name_match:
            name_match = re.search(r'(?:NOME)[:\s-]*\n?([A-ZÀ-Úa-zà-ú\s]{5,40})(?:\n|$)', raw_text, re.IGNORECASE)
        
        if name_match:
            candidate = name_match.group(1).strip()
            invalid_names = ['cpf', 'cnpj', 'banco', 'instituicao', 'instituição', 'agencia', 'agência', 'conta']
            if candidate and candidate.lower() not in invalid_names and '\n' not in candidate:
                fallback_data["merchant_name"] = candidate

        # 4. Instituição de Destino (Destination Institution)
        inst_match = re.search(r'(?:INSTITUI[CÇ][AÃ]O)[:\s-]*\n?([A-ZÀ-Úa-zà-ú0-9\.\-\s]{3,30})(?:\n|$)', raw_text, re.IGNORECASE)
        if inst_match:
            fallback_data["destination_institution"] = inst_match.group(1).strip()

        # 5. CPF Mascarado (Masked CPF)
        cpf_match = re.search(r'(?:CPF|CNPJ)[:\s-]*\n?([*\.\d-]{11,18})', raw_text, re.IGNORECASE)
        if cpf_match:
            fallback_data["masked_cpf"] = cpf_match.group(1).strip()

        # 6. ID da Transação (Transaction ID)
        id_match = re.search(r'(?:ID|Autentica[cç][aã]o|Controle)[^\w\n]*\n?([A-Za-z0-9]{15,})', raw_text, re.IGNORECASE)
        if id_match:
            fallback_data["transaction_id"] = id_match.group(1)
        
        # 7. Tipo de Transação (Transaction Type)
        if re.search(r'recebimento|recebido|dep[oó]sito recebido', raw_text, re.IGNORECASE):
            fallback_data["transaction_type"] = "Inflow"

        if fallback_data["total_amount"] > 0:
            fallback_data["needs_manual_review"] = True
            return fallback_data

        return fallback_data

    except Exception as e:
        print(f"Extraction Pipeline Fatal Error: {e}")
        error_fallback = dict(fallback_data)
        error_fallback["merchant_name"] = f"Erro no Processamento: {str(e)[:50]}"
        return error_fallback
    finally:
        del file_bytes
