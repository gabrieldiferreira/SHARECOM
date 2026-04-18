import ai_agent
with open("uploads/a8c0db39b720ec1f745124eb85b2060a4ca2f8e25bb34d2f7e6b822e3ccc123f.jpeg", "rb") as f:
    input_kind, prepared_input = ai_agent._prepare_input(f.read(), ".jpeg")
    text = ai_agent._extract_text_ocrspace(prepared_input)
    print("OCR OUTPUT:")
    print(text)
