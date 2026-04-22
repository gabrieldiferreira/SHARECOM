# Fix Empty Dashboard - Complete Guide

## Problem: Dashboard Shows No Data

### Root Causes
1. **No data in database** - User hasn't uploaded any transactions yet
2. **userId mismatch** - Auth session userId doesn't match database records
3. **API endpoint not returning data** - Backend query filtering incorrectly
4. **Frontend not fetching** - Store not calling API or handling response

## Solution 1: Seed Mock Data (Fastest)

### Using UI Button
1. Navigate to dashboard (empty state will show)
2. Click **"Gerar 300 Transações de Teste"** button
3. Wait for seed to complete (~3-5 seconds)
4. Page will auto-reload with data

### Using API Directly
```bash
curl -X POST http://localhost:3000/api/seed \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

### What Gets Created
- **300 realistic transactions** spanning 90 days
- **Varied merchants**: Starbucks, Uber, iFood, Nubank, etc.
- **Multiple categories**: eating_out, groceries, transport, health, etc.
- **Payment methods**: pix, card, cash, transfer
- **Income/Expense split**: 15% income, 85% expense
- **Recurring patterns**: 20% marked as recurring

## Solution 2: Debug Data Loading

### Check Console Logs
Open browser DevTools (F12) and look for:
```
✅ Transactions loaded: 0
📊 Sample transaction: undefined
```

If you see `0` transactions, the issue is either:
- No data in database
- API not returning data
- Auth issue

### Verify API Endpoint
Test the transactions API directly:
```bash
# Check if API returns data
curl http://localhost:3000/api/transactions \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"
```

Expected response:
```json
{
  "transactions": [...],
  "nextCursor": null
}
```

### Check Database Directly
```bash
# Connect to Postgres
psql $DATABASE_URL

# Count transactions
SELECT COUNT(*) FROM transactions;

# Check user_id values
SELECT DISTINCT user_id FROM transactions;

# Verify your session user_id matches
SELECT id, email FROM users;
```

## Solution 3: Verify Auth & UserId

### Check Session
Add this to your component:
```typescript
useEffect(() => {
  console.log('🔐 Session:', session);
  console.log('👤 User ID:', session?.user?.id);
}, [session]);
```

### Check API Query
In `src/server/api/routers/transactions.ts`:
```typescript
list: protectedProcedure
  .query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    console.log('🔍 Querying for userId:', userId);
    
    const transactions = await ctx.prisma.transaction.findMany({
      where: { user_id: userId },
    });
    
    console.log('📦 Found transactions:', transactions.length);
    return { transactions };
  }),
```

## Solution 4: Force Mock Data (Testing)

### Temporary Hardcoded Data
Add to dashboard component:
```typescript
const mockTransactions: TransactionEntity[] = [
  {
    id: '1',
    merchant_name: 'Starbucks',
    total_amount: 680,
    category: 'eating_out',
    currency: 'BRL',
    transaction_date: new Date().toISOString(),
    transaction_type: 'Outflow',
    payment_method: 'pix',
    is_synced: false,
  },
  {
    id: '2',
    merchant_name: 'Uber',
    total_amount: 2500,
    category: 'transport',
    currency: 'BRL',
    transaction_date: new Date().toISOString(),
    transaction_type: 'Outflow',
    payment_method: 'card',
    is_synced: false,
  },
];

