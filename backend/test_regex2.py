import re

def _regex_extract_from_text(raw_text: str) -> dict:
    repaired = {
        "total_amount": 0.0,
        "currency": "BRL",
        "transaction_date": "2026-04-15T12:00:00",
        "transaction_type": "Outflow",
        "payment_method": "Comprovante",
        "merchant_name": "Erro na Leitura (Falha em todos os modelos OCR)",
        "destination_institution": "",
        "transaction_id": "",
        "masked_cpf": "",
        "smart_category": "Outros",
        "needs_manual_review": True
    }
    
    val_match = re.search(r'R\$\s*([\d\.,]+)', raw_text)
    if val_match:
        try:
            val_str = val_match.group(1).replace('.', '').replace(',', '.')
            repaired["total_amount"] = float(val_str)
        except:
            pass
            
    id_match = re.search(r'(?:ID|Autenticação|Controle)[^\w\n]*\n?([A-Za-z0-9]{10,})', raw_text, re.IGNORECASE)
    if id_match:
        repaired["transaction_id"] = id_match.group(1)
        
    if repaired["total_amount"] > 0:
        repaired["merchant_name"] = "Comprovante (Leitura Parcial)"
        
    return repaired

with open("uploads/a8c0db39b720ec1f745124eb85b2060a4ca2f8e25bb34d2f7e6b822e3ccc123f.jpeg", "rb") as f:
    import ai_agent
    _, prepared = ai_agent._prepare_input(f.read(), ".jpeg")
    text = ai_agent._extract_text_ocrspace(prepared)
    print(_regex_extract_from_text(text))
