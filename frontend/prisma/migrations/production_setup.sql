-- ============================================================
-- SHARECOM Production Database Setup
-- Neon Postgres (free tier: 512MB, auto-suspend)
-- Run once during initial deployment
-- ============================================================

-- ── 1. PERFORMANCE INDEXES ──────────────────────────────────────────────────

-- Primary query pattern: user's recent transactions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_datetime
  ON transactions (user_id, datetime DESC)
  WHERE deleted_at IS NULL;

-- Category breakdown queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_category
  ON transactions (user_id, category_id)
  WHERE deleted_at IS NULL AND type = 'expense';

-- Merchant/entity queries (top payees)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_merchant
  ON transactions (user_id, merchant_name)
  WHERE deleted_at IS NULL AND merchant_name IS NOT NULL;

-- Payment method analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_payment_method
  ON transactions (user_id, payment_method)
  WHERE deleted_at IS NULL;

-- Auth code lookup (fraud detection)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_auth_code
  ON transactions (authentication_code)
  WHERE authentication_code IS NOT NULL AND deleted_at IS NULL;

-- Recurring detection
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_recurring
  ON transactions (user_id, is_recurring)
  WHERE is_recurring = true AND deleted_at IS NULL;

-- Alerts (unread count queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_user_unread
  ON alerts (user_id, created_at DESC)
  WHERE is_read = false;

-- Budgets monthly lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_budgets_user_month
  ON budgets (user_id, month);

-- ── 2. MATERIALIZED VIEW: Monthly user stats ─────────────────────────────────
-- Pre-computed aggregates: refreshed nightly by cron
-- Cash flow dashboards use this instead of live aggregation

CREATE TABLE IF NOT EXISTS user_monthly_stats (
  user_id        TEXT NOT NULL,
  month          TIMESTAMPTZ NOT NULL,
  income_cents   INT DEFAULT 0,
  expense_cents  INT DEFAULT 0,
  tx_count       INT DEFAULT 0,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_stats_user
  ON user_monthly_stats (user_id, month DESC);

-- ── 3. TEMPORAL HEATMAP PRE-COMPUTE ─────────────────────────────────────────
-- Hour × weekday spending intensity — refreshed daily

CREATE TABLE IF NOT EXISTS user_temporal_cache (
  user_id       TEXT NOT NULL,
  hour_of_day   SMALLINT NOT NULL,  -- 0-23
  day_of_week   SMALLINT NOT NULL,  -- 0=Sun, 6=Sat
  total_cents   INT DEFAULT 0,
  tx_count      INT DEFAULT 0,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, hour_of_day, day_of_week)
);

-- ── 4. AUDIT LOG (append-only, for compliance) ───────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  action      TEXT NOT NULL,  -- 'create', 'update', 'delete', 'login'
  resource    TEXT NOT NULL,  -- 'transaction', 'goal', 'budget'
  resource_id TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log is write-heavy, read-rarely — optimize for inserts
CREATE INDEX IF NOT EXISTS idx_audit_user_date
  ON audit_log (user_id, created_at DESC);

-- ── 5. CATEGORY TRANSLATIONS ─────────────────────────────────────────────────
-- Already in schema.prisma — this is a reminder to seed it

-- ── 6. ANALYZE TABLES (update planner statistics) ───────────────────────────
ANALYZE transactions;
ANALYZE users;
ANALYZE accounts;
ANALYZE categories;
ANALYZE alerts;

-- ── 7. QUERY TUNING SETTINGS ────────────────────────────────────────────────
-- These apply per-session; set in DATABASE_URL as search_path or via app code

-- Enable parallel query execution (Neon supports it)
-- SET max_parallel_workers_per_gather = 2;

-- Work memory for sort/hash operations (increase if you have RAM)
-- SET work_mem = '16MB';

-- ── 8. NEON-SPECIFIC OPTIMIZATIONS ──────────────────────────────────────────
-- Neon uses connection pooling — set via DATABASE_URL params:
-- ?connection_limit=1&pool_timeout=10&connect_timeout=15
-- 
-- Auto-suspend: Neon free tier suspends after 5min inactivity
-- Our connect_timeout=15s handles the ~500ms wake-up time
--
-- To use Neon's built-in pooler (recommended for serverless):
-- Use the pooler endpoint URL: postgres://...@ep-xxx.pooler.neon.tech/neondb
-- Add ?pgbouncer=true to disable prepared statements

-- ── 9. FUTURE: TABLE PARTITIONING (activate at 100k transactions) ────────────
-- Uncomment when transactions table exceeds 100k rows
--
-- CREATE TABLE transactions_partitioned (
--   LIKE transactions INCLUDING ALL
-- ) PARTITION BY RANGE (datetime);
--
-- CREATE TABLE transactions_2026_01 PARTITION OF transactions_partitioned
--   FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- (continue for each month)
