import { createClient, RedisClientType } from 'redis';
import LRU from 'lru-cache';

const DEFAULT_TTL = 300;

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (redisClient) return redisClient;
  
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[Cache] REDIS_URL not set, using in-memory cache');
    return null;
  }
  
  try {
    redisClient = createClient({ url });
    await redisClient.connect();
    console.log('[Cache] Redis connected');
    return redisClient;
  } catch (error) {
    console.error('[Cache] Redis connection failed:', error);
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  
  if (redis) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  return null;
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  const redis = await getRedisClient();
  
  if (redis) {
    await redis.set(key, JSON.stringify(value), { EX: ttl });
  }
}

export async function cacheDelete(key: string): Promise<void> {
  const redis = await getRedisClient();
  
  if (redis) {
    await redis.del(key);
  }
}

export async function cacheClear(): Promise<void> {
  const redis = await getRedisClient();
  
  if (redis) {
    await redis.flushAll();
  }
}

export const memoryCache = new LRU<string, unknown>({
  max: 500,
  ttl: 1000 * 60 * 5,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
});

export function MemoryCache() {
  return memoryCache;
}

export interface CacheStats {
  size: number;
  max: number;
  ttl: number;
  hitRate: number;
}

export function getCacheStats(): CacheStats {
  return {
    size: memoryCache.size,
    max: memoryCache.max,
    ttl: 300000,
    hitRate: 0,
  };
}

export async function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

export function isMemoryUnderThreshold(thresholdMB: number = 512): boolean {
  const usage = process.memoryUsage();
  const usedMB = usage.heapUsed / 1024 / 1024;
  return usedMB < thresholdMB;
}