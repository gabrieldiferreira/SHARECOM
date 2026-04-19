import asyncio
import httpx
import json

async def test():
    url = "https://example.com"
    api_url = f"https://api.microlink.io/?url={url}&screenshot=true&meta=false"
    async with httpx.AsyncClient() as client:
        resp = await client.get(api_url)
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(json.dumps(data, indent=2))

asyncio.run(test())
