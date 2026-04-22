import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { getTransactions } from '@/lib/firestore';
import { getCache, setCache } from '../../lib/cache';

const TimeframeEnum = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']);

function getSessionUserId(sessionUser: unknown) {
  const userId = (sessionUser as { id?: string } | undefined)?.id;
  if (!userId) {
    throw new Error('Unauthorized');
  }

  return userId;
}

function timeframeStart(timeframe: z.infer<typeof TimeframeEnum>, startDate?: Date) {
  if (startDate) return startDate;

  const now = new Date();
  switch (timeframe) {
    case 'daily':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'weekly':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'quarterly':
      return new Date(now.getFullYear(), now.getMonth() - 3, 1);
    case 'yearly':
      return new Date(now.getFullYear(), 0, 1);
    case 'monthly':
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

function toDateKey(value: string | Date, timeframe: z.infer<typeof TimeframeEnum>) {
  const date = new Date(value);
  if (timeframe === 'yearly') {
    return String(date.getFullYear());
  }

  if (timeframe === 'monthly' || timeframe === 'quarterly') {
    return date.toISOString().slice(0, 7);
  }

  return date.toISOString().slice(0, 10);
}

export const dashboardEnhancedRouter = createTRPCRouter({
  getCashFlow: protectedProcedure
    .input(
      z.object({
        timeframe: TimeframeEnum,
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = getSessionUserId(ctx.user);
      const cacheKey = `user:${userId}:dashboard:cashflow:${input.timeframe}`;
      const cached = await getCache(cacheKey);
      if (cached) return cached;

      const start = timeframeStart(input.timeframe, input.startDate);
      const transactions = await getTransactions(userId, { start, end: input.endDate });
      const buckets = new Map<string, { income: number; expenses: number }>();

      for (const transaction of transactions) {
        const key = toDateKey(String(transaction.datetime), input.timeframe);
        const current = buckets.get(key) ?? { income: 0, expenses: 0 };

        if (transaction.type === 'income') {
          current.income += Number(transaction.amount ?? 0);
        } else {
          current.expenses += Number(transaction.amount ?? 0);
        }

        buckets.set(key, current);
      }

      const data = Array.from(buckets.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, totals]) => ({
          date,
          income: totals.income,
          expenses: totals.expenses,
          net: totals.income - totals.expenses,
        }));

      const income = data.reduce((sum, row) => sum + row.income, 0);
      const expenses = data.reduce((sum, row) => sum + row.expenses, 0);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const burnRateSource = transactions.filter(
        (transaction) =>
          transaction.type === 'expense' && new Date(String(transaction.datetime)) >= thirtyDaysAgo,
      );
      const burnRate =
        burnRateSource.reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0) / 30;

      const result = {
        income,
        expenses,
        net: income - expenses,
        burnRate,
        trend: income - expenses > 0 ? 'positive' : income - expenses < 0 ? 'negative' : 'neutral',
        data,
      };

      await setCache(cacheKey, result, 300);
      return result;
    }),

  getCategoryBreakdown: protectedProcedure
    .input(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = getSessionUserId(ctx.user);
      const month = input.month || new Date().toISOString().slice(0, 7);
      const cacheKey = `user:${userId}:categories:breakdown:${month}`;
      const cached = await getCache(cacheKey);
      if (cached) return cached;

      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);

      const transactions = await getTransactions(userId, { start, end });
      const expenses = transactions.filter((transaction) => transaction.type === 'expense');
      const byCategory = new Map<string, number>();

      for (const transaction of expenses) {
        const category = String(transaction.category ?? 'other');
        byCategory.set(category, (byCategory.get(category) ?? 0) + Number(transaction.amount ?? 0));
      }

      const totalSpent = Array.from(byCategory.values()).reduce((sum, amount) => sum + amount, 0);
      const amounts = Array.from(byCategory.values());
      const mean = amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length : 0;
      const stdDev = amounts.length
        ? Math.sqrt(
            amounts.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) / amounts.length,
          )
        : 0;

      const result = Array.from(byCategory.entries())
        .sort(([, left], [, right]) => right - left)
        .map(([categoryName, spent]) => ({
          categoryId: categoryName,
          categoryName,
          spent,
          budgeted: null,
          variance: null,
          percentOfTotal: totalSpent > 0 ? (spent / totalSpent) * 100 : 0,
          anomalyScore: stdDev > 0 ? Math.abs((spent - mean) / stdDev) : 0,
        }));

      await setCache(cacheKey, result, 3600);
      return result;
    }),

  getTransactionForensics: protectedProcedure
    .input(z.object({ transactionId: z.string().optional() }))
    .query(async ({ ctx }) => {
      const userId = getSessionUserId(ctx.user);
      const transactions = await getTransactions(userId, {
        start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      });

      const authCodeCounts = new Map<string, number>();
      const hourlyCounts = new Map<string, number>();

      for (const transaction of transactions) {
        if (transaction.authenticationCode) {
          authCodeCounts.set(
            String(transaction.authenticationCode),
            (authCodeCounts.get(String(transaction.authenticationCode)) ?? 0) + 1,
          );
        }

        const hourWindow = new Date(String(transaction.datetime)).toISOString().slice(0, 13);
        hourlyCounts.set(hourWindow, (hourlyCounts.get(hourWindow) ?? 0) + 1);
      }

      return {
        duplicateAuthCodes: Array.from(authCodeCounts.entries())
          .filter(([, count]) => count > 1)
          .map(([code, count]) => ({ code, count })),
        velocityAlerts: Array.from(hourlyCounts.entries())
          .filter(([, count]) => count > 5)
          .map(([hourWindow, count]) => ({ hourWindow, count })),
        institutionReliability: [],
      };
    }),

  getTaxCompliance: protectedProcedure
    .input(
      z.object({
        year: z.number().int().min(2020).max(2030),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = getSessionUserId(ctx.user);
      const start = new Date(Date.UTC(input.year, 0, 1));
      const end = new Date(Date.UTC(input.year + 1, 0, 1));
      const transactions = await getTransactions(userId, { start, end });

      const deductible = transactions.filter(
        (transaction) =>
          transaction.type === 'expense' &&
          ['health', 'education'].includes(String(transaction.category ?? '').toLowerCase()),
      );

      const byCategory = new Map<string, { total: number; count: number; missingReceipts: number }>();
      for (const transaction of deductible) {
        const category = String(transaction.category ?? 'other');
        const current = byCategory.get(category) ?? { total: 0, count: 0, missingReceipts: 0 };
        current.total += Number(transaction.amount ?? 0);
        current.count += 1;
        current.missingReceipts += transaction.authenticationCode ? 0 : 1;
        byCategory.set(category, current);
      }

      return {
        deductibleExpenses: Array.from(byCategory.entries()).map(([categoryName, totals]) => ({
          categoryName,
          total: totals.total,
          count: totals.count,
          missingReceipts: totals.missingReceipts,
        })),
        merchantGroups: [],
      };
    }),

  getEntityRelationships: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const userId = getSessionUserId(ctx.user);
      const transactions = await getTransactions(userId, {
        start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      });
      const merchants = new Map<
        string,
        { totalAmount: number; transactionCount: number; lastTransactionDate: string }
      >();

      for (const transaction of transactions) {
        const merchant = String(transaction.merchant ?? '').trim();
        if (!merchant) continue;

        const current = merchants.get(merchant) ?? {
          totalAmount: 0,
          transactionCount: 0,
          lastTransactionDate: String(transaction.datetime),
        };
        current.totalAmount += Number(transaction.amount ?? 0);
        current.transactionCount += 1;
        if (new Date(String(transaction.datetime)) > new Date(current.lastTransactionDate)) {
          current.lastTransactionDate = String(transaction.datetime);
        }
        merchants.set(merchant, current);
      }

      return Array.from(merchants.entries())
        .sort(([, left], [, right]) => right.totalAmount - left.totalAmount)
        .slice(0, input.limit)
        .map(([merchant, totals]) => ({
          merchant,
          totalAmount: totals.totalAmount,
          transactionCount: totals.transactionCount,
          avgTicket: totals.transactionCount ? totals.totalAmount / totals.transactionCount : 0,
          lastTransactionDate: totals.lastTransactionDate,
        }));
    }),

  getPaymentMethods: protectedProcedure.query(async ({ ctx }) => {
    const userId = getSessionUserId(ctx.user);
    const transactions = await getTransactions(userId, {
      start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    });
    const methods = new Map<string, { count: number; totalAmount: number }>();

    for (const transaction of transactions) {
      const method = String(transaction.paymentMethod ?? 'unknown');
      const current = methods.get(method) ?? { count: 0, totalAmount: 0 };
      current.count += 1;
      current.totalAmount += Number(transaction.amount ?? 0);
      methods.set(method, current);
    }

    return Array.from(methods.entries())
      .sort(([, left], [, right]) => right.totalAmount - left.totalAmount)
      .map(([method, totals]) => ({
        method,
        count: totals.count,
        totalAmount: totals.totalAmount,
      }));
  }),

  getTemporalPatterns: protectedProcedure.query(async ({ ctx }) => {
    const userId = getSessionUserId(ctx.user);
    const transactions = await getTransactions(userId, {
      start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    });
    const heatmap = new Map<string, number>();

    for (const transaction of transactions) {
      if (transaction.type !== 'expense') continue;
      const date = new Date(String(transaction.datetime));
      const key = `${date.getUTCDay()}-${date.getUTCHours()}`;
      heatmap.set(key, (heatmap.get(key) ?? 0) + Number(transaction.amount ?? 0));
    }

    return {
      heatmap: Array.from(heatmap.entries()).map(([key, amount]) => {
        const [weekday, hour] = key.split('-').map(Number);
        return { weekday, hour, amount };
      }),
    };
  }),
});
