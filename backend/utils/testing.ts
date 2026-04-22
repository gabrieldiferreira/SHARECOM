import { PrismaClient } from '@prisma/client';

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 30000,
    private resetTimeout: number = 60000
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
        setTimeout(() => {
          this.state = 'closed';
          this.failures = 0;
        }, this.timeout);
      }
      
      throw error;
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

export class GeminiCircuitBreaker extends CircuitBreaker {
  constructor() {
    super(3, 60000, 30000);
  }
}

export class OpenFICCircuitBreaker extends CircuitBreaker {
  constructor() {
    super(5, 30000, 60000);
  }
}

export async function testDbConnection(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function testConcurrentTransactions(
  prisma: PrismaClient,
  accountId: string,
  count: number = 50
): Promise<{ success: number; conflicts: number; errors: number }> {
  const results = { success: 0, conflicts: 0, errors: 0 };
  
  const promises = Array(count).fill(0).map(async (_, i) => {
    try {
      await prisma.$transaction(async (tx) => {
        const account = await tx.account.findUnique({
          where: { id: accountId },
        });
        
        if (!account) throw new Error('Account not found');
        
        await tx.account.update({
          where: { id: accountId },
          data: {
            balance_cents: { increment: 1 },
            version: { increment: 1 },
          },
        });
      });
      results.success++;
    } catch (error: any) {
      if (error.message?.includes('version')) {
        results.conflicts++;
      } else {
        results.errors++;
      }
    }
  });
  
  await Promise.all(promises);
  
  return results;
}

export async function createChaosTestSuite(prisma: PrismaClient) {
  const tests = {
    dbConnection: async () => {
      const connected = await testDbConnection(prisma);
      if (!connected) throw new Error('Database connection failed');
    },
    
    concurrentWrites: async () => {
      const account = await prisma.account.findFirst();
      if (!account) {
        console.log('[Chaos] No account found, skipping concurrent test');
        return;
      }
      
      const results = await testConcurrentTransactions(prisma, account.id, 10);
      console.log('[Chaos] Concurrent test results:', results);
      
      if (results.errors > 5) {
        throw new Error(`Too many errors: ${results.errors}`);
      }
    },
    
    transactionRollback: async () => {
      try {
        await prisma.$transaction(async (_tx) => {
          throw new Error('Simulated failure');
        });
      } catch {
        // Expected
      }
    },
  };
  
  return tests;
}