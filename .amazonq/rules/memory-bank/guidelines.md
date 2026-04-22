# Development Guidelines

## Code Quality Standards

### TypeScript/JavaScript Conventions
- **Strict TypeScript**: All frontend code uses TypeScript with strict type checking
- **Explicit typing**: Interface definitions for all data structures (e.g., `TransactionEntity`, `TransactionState`)
- **Type safety**: Use of discriminated unions for state management (`transaction_type: "Inflow" | "Outflow"`)
- **Async/await**: Consistent use of async/await over promises for asynchronous operations
- **Error handling**: Try-catch blocks with graceful degradation for network failures

### Python Conventions
- **Type hints**: Function signatures include type annotations (e.g., `def fmt_real(valor: float) -> str`)
- **Pydantic models**: Data validation using Pydantic BaseModel classes (`TransactionExport`, `ExportRequest`)
- **Docstrings**: Triple-quoted docstrings for complex functions explaining purpose and behavior
- **Exception handling**: Specific exception types with detailed error messages for debugging

### Naming Standards
- **camelCase**: TypeScript/JavaScript variables and functions (`fetchTransactions`, `isLoading`)
- **PascalCase**: React components, TypeScript interfaces, Python classes (`TransactionEntity`, `ExpenseTracker`)
- **snake_case**: Python variables, database columns, API fields (`merchant_name`, `total_amount`, `deleted_at`)
- **SCREAMING_SNAKE_CASE**: Constants and configuration values (`CACHE_TTL_SECONDS`, `MEMORY_THRESHOLD_MB`)
- **Prefixes**: Boolean variables prefixed with `is`, `has`, `should` (`isLoading`, `hasError`, `shouldSync`)

### Code Organization
- **Single responsibility**: Functions focused on one task (e.g., `handleCategorization`, `handleFraudDetection`)
- **Separation of concerns**: Clear boundaries between UI, state, API, and business logic layers
- **Modular structure**: Related functionality grouped in dedicated files/modules
- **Minimal imports**: Import only what's needed, avoid wildcard imports

## Architectural Patterns

### Frontend Architecture

**State Management (Zustand)**
```typescript
// Pattern: Zustand store with computed values and async actions
export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  totalInflow: 0,
  totalOutflow: 0,
  balance: 0,
  
  fetchTransactions: async () => {
    set({ isLoading: true });
    // Fetch logic
    set({ transactions: data, isLoading: false });
  }
}));
```
- Centralized state with Zustand for global application state
- Computed values (totalInflow, totalOutflow, balance) derived from transactions array
- Async actions return promises for error handling
- State updates via `set()` function, access current state via `get()`

**React Component Patterns**
```typescript
// Pattern: Client component with hooks and memoization
"use client";

export default function ExpenseTracker() {
  const { transactions, fetchTransactions } = useTransactionStore();
  const { t, formatCurrency } = useI18n();
  
  const categoriesData = useMemo(() => {
    // Expensive computation
  }, [transactions]);
  
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);
}
```
- `"use client"` directive for client-side rendering
- Custom hooks for reusable logic (`useI18n`, `useHaptics`, `useTransactionStore`)
- `useMemo` for expensive computations that depend on state
- `useEffect` for side effects (data fetching, subscriptions)
- Destructuring for cleaner code

**API Integration**
```typescript
// Pattern: Authenticated fetch with error handling
const response = await authenticatedFetch(getApiUrl("/receipts"), {
  method: "POST",
  body: formData,
});

if (response.ok) {
  const data = await response.json();
  // Process success
} else {
  if (response.status === 401) {
    alert("Sessão expirou");
  }
  // Handle error
}
```
- Centralized API URL construction via `getApiUrl()`
- Firebase authentication wrapper `authenticatedFetch()`
- Explicit status code checking (401 for auth, 404 for not found)
- JSON parsing only after status validation

### Backend Architecture

