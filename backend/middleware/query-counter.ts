import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      queryCount?: number;
      queryLog?: Array<{
        query: string;
        params: unknown;
        duration: number;
        timestamp: number;
      }>;
    }
  }
}

const QUERY_THRESHOLD = 10;
const queryCount = new Map<string, number>();
const queryLog: Array<{
  method: string;
  path: string;
  count: number;
  avgDuration: number;
  timestamp: number;
}> = [];

export function queryCounterMiddleware(prisma: PrismaClient) {
  prisma.$on('query', (e: Prisma.QueryEvent) => {
    const req = (global as any).req || {};
    const key = `${req.method}:${req.path}`;
    
    queryCount.set(key, (queryCount.get(key) || 0) + 1);
    
    if (req.queryLog) {
      req.queryLog.push({
        query: e.query,
        params: e.params,
        duration: e.duration,
        timestamp: Date.now(),
      });
    }
  });
  
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    res.send = function (...args: unknown[]) {
      const key = `${req.method}:${req.path}`;
      const count = queryCount.get(key) || 0;
      
      res.setHeader('X-Query-Count', String(count));
      
      if (count > QUERY_THRESHOLD) {
        console.warn(`[N+1 WARNING] ${req.method} ${req.path} executed ${count} queries (threshold: ${QUERY_THRESHOLD})`);
      }
      
      queryLog.push({
        method: req.method,
        path: req.path,
        count,
        avgDuration: 0,
        timestamp: Date.now(),
      });
      
      queryCount.set(key, 0);
      
      return originalSend.apply(res, args);
    };
    
    next();
  };
}

export async function batchUserLoader(
  prisma: PrismaClient,
  ids: string[]
): Promise<Map<string, NonNullable<Awaited<ReturnType<PrismaClient['user']['findUnique']>>>> {
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
  });
  
  const userMap = new Map();
  for (const user of users) {
    userMap.set(user.id, user);
  }
  
  return userMap;
}

export function getQueryStats() {
  return queryLog.slice(-100);
}

export function resetQueryStats() {
  queryLog.length = 0;
  queryCount.clear();
}

export type { PrismaClient };