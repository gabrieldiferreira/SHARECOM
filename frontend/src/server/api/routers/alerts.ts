import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { listAlerts, markAlertRead, markAllAlertsRead } from '@/lib/firestore';

const severityEnum = z.enum(['info', 'warning', 'critical']);

function getSessionUserId(sessionUser: unknown) {
  const userId = (sessionUser as { id?: string } | undefined)?.id;
  if (!userId) {
    throw new Error('Unauthorized');
  }

  return userId;
}

export const alertsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().default(false),
        severity: severityEnum.optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = getSessionUserId(ctx.user);
      return listAlerts(userId, {
        unreadOnly: input.unreadOnly,
        severity: input.severity,
        limitCount: input.limit,
      });
    }),

  markRead: protectedProcedure
    .input(
      z.object({
        alertId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getSessionUserId(ctx.user);
      return markAlertRead(userId, input.alertId);
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = getSessionUserId(ctx.user);
    return markAllAlertsRead(userId);
  }),
});
