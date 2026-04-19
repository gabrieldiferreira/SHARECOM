import asyncio
import httpx
import urllib.parse
import json

async def test():
    url = "https://photos.app.goo.gl/w6vnB1T4kJus4SEG8"
    encoded_url = urllib.parse.quote(url, safe='')
    api_url = f"https://api.microlink.io/?url={encoded_url}&screenshot=true&meta=false"
    async with httpx.AsyncClient() as client:
        resp = await client.get(api_url)
        print(f"Status: {resp.status_code}")
        print(json.dumps(resp.json(), indent=2))

asyncio.run(test())
