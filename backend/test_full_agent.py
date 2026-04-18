import ai_agent
with open("uploads/a8c0db39b720ec1f745124eb85b2060a4ca2f8e25bb34d2f7e6b822e3ccc123f.jpeg", "rb") as f:
    res = ai_agent.extract_transaction_data(f.read(), ".jpeg")
print(res)
