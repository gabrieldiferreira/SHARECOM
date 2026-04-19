import asyncio
import httpx
import json

async def test():
    url = "http://127.0.0.1:8000/receipts"
    data = {"receipt_url": "https://photos.app.goo.gl/w6vnB1T4kJus4SEG8"}
    
    # We must mock Firebase token verification or test via main.py directly
    # Since Firebase verify depends on valid token, it might reject.
    # Let's check main.py line 109: `_: dict = Depends(verify_firebase_token),`
    # If it requires a token, I need a valid token.
    # I can bypass it for local testing by writing a small test script that calls the python function directly!
    
    from main import process_ata
    from fastapi import UploadFile
    
    # We can't easily mock Depends in a simple script.
    pass

asyncio.run(test())
