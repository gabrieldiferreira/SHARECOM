// src/server/jobs/queues.ts
import { Queue } from 'bullmq';
import { getRedisConnection } from '@/lib/redis-connection';

let categorizationQueue: Queue | null = null;
let fraudQueue: Queue | null = null;
let recurringQueue: Queue | null = null;
let burnRateQueue: Queue | null = null;
let budgetAlertsQueue: Queue | null = null;
let goalProgressQueue: Queue | null = null;

const getQueue = (name: string) => {
  const connection = getRedisConnection('queues');
  return new Queue(name, { connection });
};

export const getCategorizationQueue = () => categorizationQueue ??= getQueue('categorize-transaction');
export const getFraudQueue = () => fraudQueue ??= getQueue('fraud-detection');
export const getRecurringQueue = () => recurringQueue ??= getQueue('detect-recurring');
export const getBurnRateQueue = () => burnRateQueue ??= getQueue('calculate-burn-rate');
export const getBudgetAlertsQueue = () => budgetAlertsQueue ??= getQueue('budget-alerts');
export const getGoalProgressQueue = () => goalProgressQueue ??= getQueue('goal-progress');

export async function addTransactionJob(queueName: string, data: any) {
  const queues: Record<string, () => Queue> = {
    'categorize-transaction': getCategorizationQueue,
    'fraud-detection': getFraudQueue,
    'detect-recurring': getRecurringQueue,
    'calculate-burn-rate': getBurnRateQueue,
    'budget-alerts': getBudgetAlertsQueue,
    'goal-progress': getGoalProgressQueue,
  };
  
  const queueGetter = queues[queueName];
  if (queueGetter) {
    try {
      const queue = queueGetter();
      await queue.add(queueName, data);
    } catch (err) {
      // Silence errors adding to queue if Redis is down
    }
  }
}
