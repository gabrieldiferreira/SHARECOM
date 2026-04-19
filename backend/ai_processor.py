import os
import httpx
import json
import base64
from dotenv import load_dotenv

load_dotenv()

MODEL_LIST = [
    "google/gemini-2.0-flash-001",
    "google/gemini-2.0-flash-exp:free",
    "meta-llama/llama-3.2-11b-vision-instruct:free",
    "google/gemini-2.0-pro-exp-02-05:free"
]

async def analyze_receipt_with_ai(image_content: bytes, extension: str):
    """
    Envia a imagem para o OpenRouter tentando vários modelos de visão
    Envia a imagem ou texto para o OpenRouter tentando vários modelos de visão
    em sequência caso o primeiro falhe.
    """
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        return None, "Chave do OpenRouter não configurada no ambiente."

    # Configuração do conteúdo (Imagem ou Texto)
    prompt_base = """
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
    
    content_list = [{"type": "text", "text": prompt_base}]
    
    if extension.lower() != ".txt":
        base64_image = base64.b64encode(image_content).decode('utf-8')
        mime_type = "image/jpeg" if extension.lower() in [".jpg", ".jpeg"] else "image/png"
        content_list.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}
        })
    else:
        text_content = image_content.decode('utf-8', errors='ignore')
        content_list[0]["text"] += f"\n\nCONTEÚDO PARA ANALISAR:\n{text_content}"

    last_error = "Nenhum modelo disponível"
    
    for model_id in MODEL_LIST:
        print(f"DEBUG: Tentando IA com o modelo: {model_id}...", flush=True)
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://sharecom.app",
                        "X-Title": "SHARECOM AI"
                    },
                    json={
                        "model": model_id,
                        "messages": [
                            {
                                "role": "user",
                                "content": content_list
                            }
                        ]
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if 'choices' not in result or not result['choices']:
                        last_error = f"Resposta vazia de {model_id}"
                        continue
                    
                    content = result['choices'][0]['message']['content']
                    clean_json = content.replace("```json", "").replace("```", "").strip()
                    try:
                        data = json.loads(clean_json)
                        print(f"DEBUG: Sucesso com o modelo {model_id}!", flush=True)
                        return data, None
                    except:
                        last_error = f"JSON Inválido de {model_id}"
                        continue
                
                elif response.status_code == 404:
                    last_error = f"Modelo {model_id} não encontrado (404)"
                    continue
                else:
                    last_error = f"Erro {response.status_code} em {model_id}: {response.text[:100]}"
                    continue
                    
        except Exception as e:
            last_error = f"Erro inesperado em {model_id}: {str(e)}"
            continue

    return None, f"Todos os modelos falharam. Último erro: {last_error}"
