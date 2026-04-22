// src/server/middleware/rate-limit.ts
import { TRPCError } from '@trpc/server';
import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (error) {
  console.warn('⚠️ Rate limiting disabled (Redis unavailable)');
}

export async function checkRateLimit(userId: string): Promise<void> {
  // Skip rate limiting if Redis is not available
  if (!redis) return;
  
  try {
    const key = `rate_limit:${userId}`;
    const limit = 100;
    const window = 60;

    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, window);
    }

    if (current > limit) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded. Please try again later.',
      });
    }
  } catch (error) {
    // If it's a rate limit error, re-throw it
    if (error instanceof TRPCError) {
      throw error;
    }
    // Otherwise, log and allow the request (fail open)
    console.warn('Rate limit check failed (non-fatal):', error);
  }
}
