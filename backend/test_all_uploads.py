import ai_agent
import os
import re

for filename in os.listdir("uploads"):
    if not filename.endswith(('.png', '.jpeg', '.jpg', '.pdf')): continue
    path = os.path.join("uploads", filename)
    print(f"\n--- Testing {filename} ---")
    with open(path, "rb") as f:
        file_bytes = f.read()
    
    ext = os.path.splitext(filename)[1]
    input_kind, prepared = ai_agent._prepare_input(file_bytes, ext)
    
    if input_kind == "image":
        text = ai_agent._extract_text_easyocr(prepared)
    else:
        text = prepared
        
    print(f"RAW TEXT LENGTH: {len(text)}")
    print(f"PREVIEW: {text[:100].replace(chr(10), ' ')}")
    
    val_match = re.search(r'R\$\s*([\d\.,]+)', text)
    if val_match:
        print(f"MATCHED R$: {val_match.group(1)}")
    else:
        print("NO R$ MATCH FOUND!")
        
