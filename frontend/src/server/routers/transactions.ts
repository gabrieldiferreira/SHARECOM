import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { queues } from '../../lib/bullmq';

// Zod Schemas
const createTransactionSchema = z.object({
  amount_cents: z.number().int(),
  type: z.enum(['income', 'expense']),
  account_id: z.string().optional(),
  category_id: z.string().optional(),
  merchant_name: z.string().optional(),
  merchant_logo_url: z.string().url().optional(),
  description: z.string().optional(),
  datetime: z.string().datetime().or(z.date()),
  payment_method: z.enum(['pix', 'card', 'cash', 'transfer']).optional(),
  pix_key: z.string().optional(),
  authentication_code: z.string().optional(),
  transaction_external_id: z.string().optional(),
  location_lat: z.number().optional(),
  location_lng: z.number().optional(),
  tags: z.any().optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.string().optional(),
});

const listTransactionsSchema = z.object({
  dateRange: z.object({
    start: z.string().datetime().or(z.date()),
    end: z.string().datetime().or(z.date()),
  }).optional(),
  categories: z.array(z.string()).optional(),
  accounts: z.array(z.string()).optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  search: z.string().optional(),
  paymentMethods: z.array(z.enum(['pix', 'card', 'cash', 'transfer'])).optional(),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
});

export const transactionsRouter = router({
  list: protectedProcedure
    .input(listTransactionsSchema)
    .query(async ({ ctx, input }) => {
      const userId = (ctx.user as any)?.id;
      if (!userId) return { items: [], nextCursor: null };

      const where: Prisma.TransactionWhereInput = {
        user_id: userId,
        deleted_at: null,
      };

      if (input.dateRange) {
        where.datetime = {
          gte: new Date(input.dateRange.start),
          lte: new Date(input.dateRange.end),
        };
      }

      if (input.categories?.length) {
        where.category_id = { in: input.categories };
      }

      if (input.accounts?.length) {
        where.account_id = { in: input.accounts };
      }

      if (input.minAmount !== undefined || input.maxAmount !== undefined) {
        where.amount_cents = {};
        if (input.minAmount !== undefined) where.amount_cents.gte = input.minAmount;
        if (input.maxAmount !== undefined) where.amount_cents.lte = input.maxAmount;
      }

      if (input.search) {
        where.OR = [
          { merchant_name: { contains: input.search, mode: 'insensitive' } },
          { description: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      if (input.paymentMethods?.length) {
        where.payment_method = { in: input.paymentMethods };
      }

      const items = await ctx.prisma.transaction.findMany({
        where,
        orderBy: { datetime: 'desc' },
        take: input.limit + 1, // Fetch one extra for cursor
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          category: { select: { name: true, icon: true, color: true } },
          account: { select: { institution: true, masked_number: true } },
        },
      });

      let nextCursor: string | null = null;
      if (items.length > input.limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id || null;
      }

      return { items, nextCursor };
    }),

  create: protectedProcedure
    .input(createTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx.user as any)?.id;
      if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED' });

      // Dedupe check via transaction_external_id
      if (input.transaction_external_id) {
        const existing = await ctx.prisma.transaction.findUnique({
          where: { transaction_external_id: input.transaction_external_id },
        });
        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Transaction with this external ID already exists',
          });
        }
      }

      const tx = await ctx.prisma.transaction.create({
        data: {
          user_id: userId,
          amount_cents: input.amount_cents,
          type: input.type,
          datetime: new Date(input.datetime),
          account_id: input.account_id,
          category_id: input.category_id,
          merchant_name: input.merchant_name,
          merchant_logo_url: input.merchant_logo_url,
          description: input.description,
          payment_method: input.payment_method,
          pix_key: input.pix_key,
          authentication_code: input.authentication_code,
          transaction_external_id: input.transaction_external_id,
          location_lat: input.location_lat,
          location_lng: input.location_lng,
          tags: input.tags || undefined,
          is_recurring: input.is_recurring || false,
          recurrence_pattern: input.recurrence_pattern,
        },
      });

      // Trigger background jobs
      try {
        await queues.categorizeTransaction.add('categorize', {
          transactionId: tx.id,
          merchantName: tx.merchant_name,
          description: tx.description,
        });

        await queues.fraudDetection.add('detect', {
          transactionId: tx.id,
          userId,
          amountCents: tx.amount_cents,
          merchantName: tx.merchant_name,
        });

        await queues.goalProgress.add('update', {
          userId,
          transactionType: tx.type,
          amountCents: tx.amount_cents,
        });
      } catch {
        // Queue jobs are fire-and-forget; don't fail the transaction
      }

      // Update account balance if account_id provided
      if (input.account_id) {
        const balanceDelta = input.type === 'income' ? input.amount_cents : -input.amount_cents;
        await ctx.prisma.account.update({
          where: { id: input.account_id },
          data: { balance_cents: { increment: balanceDelta } },
        });
      }

      return tx;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      category_id: z.string().optional(),
      merchant_name: z.string().optional(),
      description: z.string().optional(),
      tags: z.any().optional(),
      is_recurring: z.boolean().optional(),
      recurrence_pattern: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx.user as any)?.id;
      if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED' });

      // Verify ownership
      const existing = await ctx.prisma.transaction.findFirst({
        where: { id: input.id, user_id: userId },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      const { id, ...updateData } = input;
      // Filter out undefined values
      const cleanData = Object.fromEntries(
        Object.entries(updateData).filter(([_, v]) => v !== undefined)
      );

      return ctx.prisma.transaction.update({
        where: { id },
        data: cleanData,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx.user as any)?.id;
      if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED' });

      // Verify ownership
      const existing = await ctx.prisma.transaction.findFirst({
        where: { id: input.id, user_id: userId },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      // Soft delete
      return ctx.prisma.transaction.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      });
    }),
});
