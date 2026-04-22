// src/lib/bullmq.ts
import { Queue } from 'bullmq';
import { getRedisConnection } from './redis-connection';

let connection: any = null;

const getConnection = () => {
  if (!connection) {
    connection = getRedisConnection('bullmq-lib');
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
