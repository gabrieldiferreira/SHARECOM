import os
import httpx
import json
import base64
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL_ID = "google/gemini-2.0-flash-exp:free"

async def analyze_receipt_with_ai(image_content: bytes, extension: str):
    """
    Envia a imagem para o OpenRouter (Gemini) para extrair os dados iniciais
    e mapear o padrão do comprovante.
    """
    if not OPENROUTER_API_KEY:
        return None, "Chave do OpenRouter não configurada."

    # Prepara a imagem em Base64
    base64_image = base64.b64encode(image_content).decode('utf-8')
    mime_type = "image/jpeg" if extension.lower() in [".jpg", ".jpeg"] else "image/png"

    prompt = """
    Analise este comprovante financeiro e extraia os dados no formato JSON estrito:
    {
        "total_amount": float,
        "currency": "BRL",
        "transaction_date": "YYYY-MM-DDTHH:MM:SS",
        "merchant_name": "string",
        "payment_method": "Pix|Boleto|Cartão|Depósito|Transferência",
        "transaction_id": "string",
        "masked_cpf": "string",
        "description": "breve resumo"
    }
    Retorne APENAS o JSON, sem explicações.
    """

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL_ID,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime_type};base64,{base64_image}"
                                    }
                                }
                            ]
                        }
                    ]
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result['choices'][0]['message']['content']
                # Limpa possíveis blocos de código markdown
                clean_json = content.replace("```json", "").replace("```", "").strip()
                return json.loads(clean_json), None
            else:
                return None, f"Erro OpenRouter: {response.text}"
    except Exception as e:
        return None, f"Erro na chamada da IA: {str(e)}"