**FastAPI Route Patterns**
```python
@app.post("/receipts")
async def process_ata(
    received_file: UploadFile = File(None),
    note: str = Form(None),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_firebase_token),
):
    # Idempotency check
    existing = db.query(models.Expense).filter(
        models.Expense.receipt == sha256_hash
    ).first()
    if existing:
        return {"idempotent": True, "database_id": existing.id}
    
    # Process and create
    db_expense = models.Expense(...)
    db.add(db_expense)
    db.commit()
    cache_invalidate_all()
    return {"idempotent": False, "database_id": db_expense.id}
```
- Dependency injection for database sessions and authentication
- Idempotency checks using content hashing (SHA256)
- Explicit cache invalidation after mutations
- Structured response objects with clear success/failure indicators

**Caching Strategy**
```python
# Pattern: LRU cache with TTL
class LRUCache:
    def get(self, key: str):
        if key not in self._store:
            self.misses += 1
            return None
        data, expires_at = self._store[key]
        if time.time() > expires_at:
            del self._store[key]
            return None
        self._store.move_to_end(key)
        self.hits += 1
        return data
```
- LRU eviction policy with OrderedDict
- TTL-based expiration (60 seconds default)
- Hit/miss statistics for monitoring
- Cache warm-up on application startup

**Database Patterns**
```python
# Pattern: Soft delete with timestamp
@app.patch("/expenses/{expense_id}")
def update_expense(expense_id: int, updates: dict, db: Session = Depends(get_db)):
    db_expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id
    ).first()
    
    for key, value in updates.items():
        if key == 'deleted_at' and value:
            setattr(db_expense, key, datetime.utcnow())
        else:
            setattr(db_expense, key, value)
    
    db.commit()
    cache_invalidate_all()
```
- Soft deletes using `deleted_at` timestamp column
- Dynamic field updates via dictionary iteration
- Explicit commit after changes
- Cache invalidation after mutations

## Internal API Usage

### Transaction Processing Pipeline
```python
# 1. File upload → Hash generation
sha256_hash = hashlib.sha256(content).hexdigest()

# 2. Idempotency check
existing = db.query(models.Expense).filter(
    models.Expense.receipt == sha256_hash
).first()

# 3. OCR extraction
ocr_data, raw_text = ocr_processor.extract_transaction_data(content, ext)

# 4. AI enhancement
extracted_data, ai_error = await analyze_receipt_with_ai(content, ext, ocr_text=raw_text)

# 5. Database persistence
db_expense = models.Expense(
    date=date_obj,
    amount=extracted_data.get("total_amount", 0.0),
    merchant=extracted_data.get("merchant_name", "Desconhecido"),
    receipt=sha256_hash
)
db.add(db_expense)
db.commit()
```

### State Synchronization Pattern
```typescript
// Frontend: Optimistic update + backend sync
await addTransaction(newTx);  // Local IndexedDB
await syncWithBackend();      // Fetch latest from server

// Backend: Merge strategy
const merged: TransactionEntity = {
  ...existing,
  ...remoteData,
  deleted_at: remoteData.deleted_at || existing?.deleted_at
};
await db.put('transactions', merged);
```

### Internationalization (i18n)
```typescript
// Pattern: Translation keys with interpolation
const { t, formatCurrency, formatDate } = useI18n();

<h1>{t('dashboard.title')}</h1>
<p>{t('common.transactions', { count: transactions.length })}</p>
<span>{formatCurrency(amount)}</span>
<time>{formatDate(date, 'PP p')}</time>
```
- Translation files in `messages/` directory (en.json, es.json, pt-BR.json)
- Context-aware formatting (currency, dates) based on locale
- Interpolation for dynamic values
- Fallback to key name if translation missing

## Frequently Used Idioms

### React Patterns
```typescript
// Conditional rendering with early return
if (!mounted || isLoadingData) {
  return <LoadingSpinner />;
}

// Ternary for inline conditionals
className={`btn ${isActive ? 'active' : 'inactive'}`}

// Optional chaining for safe property access
const email = user?.email || 'Not available';

// Array methods for data transformation
const categories = transactions
  .filter(tx => tx.transaction_type === 'Outflow')
  .map(tx => tx.category)
  .reduce((acc, cat) => ({ ...acc, [cat]: (acc[cat] || 0) + 1 }), {});
```

