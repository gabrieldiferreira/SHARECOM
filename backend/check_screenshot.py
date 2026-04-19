import asyncio
import httpx
from PIL import Image
import io
import easyocr

async def run():
    url = "https://iad.microlink.io/Mi0DLZ1GnryRC-s7FTgH_vUBi6FTuzTtZabfsF_s_GcaBhnGDKzeUrUZPIdr1l8Yc1J0eTWq3oBWO3FhsH7kmQ.png"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        img_bytes = resp.content
        reader = easyocr.Reader(['pt', 'en'])
        result = reader.readtext(img_bytes, detail=0)
        print("OCR Text:", result)

asyncio.run(run())
