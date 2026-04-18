import sys
import json
import ai_agent

def main():
    file_path = "uploads/a8c0db39b720ec1f745124eb85b2060a4ca2f8e25bb34d2f7e6b822e3ccc123f.jpeg"
    print(f"Testing extraction with {file_path}")
    with open(file_path, "rb") as f:
        file_bytes = f.read()
    
    result = ai_agent.extract_transaction_data(file_bytes, ".jpeg")
    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
