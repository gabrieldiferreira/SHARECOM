import asyncio
import httpx
import re
import os
import uuid
import hashlib
from dotenv import load_dotenv

load_dotenv()

async def test_link_pipeline():
    clean_url = "https://photos.app.goo.gl/w6vnB1T4kJus4SEG8"
    content = b""
    ext = ".txt"
    tmp_file_path = None
    
    print(f"=== TESTANDO PIPELINE COM LINK: {clean_url} ===")
    
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        # 1. Download
        download_resp = await client.get(
            clean_url,
            headers={"User-Agent": "Mozilla/5.0 (Linux; Android 11; Mobile) AppleWebKit/537.36 Chrome/120.0 SHARECOM-Bot/2.0"}
        )
        content_type = download_resp.headers.get("content-type", "").lower()
        print(f"Status HTTP: {download_resp.status_code} | Content-Type original: {content_type}")
        
        if "html" in content_type:
            ext = ".html"
        content = download_resp.content
        
        # 2. Parse Google Photos
        if ext == ".html":
            html_text = content.decode('utf-8', errors='ignore')
            gphotos_match = re.search(r'property="og:image"\s+content="([^"]+)"', html_text)
            if "photos.app.goo.gl" in clean_url and gphotos_match:
                raw_img_url = gphotos_match.group(1)
                if "=" in raw_img_url:
                    raw_img_url = raw_img_url.split("=")[0] + "=s0"
                
                print(f"Detectado Google Photos. Link extraído: {raw_img_url[:60]}...")
                img_resp = await client.get(raw_img_url, timeout=20.0, follow_redirects=True)
                if img_resp.status_code == 200:
                    content = img_resp.content
                    ext = ".jpg"
                    print(f"SUCESSO: Imagem original baixada! Tamanho: {len(content)} bytes")
                else:
                    print(f"FALHA ao baixar imagem original. Status: {img_resp.status_code}")
                    
    # 3. OCR e IA pipeline
    if ext != ".html":
        import ocr_processor
        from ai_processor import analyze_receipt_with_ai
        
        tmp_dir = "/tmp/sharecom"
        os.makedirs(tmp_dir, exist_ok=True)
        tmp_file_path = os.path.join(tmp_dir, f"{uuid.uuid4()}{ext}")
        with open(tmp_file_path, "wb") as f:
            f.write(content)
            
        print(f"Arquivo temporário salvo: {tmp_file_path}")
        
        try:
            print("Executando OCR...")
            ocr_fallback_data, raw_text = ocr_processor.extract_transaction_data(content, ext, file_path=tmp_file_path)
            print(f"Texto OCR obtido ({len(raw_text)} chars): {raw_text[:100]}...")
            
            print("Enviando para a IA...")
            extracted_data, ai_error = await analyze_receipt_with_ai(content, ext, ocr_text=raw_text)
            
            print("\n=== RESULTADO IA ===")
            if extracted_data:
                import json
                print(json.dumps(extracted_data, indent=2, ensure_ascii=False))
            else:
                print(f"Falha na IA: {ai_error}")
                
        finally:
            if os.path.exists(tmp_file_path):
                os.remove(tmp_file_path)
                print("Arquivo temporário limpo.")
    else:
        print("Link permaneceu como HTML. Falhou no parser.")

asyncio.run(test_link_pipeline())
