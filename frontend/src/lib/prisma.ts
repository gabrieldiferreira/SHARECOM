/**
 * Optimized Prisma client for Vercel Serverless + Neon Postgres
 *
 * Key settings:
 * - connection_limit=1: prevents connection exhaustion on free tier
 * - pool_timeout=10: fail fast instead of hanging
 * - connect_timeout=10: Neon auto-suspend needs time to wake up (~500ms)
 * - socket_timeout=15: kill slow queries
 *
 * Neon-specific: ?pgbouncer=true disables prepared statements
 * (PgBouncer doesn't support them in transaction mode)
 */

import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

const isDev = process.env.NODE_ENV !== 'production';

function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL || '';
  if (!base) return base;

  const url = new URL(base);

  // Neon free tier: 1 connection to avoid exhaustion
  // Neon paid: can go up to 10
  url.searchParams.set('connection_limit', process.env.DB_CONNECTION_LIMIT || '1');
  url.searchParams.set('pool_timeout', '10');
  url.searchParams.set('connect_timeout', '15'); // Neon auto-suspend wake-up
  url.searchParams.set('socket_timeout', '20');

  // PgBouncer compatibility (if using Neon's pooler endpoint)
  if (url.hostname.includes('pooler') || process.env.USE_PGBOUNCER === 'true') {
    url.searchParams.set('pgbouncer', 'true');
    url.searchParams.set('statement_cache_size', '0');
  }

  return url.toString();
}

// ─── Singleton pattern (safe for Vercel serverless warm instances) ────────────

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    datasources: {
      db: { url: buildDatabaseUrl() },
    },
    log: isDev
      ? [
          { emit: 'stdout', level: 'query' },
          { emit: 'stdout', level: 'error' },
          { emit: 'stdout', level: 'warn' },
        ]
      : [{ emit: 'stdout', level: 'error' }],
  });

  // Log slow queries in production (>1s threshold)
  if (!isDev) {
    client.$on('query' as never, (e: any) => {
      if (e.duration > 1000) {
        console.warn(`[SLOW QUERY] ${e.duration}ms: ${e.query.substring(0, 200)}`);
        // TODO: send to Slack webhook
      }
    });
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (isDev) globalForPrisma.prisma = prisma;

// ─── Graceful shutdown (for Render workers) ───────────────────────────────────
if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}
