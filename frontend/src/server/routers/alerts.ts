import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const alertsRouter = router({
  list: protectedProcedure
    .input(z.object({
      unreadOnly: z.boolean().default(false),
      limit: z.number().min(1).max(100).default(20),
      cursor: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const userId = (ctx.user as any)?.id;
      if (!userId) return { items: [], nextCursor: null, unreadCount: 0 };

      const where = {
        user_id: userId,
        ...(input?.unreadOnly ? { is_read: false } : {}),
      };

      const items = await ctx.prisma.alert.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: (input?.limit || 20) + 1,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | null = null;
      if (items.length > (input?.limit || 20)) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id || null;
      }

      const unreadCount = await ctx.prisma.alert.count({
        where: { user_id: userId, is_read: false },
      });

      return { items, nextCursor, unreadCount };
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx.user as any)?.id;
      if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED' });

      const alert = await ctx.prisma.alert.findFirst({
        where: { id: input.id, user_id: userId },
      });

      if (!alert) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Alert not found' });
      }

      return ctx.prisma.alert.update({
        where: { id: input.id },
        data: { is_read: true },
      });
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = (ctx.user as any)?.id;
    if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED' });

    return ctx.prisma.alert.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });
  }),
});
