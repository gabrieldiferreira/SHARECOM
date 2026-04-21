import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let connection: IORedis | null = null;

const getConnection = () => {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    
    connection.on('error', (err) => {
      // Suppress connection errors if Redis isn't up locally
      if (err.code !== 'ECONNREFUSED') console.error('Redis error:', err);
    });
  }
  return connection;
};

// Cache queue instances
const instances: Record<string, Queue> = {};

const getQueue = (name: string) => {
  if (!instances[name]) {
    instances[name] = new Queue(name, { connection: getConnection() });
  }
  return instances[name];
};

export const queues = {
  get categorizeTransaction() { return getQueue('categorize-transaction'); },
  get detectRecurring() { return getQueue('detect-recurring'); },
  get calculateBurnRate() { return getQueue('calculate-burn-rate'); },
  get fraudDetection() { return getQueue('fraud-detection'); },
  get budgetAlerts() { return getQueue('budget-alerts'); },
  get goalProgress() { return getQueue('goal-progress'); },
};