// Use mock data temporarily
const displayTransactions = transactions.length > 0 ? transactions : mockTransactions;
```

## Solution 5: Empty State Handling

### Current Implementation
The dashboard already has proper empty state:
```typescript
{transactions.length > 0 ? (
  <DashboardContent />
) : (
  <EmptyState
    icon={<FileText />}
    title="Nenhuma transação ainda"
    description="Envie seu primeiro comprovante..."
    action={<SeedDataButton />}
  />
)}
```

### Components Created
- **EmptyState** (`src/components/EmptyState.tsx`): Reusable empty state UI
- **SeedDataButton** (`src/components/SeedDataButton.tsx`): One-click seed trigger

## Troubleshooting Checklist

### Frontend Issues
- [ ] Check browser console for errors
- [ ] Verify `transactions.length` in React DevTools
- [ ] Check if `fetchTransactions()` is being called
- [ ] Verify `useTransactionStore` state updates
- [ ] Check network tab for API calls

### Backend Issues
- [ ] Verify database connection (`DATABASE_URL` env var)
- [ ] Check if seed endpoint works (`POST /api/seed`)
- [ ] Verify Prisma schema matches database
- [ ] Check if `user_id` column exists in transactions table
- [ ] Run `npx prisma generate` to update client

### Auth Issues
- [ ] Verify user is logged in (check session)
- [ ] Check if `userId` is being passed to API
- [ ] Verify `protectedProcedure` middleware works
- [ ] Check if Firebase auth token is valid

### Database Issues
- [ ] Run migrations: `npx prisma migrate dev`
- [ ] Check if tables exist: `\dt` in psql
- [ ] Verify foreign key constraints
- [ ] Check if user record exists in `users` table

## API Endpoints

### Seed Data
```
POST /api/seed
Response: {
  success: true,
  transactionsCreated: 300,
  userId: "...",
  accountId: "..."
}
```

### List Transactions
```
GET /api/transactions
Query params:
  - cursor: string (pagination)
  - limit: number (default 50)
  - dateRange: { start, end }
  - categories: string[]
  - search: string
```

### Create Transaction
```
POST /api/transactions
Body: {
  amount_cents: number,
  type: "income" | "expense",
  merchant_name: string,
  category_id: string,
  datetime: Date,
  payment_method: string
}
```

## Performance Targets

- **Seed time**: <5 seconds for 300 transactions
- **Dashboard load**: <200ms with cached data
- **Transaction fetch**: <100ms for 50 items
- **Empty state render**: <50ms

## Common Errors & Fixes

### Error: "Unauthorized"
**Cause**: No valid session or expired token
**Fix**: Re-login or check NextAuth configuration

### Error: "Prisma Client not generated"
**Cause**: Prisma client out of sync
**Fix**: Run `npx prisma generate`

### Error: "Table 'transactions' doesn't exist"
**Cause**: Migrations not run
**Fix**: Run `npx prisma migrate dev`

### Error: "Cannot read property 'length' of undefined"
**Cause**: `transactions` is undefined instead of empty array
**Fix**: Initialize with `[]` in store

### Error: "Network request failed"
**Cause**: Backend not running or wrong API URL
**Fix**: Check `NEXT_PUBLIC_API_BASE_URL` and start backend

## Testing the Fix

### Step 1: Clear Everything
```bash
# Clear browser storage
localStorage.clear();
sessionStorage.clear();

# Clear database (optional)
npx prisma migrate reset
```

### Step 2: Seed Data
```bash
# Via API
curl -X POST http://localhost:3000/api/seed

# Or click UI button
```

### Step 3: Verify Dashboard
- [ ] Hero balance card shows correct total
- [ ] Metric cards display income/expense
- [ ] Transaction list shows recent items
- [ ] Charts render with data
- [ ] Categories breakdown visible
- [ ] No console errors

## Success Criteria

✅ Dashboard loads in <200ms
✅ All 8 dashboard modes work
✅ Charts display correctly
✅ Transactions list paginated
✅ Empty state shows when no data
✅ Seed button creates 300 transactions
✅ Console logs show transaction count
✅ No white-on-white or black-on-black text
✅ Theme toggle works in both modes

## Next Steps

1. **Test seed endpoint**: Click "Gerar 300 Transações de Teste"
2. **Check console**: Look for "✅ Transactions loaded: 300"
3. **Verify dashboard**: All cards should populate
4. **Test interactions**: Click through tabs, filters, pagination
5. **Check both themes**: Toggle dark/light mode

## Support

If issues persist:
1. Check browser console for errors
2. Verify database connection
3. Test API endpoints directly
4. Check auth session validity
5. Review Prisma schema vs database
