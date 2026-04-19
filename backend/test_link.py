import asyncio
import httpx

async def test():
    url = "https://nubank.com.br/comprovante/12345"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        print(f"Status: {resp.status_code}")
        print(f"Content-Type: {resp.headers.get('content-type')}")
        print(f"Content length: {len(resp.content)}")
        print(f"Snippet: {resp.content[:200]}")

asyncio.run(test())
