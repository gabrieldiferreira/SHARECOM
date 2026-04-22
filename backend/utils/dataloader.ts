import DataLoader from 'dataloader';
import { Prisma, PrismaClient } from '@prisma/client';

export function createUserLoader(prisma: PrismaClient) {
  return new DataLoader<string, ReturnType<PrismaClient['user']['findUnique'] | null>(
    async (ids: string[]) => {
      const users = await prisma.user.findMany({
        where: { id: { in: ids } },
      });
      
      const userMap = new Map(users.map(u => [u.id, u]));
      
      return ids.map(id => userMap.get(id) || null);
    },
    {
      maxBatchSize: 100,
      batchScheduleFn: (cb) => setTimeout(cb, 50),
    }
  );
}

export function createTransactionLoader(prisma: PrismaClient) {
  return new DataLoader<string, ReturnType<PrismaClient['transaction']['findMany']>>(
    async (userIds: string[]) => {
      const transactions = await prisma.transaction.findMany({
        where: { user_id: { in: userIds } },
        orderBy: { transaction_date: 'desc' },
      });
      
      const txMap = new Map<string, typeof transactions>();
      for (const userId of userIds) {
        txMap.set(userId, transactions.filter(t => t.user_id === userId));
      }
      
      return userIds.map(id => txMap.get(id) || []);
    },
    {
      maxBatchSize: 50,
      batchScheduleFn: (cb) => setTimeout(cb, 50),
    }
  );
}

export function createCategoryLoader(prisma: PrismaClient) {
  return new DataLoader<string, ReturnType<PrismaClient['category']['findUnique'] | null>(
    async (ids: string[]) => {
      const categories = await prisma.category.findMany({
        where: { id: { in: ids } },
      });
      
      const catMap = new Map(categories.map(c => [c.id, c]));
      
      return ids.map(id => catMap.get(id) || null);
    },
    {
      maxBatchSize: 50,
    }
  );
}

export type Loaders = {
  userLoader: ReturnType<typeof createUserLoader>;
  transactionLoader: ReturnType<typeof createTransactionLoader>;
  categoryLoader: ReturnType<typeof createCategoryLoader>;
};

export function createLoaders(prisma: PrismaClient): Loaders {
  return {
    userLoader: createUserLoader(prisma),
    transactionLoader: createTransactionLoader(prisma),
    categoryLoader: createCategoryLoader(prisma),
  };
}