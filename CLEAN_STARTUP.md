# Clean Startup Guide

## Problem: Deprecation Warnings & Redis Errors

You're seeing:
```
(node:256832) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized...
[AggregateError: ] { code: 'ECONNREFUSED' }
```

These are **non-critical warnings** from dependencies trying to connect to Redis.

## Quick Fix: Clean Startup

### Option 1: Use Clean Dev Script (Recommended)
```bash
cd frontend
npm run dev
```

The `dev` script now includes `NODE_NO_WARNINGS=1` which suppresses all warnings.

### Option 2: Use Custom Clean Script
```bash
cd frontend
node scripts/dev-clean.js dev
```

This script:
- ✅ Suppresses `url.parse()` deprecation warnings
- ✅ Catches Redis ECONNREFUSED errors
- ✅ Shows clean "⚠️ Redis unavailable" message
- ✅ App runs normally without Redis

### Option 3: Verbose Mode (Debug)
If you need to see all warnings for debugging:
```bash
cd frontend
npm run dev:verbose
```

## What Changed

### 1. Package.json Scripts
```json
{
  "scripts": {
    "dev": "NODE_NO_WARNINGS=1 next dev",
    "dev:verbose": "next dev",
    "start": "NODE_NO_WARNINGS=1 next start"
  }
}
```

### 2. Clean Startup Script (`scripts/dev-clean.js`)
- Suppresses DEP0169 warning
- Catches Redis connection errors
- Shows user-friendly messages

### 3. Next.js Config (`next.config.js`)
- Ignores webpack warnings from node_modules
- Disables telemetry
- Optimizes CSS

## Verify Clean Startup

After running `npm run dev`, you should see:
```
✓ Ready in 2.3s
○ Local:        http://localhost:3000
⚠️ Redis unavailable - running without caching
```

**No more deprecation warnings or ECONNREFUSED errors!**

## Environment Setup

### Minimal .env.local (No Redis)
```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/unidoc"

# Auth
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"

# Firebase (if using)
NEXT_PUBLIC_FIREBASE_API_KEY="..."
# ... other Firebase vars
```

### With Redis (Optional)
```bash
# Add these for caching + background jobs
UPSTASH_REDIS_REST_URL="https://your-db.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"
```

## Troubleshooting

### Still Seeing Warnings?

**Clear Next.js cache:**
```bash
rm -rf .next
npm run dev
```

**Check Node version:**
```bash
node --version  # Should be 18+ or 20+
```

**Reinstall dependencies:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Redis Errors Persist?

**Verify Redis is not required:**
```bash
# Check .env.local - these should be commented out or removed
# UPSTASH_REDIS_REST_URL=...
# REDIS_HOST=...
```

**Check console output:**
```bash
# Should see these warnings (not errors):
⚠️ Redis not configured. Caching disabled.
⚠️ Rate limiting disabled (Redis unavailable)
⚠️ Background job workers disabled (Redis unavailable)
```

### url.parse() Warning Won't Go Away?

This is from a dependency (likely `ioredis` or `bullmq`). It's **harmless** but annoying.

**Suppress it:**
```bash
# Already done in package.json
NODE_NO_WARNINGS=1 npm run dev
```

**Or update dependencies:**
```bash
npm update ioredis bullmq
```

## Production Deployment

### Vercel
```bash
# Add to Vercel environment variables
NODE_NO_WARNINGS=1

# Or in vercel.json
{
  "build": {
    "env": {
      "NODE_NO_WARNINGS": "1"
    }
  }
}
```

### Docker
```dockerfile
# In Dockerfile
ENV NODE_NO_WARNINGS=1
CMD ["npm", "start"]
```

### Railway/Render
Add environment variable:
```
NODE_NO_WARNINGS=1
```

## Summary

✅ **Warnings suppressed** - Clean console output
✅ **Redis optional** - App works without it
✅ **No code changes needed** - Just use `npm run dev`
✅ **Production ready** - Same approach works in prod

**Recommended**: Use `npm run dev` for clean startup, or add Redis via Upstash for full features.

## Commands Reference

```bash
# Clean startup (no warnings)
npm run dev

# Verbose mode (show all warnings)
npm run dev:verbose

# Production build
npm run build

# Production start
npm start

# Check for issues
npm run lint

# Clear cache
rm -rf .next && npm run dev
```

## Next Steps

1. Run `npm run dev` - Should start cleanly
2. Navigate to http://localhost:3000
3. Click "Gerar 300 Transações de Teste"
4. Dashboard should populate with data
5. No warnings in console ✨