### Python Patterns
```python
# List comprehension for filtering
active_txs = [tx for tx in transactions if not tx.deleted_at]

# Dictionary comprehension for grouping
cat_totals = {
    cat: sum(tx.amount for tx in txs if tx.category == cat)
    for cat in categories
}

# Context managers for resource handling
with engine.begin() as conn:
    conn.execute(text("ALTER TABLE..."))

# F-strings for formatting
print(f"CACHE HIT | key={key[:16]} | {len(data)} records")
```

### Async Patterns
```typescript
// Parallel execution with Promise.all
const [transactions, categories, budgets] = await Promise.all([
  fetchTransactions(),
  fetchCategories(),
  fetchBudgets()
]);

// Sequential with error handling
try {
  await uploadFile();
  await processOCR();
  await saveToDatabase();
} catch (error) {
  console.error("Pipeline failed:", error);
  rollback();
}
```

## Popular Annotations and Decorators

### FastAPI Decorators
```python
@app.post("/receipts")           # HTTP method + route
@app.on_event("startup")         # Lifecycle hooks
@app.middleware("http")          # Request/response middleware
```

### Python Type Hints
```python
from typing import List, Optional, Dict

def process(data: List[Dict[str, str]]) -> Optional[str]:
    pass
```

### React/Next.js Directives
```typescript
"use client"                     // Client-side rendering
"use server"                     // Server-side execution
```

## Performance Optimizations

### Frontend
- **Lazy loading**: Dynamic imports for heavy libraries (Recharts)
- **Memoization**: `useMemo` for expensive computations
- **Pagination**: Limit displayed items (6 per page)
- **Debouncing**: Search input delays to reduce re-renders
- **Code splitting**: Route-based chunks via Next.js App Router

### Backend
- **Caching**: LRU cache with 60s TTL for read-heavy endpoints
- **Connection pooling**: SQLAlchemy engine with connection reuse
- **Async operations**: FastAPI async/await for I/O-bound tasks
- **Batch operations**: `createMany` for bulk inserts
- **Index usage**: Database indexes on frequently queried columns

## Security Practices

### Authentication
- Firebase Admin SDK for token verification on backend
- Token refresh handled automatically by Firebase client
- Protected routes require `Depends(verify_firebase_token)`
- User ownership verification before mutations

### Data Validation
- Pydantic schemas for request/response validation
- Input sanitization for SQL injection prevention
- File type validation before processing
- Content-Type verification for uploads

### CORS Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if DEBUG else origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)
```

### Security Headers
```python
response.headers["X-Content-Type-Options"] = "nosniff"
response.headers["X-Frame-Options"] = "DENY"
response.headers["Strict-Transport-Security"] = "max-age=31536000"
```

## Testing Patterns

### File Naming
- Test files prefixed with `test_` (e.g., `test_ocr.py`, `test_models.py`)
- Located alongside source files or in dedicated test directories
- Multiple test files for different aspects (extraction, models, API)

### Common Test Scenarios
- OCR extraction accuracy (`test_easyocr.py`, `test_ocr.py`)
- AI agent processing (`test_full_agent.py`, `test_nemotron.py`)
- Database models (`test_models.py`)
- API endpoints (`test_backend_link.py`)
- Export functionality (`test_pdf_export.py`)

## Documentation Standards

### Code Comments
- Inline comments for complex logic or non-obvious decisions
- Section headers with ASCII art separators in large files
- TODO/FIXME markers for future improvements
- Performance notes for optimization decisions

### Function Documentation
```python
def fmt_real(valor: float) -> str:
    """Formata valor em R$ padrão brasileiro (Receita Federal)."""
    # Implementation
```

### API Documentation
- FastAPI automatic OpenAPI/Swagger generation
- Pydantic models serve as schema documentation
- Response models specified in route decorators
- Tags for logical grouping of endpoints

## Common Pitfalls to Avoid

1. **Cache invalidation**: Always call `cache_invalidate_all()` after mutations
2. **Timezone handling**: Use UTC for storage, convert to local for display
3. **Soft delete queries**: Filter `deleted_at IS NULL` for active records
4. **IndexedDB transactions**: Always await `txSet.done` before proceeding
5. **Firebase auth**: Check token expiration and handle 401 responses
6. **File cleanup**: Remove temporary files in finally blocks
7. **Type coercion**: Explicit conversion for database numeric fields (`Number(item.amount)`)
8. **Idempotency**: Check for duplicates using content hash before insertion
