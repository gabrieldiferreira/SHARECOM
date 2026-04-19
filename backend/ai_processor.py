import os
import httpx
import json
import base64
from dotenv import load_dotenv

load_dotenv()

MODEL_ID = "google/gemini-2.0-flash-exp:free"

async def analyze_receipt_with_ai(image_content: bytes, extension: str):
    """
    Envia a imagem para o OpenRouter (Gemini) para extrair os dados iniciais
    e mapear o padrão do comprovante.
    """
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        return None, "Chave do OpenRouter não configurada no ambiente."

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
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://sharecom.app", # Requisito do OpenRouter para alguns modelos
                    "X-Title": "SHARECOM AI"
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
                if 'choices' not in result or not result['choices']:
                    return None, f"Resposta vazia da IA: {json.dumps(result)}"
                
                content = result['choices'][0]['message']['content']
                clean_json = content.replace("```json", "").replace("```", "").strip()
                try:
                    return json.loads(clean_json), None
                except:
                    return None, f"JSON Inválido retornado pela IA: {content[:100]}"
            
            elif response.status_code == 401:
                return None, "Chave de API do OpenRouter inválida ou expirada."
            elif response.status_code == 429:
                return None, "Limite de requisições do OpenRouter atingido (Rate Limit)."
            else:
                return None, f"Erro {response.status_code}: {response.text[:200]}"
    except httpx.TimeoutException:
        return None, "Tempo esgotado ao contatar a IA (Timeout de 45s)."
    except Exception as e:
        return None, f"Erro inesperado na IA: {str(e)}"
