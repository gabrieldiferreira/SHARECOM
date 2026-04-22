// src/server/lib/cache.ts
import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } else {
    console.warn('⚠️ Redis not configured. Caching disabled.');
  }
} catch (error) {
  console.error('❌ Redis initialization failed:', error);
  redis = null;
}

export async function getCache<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  
  try {
    const data = await redis.get(key);
    return data as T | null;
  } catch (error) {
    console.warn('Cache get error (non-fatal):', error);
    return null;
  }
}

export async function setCache(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
  if (!redis) return;
  
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.warn('Cache set error (non-fatal):', error);
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  if (!redis) return;
  
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.warn('Cache invalidate error (non-fatal):', error);
  }
}

export async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached) return cached;

  const data = await fetcher();
  await setCache(key, data, ttlSeconds);
  return data;
}
