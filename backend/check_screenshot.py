import asyncio
import httpx
from ocr_processor import _extract_text_rapidocr

async def run():
    url = "https://iad.microlink.io/Mi0DLZ1GnryRC-s7FTgH_vUBi6FTuzTtZabfsF_s_GcaBhnGDKzeUrUZPIdr1l8Yc1J0eTWq3oBWO3FhsH7kmQ.png"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        img_bytes = resp.content
        result = _extract_text_rapidocr(img_bytes)
        print("OCR Text:", result)

asyncio.run(run())
