import asyncio
import httpx

async def test():
    url = "https://nubank.com.br/comprovante/12345"
    api_url = f"https://image.thum.io/get/{url}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(api_url, follow_redirects=True)
        print(f"Status: {resp.status_code}")
        print(f"Content-Type: {resp.headers.get('content-type')}")
        print(f"Content length: {len(resp.content)}")

asyncio.run(test())
