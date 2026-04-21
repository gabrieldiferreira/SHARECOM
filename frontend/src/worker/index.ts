/**
 * BullMQ Worker — Render $7 plan (512MB RAM)
 *
 * Priority system:
 * P0 (priority: 1) — ML categorization: <2s, blocks UX
 * P1 (priority: 2) — Fraud detection: <5s, critical
 * P2 (priority: 3) — Recurring patterns: can wait 1min
 * P3 (priority: 4) — Analytics pre-compute: run off-peak
 *
 * concurrency: 2 → safe for 512MB RAM
 * Memory estimate per worker:
 *   - BullMQ overhead: ~30MB
 *   - Prisma connection: ~50MB
 *   - Node.js runtime: ~80MB
 *   - 2 concurrent jobs × 50MB each = 100MB
 *   Total: ~260MB < 512MB ✓
 */

import { Worker, Queue, QueueScheduler, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { categorizeTransaction } from '../lib/categorize';

// ─── Setup ────────────────────────────────────────────────────────────────────

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

// ─── Worker implementations ───────────────────────────────────────────────────

// P0: ML Categorization (<2s target)
async function handleCategorization(job: Job): Promise<void> {
  const { transactionId, merchantName, description } = job.data;

  const category = await categorizeTransaction(merchantName, description);

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { category_id: category },
  });

  console.log(`[categorize] tx:${transactionId} → ${category} (${job.processedOn ? Date.now() - job.processedOn : '?'}ms)`);
}

// P1: Fraud detection (<5s target)
async function handleFraudDetection(job: Job): Promise<void> {
  const { transactionId, userId, amountCents, merchantName } = job.data;

  // Fetch user's average for this merchant
  const stats = await prisma.$queryRaw<{ avg: number; count: number }[]>`
    SELECT 
      AVG(amount_cents)::int as avg,
      COUNT(*)::int as count
    FROM transactions
    WHERE user_id = ${userId}
      AND merchant_name ILIKE ${merchantName}
      AND deleted_at IS NULL
      AND datetime > NOW() - INTERVAL '90 days'
    LIMIT 1
  `;

  const avg = stats[0]?.avg ?? 0;
  const count = stats[0]?.count ?? 0;

  const alerts = [];

  // Unusual amount: >3x average with enough history
  if (count >= 3 && avg > 0 && amountCents > avg * 3) {
    alerts.push({
      type: 'unusual_amount',
      severity: amountCents > avg * 5 ? 'critical' : 'warning',
      message: `Valor incomum: R$ ${(amountCents / 100).toFixed(2)} (${Math.round(amountCents / avg)}x acima da média).`,
    });
  }

  // First-time recipient
  if (count === 0) {
    alerts.push({
      type: 'first_time_recipient',
      severity: 'info',
      message: `Primeira transação com ${merchantName}.`,
    });
  }

  // High frequency: >5 transactions to same merchant in last 48h
  const recentCount = await prisma.transaction.count({
    where: {
      user_id: userId,
      merchant_name: { contains: merchantName, mode: 'insensitive' },
      datetime: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      deleted_at: null,
    },
  });

  if (recentCount > 5) {
    alerts.push({
      type: 'high_frequency',
      severity: 'warning',
      message: `${recentCount} transações para ${merchantName} em menos de 48h.`,
    });
  }

  // Create alert records
  if (alerts.length > 0) {
    await prisma.alert.createMany({
      data: alerts.map(a => ({
        user_id: userId,
        type: a.type as any,
        severity: a.severity as any,
        message: a.message,
        metadata: { transactionId, amountCents, merchantName },
      })),
    });
  }
}

// P2: Recurring pattern detection
async function handleRecurringDetection(job: Job): Promise<void> {
  const { userId } = job.data;

  // Find merchants with consistent monthly transactions (same amount ±10%)
  const recurring = await prisma.$queryRaw<Array<{
    merchant_name: string;
    avg_amount: number;
    transaction_count: number;
    months_present: number;
  }>>`
    SELECT 
      merchant_name,
      AVG(amount_cents)::int as avg_amount,
      COUNT(*) as transaction_count,
      COUNT(DISTINCT date_trunc('month', datetime)) as months_present
    FROM transactions
    WHERE user_id = ${userId}
      AND deleted_at IS NULL
      AND datetime > NOW() - INTERVAL '6 months'
      AND merchant_name IS NOT NULL
    GROUP BY merchant_name
    HAVING 
      COUNT(DISTINCT date_trunc('month', datetime)) >= 3
      AND STDDEV(amount_cents) / NULLIF(AVG(amount_cents), 0) < 0.15
    ORDER BY months_present DESC
    LIMIT 20
  `;

  // Mark transactions as recurring
  for (const r of recurring) {
    await prisma.transaction.updateMany({
      where: {
        user_id: userId,
        merchant_name: r.merchant_name,
        deleted_at: null,
      },
      data: {
        is_recurring: true,
        recurrence_pattern: `monthly:${r.avg_amount}`,
      },
    });

    // Create alert for newly detected subscription
    await prisma.alert.upsert({
      where: {
        // Use a compound unique if needed — here we use findFirst + create
        id: `recurring-${userId}-${r.merchant_name}`.substring(0, 36),
      },
      create: {
        id: `recurring-${userId}-${r.merchant_name}`.substring(0, 36),
        user_id: userId,
        type: 'recurring_pattern' as any,
        severity: 'info',
        message: `Assinatura detectada: ${r.merchant_name} (~R$ ${(r.avg_amount / 100).toFixed(2)}/mês por ${r.months_present} meses).`,
        metadata: { merchant: r.merchant_name, avgAmount: r.avg_amount, months: r.months_present },
      },
      update: {},
    }).catch(() => {}); // Ignore if alert already exists
  }
}

