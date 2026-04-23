// src/lib/redis-connection.ts
import { Redis } from 'ioredis';

let hasLoggedError = false;

export const getRedisConnection = (name = 'default') => {
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  
  if (isBuildPhase) {
    // Return a more robust dummy object that mimics a Redis connection
    return new Proxy({}, {
      get: (target, prop) => {
        if (prop === 'on' || prop === 'once' || prop === 'removeListener') return () => {};
        if (prop === 'quit' || prop === 'disconnect') return () => Promise.resolve();
        if (prop === 'status') return 'ready';
        if (prop === 'options') return { maxRetriesPerRequest: null };
        if (prop === 'info') return () => Promise.resolve('redis_version:7.0.0\n');
        // Handle methods that might be called and expected to return a promise
        return () => Promise.resolve(null);
      }
    }) as any;
  }

  const connection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy(times) {
      // Very conservative retry strategy to avoid log/CPU spam
      if (times > 3) return null; 
      return Math.min(times * 200, 1000);
    },
    // Prevent ioredis from emitting errors to the process if it fails to connect
    autoResubscribe: false,
  });

  // Attach a silent error listener to prevent process-level logging of ECONNREFUSED
  connection.on('error', (err) => {
    if (!hasLoggedError) {
      // Log only a concise warning once
    const nodeErr = err as NodeJS.ErrnoException;
    const isConnError = nodeErr.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED');
      const msg = isConnError ? 'Connection refused (check if Redis is running)' : err.message;
      
      console.warn(`⚠️ Redis connection [${name}] failed: ${msg}`);
      hasLoggedError = true;
    }
  });

  return connection;
};
