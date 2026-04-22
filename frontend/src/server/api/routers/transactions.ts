import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { createTransaction, getTransactionById, getTransactions, updateTransaction } from '@/lib/firestore';

const paymentMethodEnum = z.enum(['pix', 'card', 'cash', 'transfer']);
const transactionTypeEnum = z.enum(['income', 'expense']);

const TransactionFilterSchema = z.object({
  dateRange: z
    .object({
      start: z.date(),
      end: z.date(),
    })
    .optional(),
  categories: z.array(z.string()).optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  search: z.string().optional(),
  paymentMethods: z.array(paymentMethodEnum).optional(),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
});

const CreateTransactionSchema = z.object({
  amount: z.number().positive(),
  type: transactionTypeEnum,
  category: z.string().optional(),
  merchant: z.string().optional(),
  merchantLogoUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  datetime: z.date(),
  paymentMethod: paymentMethodEnum.nullable().optional(),
  pixKey: z.string().nullable().optional(),
  authenticationCode: z.string().nullable().optional(),
  transactionExternalId: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  isRecurring: z.boolean().optional(),
});

function getSessionUserId(sessionUser: unknown) {
  const userId = (sessionUser as { id?: string } | undefined)?.id;
  if (!userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return userId;
}

export const transactionsRouter = createTRPCRouter({
  list: protectedProcedure.input(TransactionFilterSchema).query(async ({ ctx, input }) => {
    const userId = getSessionUserId(ctx.user);
    const transactions = await getTransactions(userId, input.dateRange);

    const filtered = transactions
      .filter((transaction) => {
        if (input.categories?.length && !input.categories.includes(String(transaction.category ?? ''))) {
          return false;
        }

        if (input.minAmount !== undefined && Number(transaction.amount ?? 0) < input.minAmount) {
          return false;
        }

        if (input.maxAmount !== undefined && Number(transaction.amount ?? 0) > input.maxAmount) {
          return false;
        }

        if (
          input.paymentMethods?.length &&
          !input.paymentMethods.includes((transaction.paymentMethod as z.infer<typeof paymentMethodEnum>) ?? 'card')
        ) {
          return false;
        }

        if (input.search) {
          const haystack = `${transaction.merchant ?? ''} ${transaction.description ?? ''}`.toLowerCase();
          if (!haystack.includes(input.search.toLowerCase())) {
            return false;
          }
        }

        return true;
      })
      .slice(0, input.limit);

    return {
      transactions: filtered,
      nextCursor: undefined,
    };
  }),

  create: protectedProcedure.input(CreateTransactionSchema).mutation(async ({ ctx, input }) => {
    const userId = getSessionUserId(ctx.user);
    return createTransaction(userId, input);
  }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          category: z.string().optional(),
          merchant: z.string().optional(),
          description: z.string().optional(),
          tags: z.array(z.string()).optional(),
          amount: z.number().positive().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getSessionUserId(ctx.user);
      const existing = await getTransactionById(userId, input.id);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      return updateTransaction(input.id, input.data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = getSessionUserId(ctx.user);
      const existing = await getTransactionById(userId, input.id);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      await updateTransaction(input.id, { deletedAt: new Date() });
      return { success: true };
    }),

  split: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        splits: z
          .array(
            z.object({
              amount: z.number().positive(),
              category: z.string().optional(),
              description: z.string().optional(),
            }),
          )
          .min(2),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getSessionUserId(ctx.user);
      const original = await getTransactionById(userId, input.id);

      if (!original) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      const totalSplit = input.splits.reduce((sum, split) => sum + split.amount, 0);
      if (Math.abs(totalSplit - Number(original.amount ?? 0)) > 0.001) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Split amounts must equal original' });
      }

      await updateTransaction(input.id, { deletedAt: new Date() });

      const splits = await Promise.all(
        input.splits.map((split) =>
          createTransaction(userId, {
            amount: split.amount,
            type: original.type === 'income' ? 'income' : 'expense',
            category: split.category ?? String(original.category ?? 'other'),
            merchant: String(original.merchant ?? ''),
            merchantLogoUrl: (original.merchantLogoUrl as string | null | undefined) ?? null,
            description: split.description ?? String(original.description ?? ''),
            datetime: new Date(String(original.datetime)),
            paymentMethod:
              (original.paymentMethod as z.infer<typeof paymentMethodEnum> | null | undefined) ?? null,
            pixKey: (original.pixKey as string | null | undefined) ?? null,
            authenticationCode: (original.authenticationCode as string | null | undefined) ?? null,
            location: (original.location as string | null | undefined) ?? null,
            tags: Array.isArray(original.tags) ? (original.tags as string[]) : [],
            isRecurring: Boolean(original.isRecurring),
            transactionExternalId: null,
            deletedAt: null,
          }),
        ),
      );

      return { originalDeleted: true, splits };
    }),
});
