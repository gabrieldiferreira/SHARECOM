# Backend Engine Architecture

## Complete Dashboard Backend System

### Database Schema (PostgreSQL + Prisma ORM)

**Schema Location**: `frontend/prisma/schema.prisma`

**Core Tables**:
- `users`: id, name, email, cpf_hash, locale, currency, created_at
- `accounts`: id, user_id, institution, masked_number, balance_cents, type (checking/savings/credit), currency
- `transactions`: id, user_id, account_id, amount_cents, type (income/expense), category_id, merchant_name, merchant_logo_url, description, datetime, payment_method (pix/card/cash/transfer), pix_key, authentication_code, transaction_external_id, location_lat, location_lng, tags (jsonb), is_recurring, recurrence_pattern, version, created_at, deleted_at
- `categories`: id, name, icon, color, parent_id, is_deductible
- `goals`: id, user_id, name, target_amount_cents, current_amount_cents, deadline, saving_rules (jsonb), created_at
- `budgets`: id, user_id, category_id, month (YYYY-MM), limit_amount_cents
- `alerts`: id, user_id, type (unusual_amount/first_time_recipient/high_frequency/balance_threshold/duplicate_payment/fraud_suspect), severity (info/warning/critical), message, metadata (jsonb), is_read, created_at

**Indexes**:
- (user_id, datetime)
- (user_id, category_id)
- (user_id, merchant_name)
- (pix_key)
- (transaction_external_id)
- (idempotency_key)

### API Layer (tRPC + Next.js API Routes)

**Authentication**: NextAuth.js + JWT with Firebase Admin SDK
**Rate Limiting**: 100 req/min per user via Upstash Redis
**Input Validation**: Zod schemas on all procedures
**Error Handling**: Custom TRPCError with detailed messages

### Core API Procedures

#### Transactions Router (`src/server/api/routers/transactions.ts`)

**transactions.list**
```typescript
Input: {
  dateRange?: { start: Date, end: Date },
  categories?: string[],
  accounts?: string[],
  minAmount?: number,
  maxAmount?: number,
  search?: string,
  paymentMethods?: PaymentMethod[],
  cursor?: string,
  limit: number (1-100, default 50)
}
Output: {
  transactions: Transaction[],
  nextCursor?: string
}
```

**transactions.create**
```typescript
Input: {
  account_id?: string,
  amount_cents: number,
  type: 'income' | 'expense',
  category_id?: string,
  merchant_name?: string,
  description?: string,
  datetime: Date,
  payment_method?: 'pix' | 'card' | 'cash' | 'transfer',
  pix_key?: string,
  authentication_code?: string,
  transaction_external_id?: string,
  location_lat?: number,
  location_lng?: number,
  tags?: string[],
  idempotency_key?: string
}
Output: Transaction
```
- Deduplication via transaction_external_id
- Idempotency via idempotency_key
- Auto-triggers: categorization, fraud detection, goal progress jobs
- Cache invalidation

**transactions.update**
```typescript
Input: {
  id: string,
  data: {
    category_id?: string,
    merchant_name?: string,
    description?: string,
    tags?: string[],
    amount_cents?: number
  }
}
Output: Transaction
```

**transactions.delete** (soft delete)
```typescript
Input: { id: string }
Output: { success: true }
```

**transactions.split**
```typescript
Input: {
  id: string,
  splits: Array<{
    amount_cents: number,
    category_id?: string,
    description?: string
  }>
}
Output: Transaction[]
```

#### Dashboard Router (`src/server/api/routers/dashboard-enhanced.ts`)

**dashboard.getCashFlow**
```typescript
Input: {
  timeframe: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
  startDate?: Date,
  endDate?: Date
}
Output: {
  income: number,
  expenses: number,
  net: number,
  burnRate: number,
  trend: 'positive' | 'negative' | 'neutral',
  data: Array<{
    date: Date,
    income: number,
    expenses: number,
    net: number
  }>
}
```
- Cache TTL: 5 minutes
- Burn rate: 30-day rolling average

