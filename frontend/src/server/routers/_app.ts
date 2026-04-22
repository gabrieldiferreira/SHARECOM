import { router } from '../trpc';
import { transactionsRouter } from '../api/routers/transactions';
import { dashboardEnhancedRouter } from '../api/routers/dashboard-enhanced';
import { alertsRouter } from '../api/routers/alerts';

export const appRouter = router({
  transactions: transactionsRouter,
  dashboard: dashboardEnhancedRouter,
  alerts: alertsRouter,
});

export type AppRouter = typeof appRouter;
