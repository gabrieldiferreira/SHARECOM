import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initAdmin } from '@/lib/firebase-admin';

interface HealthCheck {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  version: string;
  checks: Record<string, {
    status: 'ok' | 'degraded' | 'down';
    latencyMs?: number;
    detail?: string;
  }>;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();
  const checks: HealthCheck['checks'] = {};

  // ── 1. Firestore / Firebase Admin ────────────────────────────────────────
  const dbStart = Date.now();
  try {
    const adminReady = initAdmin();
    if (!adminReady) {
      throw new Error('Firebase Admin credentials not configured');
    }

    checks.database = {
      status: 'ok',
      latencyMs: Date.now() - dbStart,
    };
  } catch (err) {
    checks.database = {
      status: 'down',
      latencyMs: Date.now() - dbStart,
      detail: 'Database unreachable (Neon auto-suspend?)',
    };
  }

  // ── 2. Redis / Upstash ───────────────────────────────────────────────────
  const redisStart = Date.now();
  try {
    const { redis } = await import('@/lib/redis');
    await redis.ping();
    checks.redis = {
      status: 'ok',
      latencyMs: Date.now() - redisStart,
    };
  } catch {
    checks.redis = {
      status: 'degraded',
      latencyMs: Date.now() - redisStart,
      detail: 'Redis unavailable — cache disabled, will use DB directly',
    };
  }

  // ── 3. Environment variables ─────────────────────────────────────────────
  const requiredEnvs = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
  ];
  const missingEnvs = requiredEnvs.filter(k => !process.env[k]);
  checks.environment = {
    status: missingEnvs.length > 0 ? 'down' : 'ok',
    detail: missingEnvs.length > 0 ? `Missing: ${missingEnvs.join(', ')}` : undefined,
  };

  // ── 4. Overall status ────────────────────────────────────────────────────
  const hasDown = Object.values(checks).some(c => c.status === 'down');
  const hasDegraded = Object.values(checks).some(c => c.status === 'degraded');

  const overallStatus: HealthCheck['status'] = hasDown
    ? 'down'
    : hasDegraded
    ? 'degraded'
    : 'ok';

  const health: HealthCheck = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local',
    checks,
  };

  const httpStatus = overallStatus === 'down' ? 503 : overallStatus === 'degraded' ? 207 : 200;

  return NextResponse.json(health, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-store, no-cache',
      'Content-Type': 'application/json',
    },
  });
}
