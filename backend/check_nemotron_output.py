import ai_agent
import json
with open("uploads/a8c0db39b720ec1f745124eb85b2060a4ca2f8e25bb34d2f7e6b822e3ccc123f.jpeg", "rb") as f:
    b = f.read()
res = ai_agent._call_openrouter("nvidia/nemotron-nano-12b-v2-vl:free", "image", ai_agent._prepare_input(b, ".jpeg")[1])
print("RESPONSE:", repr(res))
