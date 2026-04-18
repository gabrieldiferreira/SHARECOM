import sys
import json
import ai_agent

def main():
    file_path = "uploads/a8c0db39b720ec1f745124eb85b2060a4ca2f8e25bb34d2f7e6b822e3ccc123f.jpeg"
    print(f"Testing extraction with {file_path}")
    with open(file_path, "rb") as f:
        file_bytes = f.read()
    
    input_kind, prepared_input = ai_agent._prepare_input(file_bytes, ".jpeg")
    response_text = ai_agent._call_openrouter("nvidia/nemotron-nano-12b-v2-vl:free", input_kind, prepared_input)
    print("--- RAW NEMOTRON OUTPUT ---")
    print(response_text)
    print("--- PARSED OUTPUT ---")
    result = ai_agent._extract_ai_json(response_text)
    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