**dashboard.getCategoryBreakdown**
```typescript
Input: { month?: string } // YYYY-MM format
Output: Array<{
  categoryId: string,
  categoryName: string,
  spent: number,
  budgeted: number | null,
  variance: number | null,
  percentOfTotal: number,
  anomalyScore: number
}>
```
- Cache TTL: 1 hour
- Anomaly detection via z-score

**dashboard.getEntityRelationships**
```typescript
Input: { limit?: number } // 1-100, default 20
Output: Array<{
  merchant: string,
  totalAmount: number,
  transactionCount: number,
  avgTicket: number,
  lastTransactionDate: Date,
  frequency: string
}>
```
- Calculates average days between transactions

**dashboard.getPaymentMethods**
```typescript
Output: Array<{
  method: string,
  count: number,
  totalAmount: number,
  avgProcessingTime: number
}>
```

**dashboard.getTemporalPatterns**
```typescript
Output: {
  heatmap: Array<{
    hour: number,
    weekday: number,
    amount: number
  }>,
  seasonal: Array<{
    month: number,
    year: number,
    total: number
  }>
}
```

**dashboard.getTransactionForensics**
```typescript
Output: {
  duplicateAuthCodes: Array<{ code: string, count: number }>,
  velocityAlerts: Array<{ hourWindow: Date, count: number }>,
  institutionReliability: Array<{
    institution: string,
    total: number,
    failed: number,
    successRate: number
  }>
}
```

**dashboard.getTaxCompliance**
```typescript
Input: { year: number }
Output: {
  deductibleExpenses: Array<{
    category: string,
    total: number,
    count: number,
    missingReceipts: number
  }>,
  merchantGroups: Array<{
    merchant: string,
    total: number,
    count: number
  }>
}
```

#### Alerts Router (`src/server/api/routers/alerts.ts`)

**alerts.list**
```typescript
Input: {
  unreadOnly?: boolean,
  severity?: 'info' | 'warning' | 'critical',
  limit?: number
}
Output: Alert[]
```

**alerts.markRead**
```typescript
Input: { alertId: string }
Output: { success: true }
```

**alerts.markAllRead**
```typescript
Output: { success: true }
```

### Background Jobs (BullMQ + Redis)

**Location**: `src/server/jobs/transaction-jobs-enhanced.ts`

**categorize-transaction**
- Calls ML microservice at `ML_SERVICE_URL/categorize`
- Input: merchant_name, description
- Output: category_id, confidence
- Updates transaction if confidence > 0.7

**fraud-detection**
- Check 1: Amount >3σ from user mean → unusual_amount alert
- Check 2: First-time merchant + amount >$200 → first_time_recipient alert
- Check 3: >5 transactions in 1 hour → high_frequency alert
- Check 4: Duplicate authentication_code → duplicate_payment alert (critical)

**detect-recurring** (daily cron)
- Groups transactions by merchant + amount (±10%)
- Calculates interval variance
- Sets is_recurring=true if variance < 20% of avg interval
- Patterns: weekly (<10 days), monthly (<35 days), quarterly

**calculate-burn-rate** (hourly)
- Aggregates last 30 days expenses
- Stores in Redis: `user:{id}:burn_rate` (TTL 1hr)

**budget-alerts** (daily midnight)
- Compares category spend vs budget for current month
- Warning alert at 80%
- Critical alert at 100%

**goal-progress**
- Triggered after transaction creation
- Checks saving_rules (category_id, merchant_name, percentage)
- Increments goal current_amount_cents

### Caching Strategy (Redis)

**Cache Keys**:
- `user:{id}:dashboard:cashflow:{timeframe}` (TTL 5min)
- `user:{id}:categories:breakdown:{month}` (TTL 1hr)
- `user:{id}:balance` (TTL 1min)
- `user:{id}:burn_rate` (TTL 1hr)
- `rate_limit:{id}` (TTL 60s)