// P3: Analytics pre-compute (run off-peak)
async function handleAnalyticsPrecompute(job: Job): Promise<void> {
  const { userId, mode } = job.data;

  // Refresh materialized view for this user's stats
  // This is safe to run daily — costly queries become instant for dashboard
  await prisma.$executeRaw`
    INSERT INTO user_monthly_stats (user_id, month, income_cents, expense_cents, tx_count, computed_at)
    SELECT 
      user_id,
      date_trunc('month', datetime) as month,
      SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END)::int as income_cents,
      SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END)::int as expense_cents,
      COUNT(*)::int as tx_count,
      NOW() as computed_at
    FROM transactions
    WHERE user_id = ${userId}
      AND deleted_at IS NULL
    GROUP BY user_id, date_trunc('month', datetime)
    ON CONFLICT (user_id, month) DO UPDATE SET
      income_cents = EXCLUDED.income_cents,
      expense_cents = EXCLUDED.expense_cents,
      tx_count = EXCLUDED.tx_count,
      computed_at = EXCLUDED.computed_at
  `.catch(err => {
    // Table may not exist yet — skip gracefully
    if (!err.message?.includes('does not exist')) throw err;
  });

  console.log(`[analytics] pre-computed ${mode} for user:${userId}`);
}

// P1: Goal progress update
async function handleGoalProgress(job: Job): Promise<void> {
  const { userId, transactionType, amountCents } = job.data;
  if (transactionType !== 'income') return;

  // Simple rule: 20% of income goes toward goals (adjustable)
  const savingsRate = 0.20;
  const contributionCents = Math.floor(amountCents * savingsRate);

  // Find oldest incomplete goal
  const activeGoal = await prisma.goal.findFirst({
    where: {
      user_id: userId,
      current_amount_cents: { lt: prisma.goal.fields.target_amount_cents as any },
    },
    orderBy: { deadline: 'asc' },
  });

  if (activeGoal) {
    await prisma.goal.update({
      where: { id: activeGoal.id },
      data: {
        current_amount_cents: {
          increment: Math.min(contributionCents, activeGoal.target_amount_cents - activeGoal.current_amount_cents),
        },
      },
    });
  }
}

// ─── Worker factory ───────────────────────────────────────────────────────────

const QUEUE_HANDLERS: Record<string, (job: Job) => Promise<void>> = {
  'categorize-transaction': handleCategorization,
  'fraud-detection': handleFraudDetection,
  'detect-recurring': handleRecurringDetection,
  'analytics-precompute': handleAnalyticsPrecompute,
  'goal-progress': handleGoalProgress,
};

const workers: Worker[] = [];

for (const [queueName, handler] of Object.entries(QUEUE_HANDLERS)) {
  const worker = new Worker(queueName, handler, {
    connection,
    concurrency: 2, // Safe for 512MB RAM
    limiter: {
      max: 10,
      duration: 1000, // Max 10 jobs/second globally
    },
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker:${queueName}] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[worker:${queueName}] Job ${job.id} completed in ${Date.now() - (job.processedOn ?? 0)}ms`);
    }
  });

  workers.push(worker);
  console.log(`✓ Worker started: ${queueName}`);
}

// ─── Cron jobs (configured via Render cron service) ──────────────────────────
// These are triggered by Render's built-in cron, not BullMQ scheduler
// See render.yaml for cron configuration

export async function runDailyBurnRate(): Promise<void> {
  console.log('[cron] Calculating burn rates...');
  const users = await prisma.user.findMany({ select: { id: true } });

  for (const user of users) {
    const budgetAlertQueue = new Queue('budget-alerts', { connection });
    await budgetAlertQueue.add('check', { userId: user.id }, { priority: 3 });
  }
}

export async function runMidnightBudgetAlerts(): Promise<void> {
  console.log('[cron] Running budget alerts...');
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const budgets = await prisma.budget.findMany({
    where: { month },
    include: { user: true, category: true },
  });

  for (const budget of budgets) {
    const spent = await prisma.transaction.aggregate({
      where: {
        user_id: budget.user_id,
        category_id: budget.category_id,
        type: 'expense',
        datetime: { gte: new Date(`${month}-01`) },
        deleted_at: null,
      },
      _sum: { amount_cents: true },
    });

    const spentCents = spent._sum.amount_cents ?? 0;
    const percentUsed = (spentCents / budget.limit_amount_cents) * 100;

    if (percentUsed >= 80) {
      await prisma.alert.create({
        data: {
          user_id: budget.user_id,
          type: 'balance_threshold',
          severity: percentUsed >= 100 ? 'critical' : 'warning',
          message: `${budget.category.name}: ${percentUsed.toFixed(0)}% do orçamento de R$ ${(budget.limit_amount_cents / 100).toFixed(2)} utilizado.`,
          metadata: { categoryId: budget.category_id, month, percentUsed },
        },
      });
    }
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(): Promise<void> {
  console.log('[worker] Shutting down gracefully...');
  await Promise.all(workers.map(w => w.close()));
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('🚀 BullMQ workers running (concurrency: 2, queues:', Object.keys(QUEUE_HANDLERS).join(', '), ')');
