import { router } from '../trpc';
import { transactionsRouter } from './transactions';
import { dashboardRouter } from './dashboard';
import { alertsRouter } from './alerts';

export const appRouter = router({
  transactions: transactionsRouter,
  dashboard: dashboardRouter,
  alerts: alertsRouter,
});

export type AppRouter = typeof appRouter;