**Pattern**: Cache-aside with stale-while-revalidate
**Invalidation**: Wildcard pattern `user:{id}:*` on mutations

### Webhook Integration (Open Finance Brazil)

**Endpoint**: `POST /api/webhooks/bank`
**Location**: `src/app/api/webhooks/bank/route.ts`

**Flow**:
1. Verify HMAC-SHA256 signature
2. Dedupe check via transaction_external_id
3. Create transaction
4. Enrich merchant logo (Google Places API)
5. Geocode location (Google Geocoding API)
6. Trigger background jobs
7. Emit websocket event (Pusher/Ably)

**Response**: `{ status: 'success', id: string }` (201) or `{ status: 'duplicate', id: string }` (200)

### Security Features

**Row-Level Security**: All queries filtered by user_id
**PII Hashing**: CPF via bcrypt
**Encryption**: Pix keys at rest (AES-256)
**Rate Limiting**: 100 req/min per user
**CSRF Protection**: NextAuth built-in
**SQL Injection Prevention**: Parameterized queries via Prisma
**Webhook Verification**: HMAC signature validation

### Performance Optimizations

**Database**:
- Partial indexes on recent data (90 days)
- Connection pooling (Prisma pool size 10)
- Materialized views for monthly stats (refresh daily)

**Caching**:
- Redis for hot data (5min-1hr TTL)
- Stale-while-revalidate pattern
- Wildcard invalidation on mutations

**Queries**:
- Raw SQL for complex aggregations
- DataLoader for N+1 prevention
- Cursor-based pagination

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
REDIS_HOST=localhost
REDIS_PORT=6379

# Authentication
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

# ML Service
ML_SERVICE_URL=https://ml-service.run.app

# Google APIs
GOOGLE_PLACES_API_KEY=...
GOOGLE_GEOCODING_API_KEY=...

# Webhooks
WEBHOOK_SECRET=...

# Real-time (optional)
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=...
```

### Deployment

**Next.js**: Vercel (serverless functions)
**PostgreSQL**: Supabase/Neon (point-in-time recovery)
**Redis**: Upstash (serverless)
**BullMQ Workers**: Railway (always-on containers)
**ML Service**: Google Cloud Run (auto-scaling 0-10)

### Monitoring

**Error Tracking**: Sentry
**APM**: DataDog
**Metrics**: Prometheus + Grafana
- transaction_create_duration (p95 <100ms)
- dashboard_load_time (p95 <200ms)
- ml_categorizer_latency (p95 <500ms)
- fraud_detection_time (p95 <1s)

**Alerts**:
- Error rate >1%
- p95 latency >500ms
- Queue depth >1000

### Testing

**Unit Tests**: Jest for business logic
**Integration Tests**: Supertest for API routes
**E2E Tests**: Playwright for critical flows
**Load Tests**: k6 at 1000 req/s

### Performance Targets

- Dashboard load: <200ms
- Transaction creation: <100ms
- ML categorization: <500ms
- Fraud detection: <1s
- Uptime: 99.9%

### Usage Examples

**Create Transaction**:
```typescript
const transaction = await trpc.transactions.create.mutate({
  amount_cents: 15000,
  type: 'expense',
  merchant_name: 'Uber',
  datetime: new Date(),
  payment_method: 'pix',
  pix_key: '11999999999',
});
```

**Get Cash Flow**:
```typescript
const cashFlow = await trpc.dashboard.getCashFlow.query({
  timeframe: 'monthly',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
});
```

**List Transactions with Filters**:
```typescript
const { transactions, nextCursor } = await trpc.transactions.list.query({
  dateRange: {
    start: new Date('2024-01-01'),
    end: new Date('2024-01-31'),
  },
  categories: ['food', 'transport'],
  minAmount: 1000,
  search: 'uber',
  limit: 50,
});
```
