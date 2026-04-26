# IDEMPOTENCY TESTING GUIDE

**Date**: April 25, 2026  
**Version**: 2.0 (Enhanced Exception Handling)

## Complete Protection Flow

Your system now has **3 defensive layers**:

```
UPLOAD RECEIPT
    ↓
1️⃣  RECEIPT HASH CHECK (Line 378-385)
    ├─ Query: WHERE receipt = sha256_hash AND user_id = uid
    ├─ If found: Return existing expense
    └─ If not found: Continue
    ↓
2️⃣  TRANSACTION_ID PRE-INSERT CHECK (Line 431-445)
    ├─ If tx_id exists: Query WHERE transaction_id = tx_id AND user_id = uid
    ├─ If found: Return duplicate response (200 OK)
    └─ If not found: Continue
    ↓
3️⃣  TRY-EXCEPT WRAPPER (Line 457-490)
    ├─ Try: db.add() + db.commit()
    ├─ If IntegrityError for transaction_id:
    │  ├─ Query existing by (transaction_id, user_id)
    │  ├─ Return duplicate response (200 OK, not 500)
    │  └─ This handles race conditions
    └─ If other error: Raise to outer exception handler
    ↓
SUCCESS: 200 OK with expense_id
```

## How to Test

### Test 1: Basic Duplicate Detection (Same Receipt Hash)
```bash
# Step 1: Upload receipt
curl -X POST http://localhost:8000/receipts \
  -H "Authorization: Bearer $TOKEN" \
  -F "received_file=@receipt.pdf" \
  -F "transaction_type=Outflow"

# Expected Response (First Upload):
# HTTP 201 / 200
# {
#   "idempotent": false,
#   "database_id": 42,
#   "ai_data": {
#     "total_amount": 467.00,
#     "merchant_name": "Padaria Central",
#     "transaction_id": "E60701190202604021604DY59BYCDP5Y"
#   }
# }

# Step 2: Upload SAME file again
curl -X POST http://localhost:8000/receipts \
  -H "Authorization: Bearer $TOKEN" \
  -F "received_file=@receipt.pdf" \
  -F "transaction_type=Outflow"

# Expected Response (Duplicate - by receipt hash):
# HTTP 200
# {
#   "idempotent": true,
#   "ai_data": {
#     "total_amount": 467.00,
#     "merchant_name": "Padaria Central"
#   },
#   "database_id": 42
# }
```

### Test 2: Transaction ID Duplicate Detection
```bash
# Step 1: Upload receipt A (extracts TX_ID = "E607...")
curl -X POST http://localhost:8000/receipts \
  -H "Authorization: Bearer $TOKEN" \
  -F "received_file=@receipt_a.pdf"
# Response: database_id = 42, transaction_id = "E607..."

# Step 2: Upload receipt B (different file, SAME TX_ID extracted by OCR)
curl -X POST http://localhost:8000/receipts \
  -H "Authorization: Bearer $TOKEN" \
  -F "received_file=@receipt_b.pdf"
# Response: 
# HTTP 200
# {
#   "status": "duplicate",
#   "message": "Transaction already exists",
#   "expense_id": 42,
#   "amount": 467.00,
#   "idempotent": true,
#   "ai_data": {...}
# }
```

### Test 3: Race Condition (Concurrent Upload)
```bash
# Simulate two simultaneous requests with same receipt
# Both pass Layer 1 and Layer 2 checks (timing window)
# First one commits successfully
# Second one hits IntegrityError → Layer 3 catches it → Returns 200 with existing expense

# Test with: ab (Apache Bench) or similar tool
ab -n 2 -c 2 \
  -H "Authorization: Bearer $TOKEN" \
  -p receipt.pdf \
  http://localhost:8000/receipts

# Expected: Both return 200 OK
```

### Test 4: Different User (Same Transaction ID)
```bash
# User A uploads receipt
curl -X POST http://localhost:8000/receipts \
  -H "Authorization: Bearer $TOKEN_USER_A" \
  -F "received_file=@receipt.pdf"
# Response: database_id = 42, user_id = "user_a_uid"

# User B uploads same receipt
curl -X POST http://localhost:8000/receipts \
  -H "Authorization: Bearer $TOKEN_USER_B" \
  -F "received_file=@receipt.pdf"
# Response: database_id = 43, user_id = "user_b_uid" ✅ ALLOWED!
# (Different user, so not a duplicate)
```

## Debug Output Interpretation

When you upload, check your server logs for these messages:

### Successful New Insert
```
DEBUG: New expense created successfully - ID: 42, TX_ID: E60701190202604021604DY59BYCDP5Y
```

### Pre-Insert Check Hit (Layer 2)
```
DEBUG: Duplicate transaction_id detected during pre-insert check: E60701190202604021604DY59BYCDP5Y for user dev.gabrielferreira@gmail.com
```
Response returns immediately with `{"status": "duplicate", ...}`

### Concurrent Insert (Layer 3)
```
DEBUG: Database error caught - Type: IntegrityError, Message: UNIQUE constraint failed: expenses.transaction_id
DEBUG: IntegrityError for transaction_id detected, querying existing record...
DEBUG: Found existing expense - ID: 42, Amount: 467.00
```
Response returns with `{"status": "duplicate", ...}` (200 OK, not 500 error)

