import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { Prisma } from '@prisma/client';

export const dashboardRouter = router({
  getCashFlow: protectedProcedure
    .input(z.object({ timeframe: z.enum(['daily', 'weekly', 'monthly']) }))
    .query(async ({ ctx, input }) => {
      const userId = (ctx.user as any)?.id;
      if (!userId) return { data: [], income: 0, expenses: 0, net: 0, burnRate: 0, trend: 'stable' as const };

      const intervalMap = { daily: '30 days', weekly: '12 weeks', monthly: '12 months' };
      const truncMap = { daily: 'day', weekly: 'week', monthly: 'month' };

      const result = await ctx.prisma.$queryRaw<Array<{ period: Date; income: bigint; expenses: bigint }>>`
        SELECT 
          date_trunc(${truncMap[input.timeframe]}, datetime) as period,
          SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) as income,
          SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) as expenses
        FROM transactions 
        WHERE user_id = ${userId} 
          AND datetime >= NOW() - ${intervalMap[input.timeframe]}::interval
          AND deleted_at IS NULL
        GROUP BY period 
        ORDER BY period
      `;

      const data = result.map(r => ({
        period: r.period.toISOString(),
        income: Number(r.income),
        expenses: Number(r.expenses),
        net: Number(r.income) - Number(r.expenses),
      }));

      const totalIncome = data.reduce((s, d) => s + d.income, 0);
      const totalExpenses = data.reduce((s, d) => s + d.expenses, 0);
      const daysCount = Math.max(data.length, 1);
      const burnRate = totalExpenses / daysCount;

      return {
        data,
        income: totalIncome,
        expenses: totalExpenses,
        net: totalIncome - totalExpenses,
        burnRate: Math.round(burnRate),
        trend: totalIncome > totalExpenses ? 'up' as const : totalIncome < totalExpenses ? 'down' as const : 'stable' as const,
      };
    }),

  getEntityRelationships: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx.user as any)?.id;
    if (!userId) return [];

    const result = await ctx.prisma.$queryRaw<Array<{
      merchant_name: string; count: bigint; total: bigint; avg_ticket: number; last_date: Date;
    }>>`
      SELECT 
        merchant_name,
        COUNT(*) as count,
        SUM(amount_cents) as total,
        AVG(amount_cents) as avg_ticket,
        MAX(datetime) as last_date
      FROM transactions 
      WHERE user_id = ${userId} AND deleted_at IS NULL AND merchant_name IS NOT NULL
      GROUP BY merchant_name 
      ORDER BY total DESC 
      LIMIT 20
    `;

    return result.map(r => ({
      merchant: r.merchant_name,
      totalAmount: Number(r.total),
      transactionCount: Number(r.count),
      avgTicket: Math.round(Number(r.avg_ticket)),
      lastTransactionDate: r.last_date.toISOString(),
      frequency: Number(r.count) > 10 ? 'high' : Number(r.count) > 3 ? 'medium' : 'low',
    }));
  }),

  getPaymentMethods: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx.user as any)?.id;
    if (!userId) return [];

    const result = await ctx.prisma.$queryRaw<Array<{
      payment_method: string; count: bigint; total: bigint;
    }>>`
      SELECT 
        COALESCE(payment_method::text, 'unknown') as payment_method,
        COUNT(*) as count,
        SUM(amount_cents) as total
      FROM transactions 
      WHERE user_id = ${userId} AND deleted_at IS NULL
      GROUP BY payment_method 
      ORDER BY total DESC
    `;

    return result.map(r => ({
      method: r.payment_method,
      count: Number(r.count),
      totalAmount: Number(r.total),
    }));
  }),

  getTemporalPatterns: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx.user as any)?.id;
    if (!userId) return { heatmap: [], seasonal: [], recurring: [] };

    const heatmap = await ctx.prisma.$queryRaw<Array<{ hour: number; weekday: number; amount: bigint }>>`
      SELECT 
        EXTRACT(hour FROM datetime)::int as hour,
        EXTRACT(dow FROM datetime)::int as weekday,
        SUM(amount_cents) as amount
      FROM transactions 
      WHERE user_id = ${userId} AND type = 'expense' AND deleted_at IS NULL
      GROUP BY hour, weekday
    `;

    const seasonal = await ctx.prisma.$queryRaw<Array<{ month: string; amount: bigint }>>`
      SELECT 
        TO_CHAR(datetime, 'YYYY-MM') as month,
        SUM(amount_cents) as amount
      FROM transactions 
      WHERE user_id = ${userId} AND type = 'expense' AND deleted_at IS NULL
      GROUP BY month 
      ORDER BY month
    `;

    const recurring = await ctx.prisma.transaction.findMany({
      where: { user_id: userId, is_recurring: true, deleted_at: null },
      select: { merchant_name: true, amount_cents: true, recurrence_pattern: true },
    });

    return {
      heatmap: heatmap.map(h => ({ hour: h.hour, weekday: h.weekday, amount: Number(h.amount) })),
      seasonal: seasonal.map(s => ({ month: s.month, amount: Number(s.amount) })),
      recurring: recurring.map(r => ({
        merchant: r.merchant_name,
        amount: r.amount_cents,
        pattern: r.recurrence_pattern,
      })),
    };
  }),

  getCategoryBreakdown: protectedProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = (ctx.user as any)?.id;
      if (!userId) return [];

      const whereClause: Prisma.TransactionWhereInput = {
        user_id: userId,
        type: 'expense',
        deleted_at: null,
      };

      if (input?.month) {
        const [year, mon] = input.month.split('-').map(Number);
        whereClause.datetime = {
          gte: new Date(year, mon - 1, 1),
          lt: new Date(year, mon, 1),
        };
      }

      const txs = await ctx.prisma.transaction.groupBy({
        by: ['category_id'],
        where: whereClause,
        _sum: { amount_cents: true },
        _count: true,
      });

      const totalSpent = txs.reduce((s, t) => s + (t._sum.amount_cents || 0), 0);

      // Fetch budgets for variance calculation
      const budgets = await ctx.prisma.budget.findMany({
        where: { user_id: userId, ...(input?.month ? { month: input.month } : {}) },
      });

      const budgetMap = new Map(budgets.map(b => [b.category_id, b.limit_amount_cents]));

      // Fetch category names
      const categoryIds = txs.map(t => t.category_id).filter(Boolean) as string[];
      const categories = await ctx.prisma.category.findMany({
        where: { id: { in: categoryIds } },
      });
      const categoryMap = new Map(categories.map(c => [c.id, c]));

      return txs.map(t => {
        const spent = t._sum.amount_cents || 0;
        const budgeted = t.category_id ? budgetMap.get(t.category_id) || 0 : 0;
        const cat = t.category_id ? categoryMap.get(t.category_id) : null;
        const avg = totalSpent / Math.max(txs.length, 1);
        const anomalyScore = avg > 0 ? Math.min((spent - avg) / avg, 1) : 0;

        return {
          category: cat?.name || 'Uncategorized',
          icon: cat?.icon || null,
          color: cat?.color || '#8B5CF6',
          spent,
          budgeted,
          variance: budgeted - spent,
          percentOfTotal: totalSpent > 0 ? Math.round((spent / totalSpent) * 100) : 0,
          anomalyScore: Math.round(anomalyScore * 100) / 100,
        };
      }).sort((a, b) => b.spent - a.spent);
    }),

  getTransactionForensics: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx.user as any)?.id;
    if (!userId) return { duplicates: [], velocityWarnings: [], institutionReliability: 100 };

    // Duplicate auth codes
    const duplicateAuthCodes = await ctx.prisma.$queryRaw<Array<{ authentication_code: string; cnt: bigint }>>`
      SELECT authentication_code, COUNT(*) as cnt
      FROM transactions 
      WHERE user_id = ${userId} AND authentication_code IS NOT NULL AND deleted_at IS NULL
      GROUP BY authentication_code 
      HAVING COUNT(*) > 1
    `;

    // Velocity check: >5 transactions in 1 hour window
    const velocityCheck = await ctx.prisma.$queryRaw<Array<{ hour_window: Date; cnt: bigint }>>`
      SELECT date_trunc('hour', datetime) as hour_window, COUNT(*) as cnt
      FROM transactions 
      WHERE user_id = ${userId} AND deleted_at IS NULL
        AND datetime >= NOW() - INTERVAL '7 days'
      GROUP BY hour_window 
      HAVING COUNT(*) > 5
    `;

    const totalTx = await ctx.prisma.transaction.count({
      where: { user_id: userId, deleted_at: null },
    });
    const syncedTx = await ctx.prisma.transaction.count({
      where: { user_id: userId, deleted_at: null, transaction_external_id: { not: null } },
    });

    return {
      duplicates: duplicateAuthCodes.map(d => ({
        code: d.authentication_code,
        count: Number(d.cnt),
      })),
      velocityWarnings: velocityCheck.map(v => ({
        window: v.hour_window.toISOString(),
        count: Number(v.cnt),
      })),
      institutionReliability: totalTx > 0 ? Math.round((syncedTx / totalTx) * 100) : 100,
    };
  }),

  getTaxCompliance: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx.user as any)?.id;
    if (!userId) return { byEntity: [], deductibleTotal: 0, missingReceipts: 0 };

    // Group by pix_key (proxy for CPF/CNPJ) 
    const byEntity = await ctx.prisma.$queryRaw<Array<{
      pix_key: string; total: bigint; cnt: bigint;
    }>>`
      SELECT 
        COALESCE(pix_key, 'N/A') as pix_key,
        SUM(amount_cents) as total,
        COUNT(*) as cnt
      FROM transactions 
      WHERE user_id = ${userId} AND deleted_at IS NULL
      GROUP BY pix_key 
      ORDER BY total DESC 
      LIMIT 20
    `;

    // Deductible categories
    const deductibleCategories = await ctx.prisma.category.findMany({
      where: { is_deductible: true },
    });
    const deductibleIds = deductibleCategories.map(c => c.id);

    const deductibleSum = deductibleIds.length > 0
      ? await ctx.prisma.transaction.aggregate({
          where: {
            user_id: userId,
            category_id: { in: deductibleIds },
            type: 'expense',
            deleted_at: null,
          },
          _sum: { amount_cents: true },
        })
      : { _sum: { amount_cents: 0 } };

    // Missing receipts: transactions without authentication_code
    const missingReceipts = await ctx.prisma.transaction.count({
      where: {
        user_id: userId,
        authentication_code: null,
        type: 'expense',
        deleted_at: null,
      },
    });

    return {
      byEntity: byEntity.map(e => ({
        entity: e.pix_key,
        total: Number(e.total),
        count: Number(e.cnt),
      })),
      deductibleTotal: deductibleSum._sum.amount_cents || 0,
      missingReceipts,
    };
  }),
});
