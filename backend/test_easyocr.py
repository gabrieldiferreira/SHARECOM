import ai_agent
with open("uploads/a8c0db39b720ec1f745124eb85b2060a4ca2f8e25bb34d2f7e6b822e3ccc123f.jpeg", "rb") as f:
    text = ai_agent._extract_text_easyocr(f.read())
    print("EASYOCR OUTPUT:")
    print(text)