### Receipt Hash Duplicate (Layer 1)
```
[No debug - handled before creating Expense object]
Response: {"idempotent": true, ...}
```

## Expected HTTP Status Codes

| Scenario | Status | Response |
|----------|--------|----------|
| New receipt | 200 | `"idempotent": false` |
| Duplicate by hash | 200 | `"idempotent": true` |
| Duplicate by TX_ID (pre-check) | 200 | `"status": "duplicate"` |
| Duplicate by TX_ID (race condition) | 200 | `"status": "duplicate"` |
| OCR/AI error | 500 | `"Erro crítico: ..."` |
| No auth token | 401 | `"Missing or invalid Authorization header"` |
| No receipt/URL/note | 400 | `"Nenhum dado enviado"` |

## Key Code Sections

### Layer 1: Receipt Hash Check (Early return)
```python
# Line 378-385
existing_expense = db.query(models.Expense).filter(
    models.Expense.receipt == sha256_hash,
    models.Expense.user_id == uid
).first()
if existing_expense:
    return {"idempotent": True, "ai_data": {...}, "database_id": existing_expense.id}
```

### Layer 2: Transaction ID Pre-Insert Check
```python
# Line 431-445
if tx_id:
    existing_by_tx_id = db.query(models.Expense).filter(
        models.Expense.transaction_id == tx_id,
        models.Expense.user_id == uid
    ).first()
    if existing_by_tx_id:
        print(f"DEBUG: Duplicate transaction_id detected...")
        return {"status": "duplicate", "message": "Transaction already exists", ...}
```

### Layer 3: Try-Except Wrapper (Race condition handler)
```python
# Line 457-490
try:
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    cache_invalidate_all()
    return {"idempotent": False, "ai_data": extracted_data, "database_id": db_expense.id}
except Exception as db_error:
    from sqlalchemy.exc import IntegrityError
    db.rollback()
    
    if isinstance(db_error, IntegrityError):
        if "transaction_id" in str(db_error).lower() or "uq_user_transaction_id" in str(db_error).lower():
            existing = db.query(models.Expense).filter(
                models.Expense.transaction_id == tx_id,
                models.Expense.user_id == uid
            ).first()
            if existing:
                return {"status": "duplicate", "message": "Transaction already exists (race condition handled)", ...}
    raise db_error
```

## Performance Characteristics

| Layer | Latency | Trigger |
|-------|---------|---------|
| Layer 1 | ~1ms | Second receipt with same hash |
| Layer 2 | ~1ms | Different receipt, same TX_ID |
| Layer 3 | ~10ms | Race condition between concurrent requests |

Total for duplicate: **~1-10ms** instead of 500+ error

## Database Constraint

**File**: `backend/models.py`
```python
__table_args__ = (
    UniqueConstraint('user_id', 'transaction_id', name='uq_user_transaction_id'),
)
```

**Effect**: Prevents ANY duplicate `(user_id, transaction_id)` pair at database level

**Scope**: Per-user (same TX_ID allowed for different users)

## Migration Status

✅ Automatic constraint creation on startup:
- PostgreSQL: Constraint added via `ALTER TABLE` during migration
- SQLite: Constraint handled by pre-insert check + try-except

## Troubleshooting

### Issue: Still getting 500 error
**Check**:
1. Verify `tx_id` is being extracted: Look for `TX_ID: ...` in logs
2. Verify Layer 2 check is running: Look for `DEBUG: Duplicate transaction_id detected`
3. Verify Layer 3 is catching error: Look for `DEBUG: Database error caught - Type: IntegrityError`
4. Check database connection: Is the database accepting writes?

### Issue: Getting 200 but unexpected response format
**Check**:
1. Is it from Layer 1 (receipt hash)? Response has `"idempotent": true`
2. Is it from Layer 2 (TX_ID pre-check)? Response has `"status": "duplicate"`
3. Is it from Layer 3 (race condition)? Response has `"message": "... (race condition handled)"`

### Issue: Different responses from same upload
**Cause**: Likely hitting different layers (race condition between checks)
**Solution**: All layers return 200 + duplicate info, so client should accept any

## Testing Checklist

- [ ] Upload new receipt → 200 OK, `"idempotent": false`
- [ ] Upload same receipt again → 200 OK, `"idempotent": true`
- [ ] Upload different receipt with same TX_ID → 200 OK, `"status": "duplicate"`
- [ ] Concurrent upload of same receipt → Both return 200 OK
- [ ] Different user uploads same receipt → New expense created (200 OK, different ID)
- [ ] Check server logs for all three debug messages
- [ ] Verify no 500 errors for duplicate scenarios

## Files Modified

- `backend/main.py` - Lines 378-385, 431-445, 457-490
- `backend/models.py` - UniqueConstraint added
- `backend/database.py` - No changes

---

**Status**: ✅ Ready for Production Testing  
**Backward Compatible**: Yes  
**Breaking Changes**: None  
**Rollback Path**: Remove try-except, revert models.py

