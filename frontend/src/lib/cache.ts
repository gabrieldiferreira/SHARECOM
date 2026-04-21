/**
 * Caching Layer — stale-while-revalidate strategy
 * Uses Upstash Redis REST API (works in Edge + Serverless)
 *
 * Free tier: 10k commands/day → with deduplication and 5-min caches,
 * supports ~50k dashboard loads/day before hitting limits.
 */

import { redis } from './redis';

type CacheTTL = number; // seconds

// ─── TTL constants ────────────────────────────────────────────────────────────
export const TTL = {
  BALANCE: 30,              // 30s — changes with every transaction
  DASHBOARD_OVERVIEW: 300,  // 5min — heavy aggregation
  CATEGORY_BREAKDOWN: 3600, // 1h — rarely changes mid-day
  TEMPORAL_HEATMAP: 86400,  // 24h — historical patterns (pre-computed)
  ENTITY_MAP: 1800,         // 30min — top payees
  PAYMENT_METHODS: 3600,    // 1h
  TAX_COMPLIANCE: 43200,    // 12h — once-daily relevance
  ML_PREDICTION: -1,        // permanent — predictions don't change
  RATE_LIMIT: 60,           // 1min window
} as const;

// ─── Cache key builders ───────────────────────────────────────────────────────
export const cacheKey = {
  balance: (userId: string) => `user:${userId}:balance`,
  dashboard: (userId: string, mode: string, timeframe: string) =>
    `dashboard:${userId}:${mode}:${timeframe}`,
  categories: (userId: string) => `user:${userId}:categories:breakdown`,
  temporalHeatmap: (userId: string) => `user:${userId}:temporal:heatmap`,
  entityMap: (userId: string) => `user:${userId}:entities`,
  paymentMethods: (userId: string) => `user:${userId}:payment-methods`,
  taxCompliance: (userId: string) => `user:${userId}:tax`,
  mlPrediction: (merchantName: string) =>
    `ml:predict:${merchantName.toLowerCase().replace(/\s+/g, '-').substring(0, 50)}`,
  rateLimit: (ip: string, route: string) => `rl:${ip}:${route}`,
};

// ─── Safe Redis ops (never throw — cache is optional) ────────────────────────
async function safeGet<T>(key: string): Promise<T | null> {
  try {
    return await redis.get<T>(key);
  } catch {
    return null;
  }
}

async function safeSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    if (ttlSeconds === -1) {
      await redis.set(key, value); // permanent
    } else {
      await redis.set(key, value, { ex: ttlSeconds });
    }
  } catch {
    // Redis unavailable → graceful degradation, always compute fresh
  }
}

async function safeDel(...keys: string[]): Promise<void> {
  try {
    if (keys.length > 0) await redis.del(...keys);
  } catch {}
}

// ─── Stale-while-revalidate ───────────────────────────────────────────────────
/**
 * Returns cached value immediately, triggers background refresh if stale.
 * staleThreshold: if cache age > this (seconds), revalidate in background.
 */
export async function swr<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: CacheTTL,
  staleThreshold?: number,
): Promise<T> {
  const cached = await safeGet<{ data: T; cachedAt: number }>(key);

  if (cached) {
    const age = Math.floor(Date.now() / 1000) - cached.cachedAt;
    const threshold = staleThreshold ?? Math.floor(ttl * 0.8);

    if (age > threshold) {
      // Stale — return immediately, revalidate in background
      fetcher()
        .then(fresh => safeSet(key, { data: fresh, cachedAt: Math.floor(Date.now() / 1000) }, ttl))
        .catch(() => {}); // never await
    }

    return cached.data;
  }

  // Cache miss — compute fresh, store, return
  const fresh = await fetcher();
  await safeSet(key, { data: fresh, cachedAt: Math.floor(Date.now() / 1000) }, ttl);
  return fresh;
}

// ─── Request deduplication ────────────────────────────────────────────────────
const inflight = new Map<string, Promise<unknown>>();

/**
 * If 5 users call the same key simultaneously, only 1 DB query runs.
 * Others wait on the same Promise.
 */
export async function dedupe<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

// ─── Fetch with SWR + deduplication (combined) ───────────────────────────────
export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: CacheTTL,
  staleThreshold?: number,
): Promise<T> {
  return dedupe(key, () => swr(key, fetcher, ttl, staleThreshold));
}

// ─── Cache invalidation ───────────────────────────────────────────────────────
/**
 * Call this after any write that changes user financial data.
 * Invalidates all user-specific dashboard caches.
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await safeDel(
    cacheKey.balance(userId),
    cacheKey.categories(userId),
    cacheKey.entityMap(userId),
    cacheKey.paymentMethods(userId),
    cacheKey.taxCompliance(userId),
    // Temporal heatmap and dashboard overviews are invalidated lazily via SWR
  );
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
export async function checkRateLimit(
  ip: string,
  route: string,
  maxRequests = 100,
  windowSeconds = 60,
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key = cacheKey.rateLimit(ip, route);

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    const ttl = await redis.ttl(key);
    const remaining = Math.max(0, maxRequests - current);
    return {
      allowed: current <= maxRequests,
      remaining,
      resetIn: ttl,
    };
  } catch {
    // Redis unavailable → allow request (fail open for availability)
    return { allowed: true, remaining: maxRequests, resetIn: windowSeconds };
  }
}
