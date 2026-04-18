import urllib.request
import json
import os

API_KEY = "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"
BASE_URL = "https://openrouter.ai/api/v1/chat/completions"

models = [
    "mistralai/pixtral-12b",
    "mistralai/pixtral-12b:free",
    "qwen/qwen-2-vl-7b-instruct",
    "qwen/qwen-2-vl-7b-instruct:free",
    "meta-llama/llama-3.2-11b-vision-instruct:free",
    "google/gemini-2.0-flash-lite-preview-02-05:free",
    "openrouter/free"
]

for model in models:
    print(f"Testing {model}...")
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5
    }
    req = urllib.request.Request(
        BASE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
            print(f"  SUCCESS: {data['choices'][0]['message']['content']}")
    except Exception as e:
        print(f"  FAILED: {e}")

