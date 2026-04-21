/**
 * MOCK DATA GENERATOR
 * Generates highly realistic Brazilian transaction data for all 8 dashboards.
 * Useful for testing UI, analytics, charts, and investor demos without real bank connections.
 */

import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';

const START_DATE = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago

// Real Brazilian Merchants
const MERCHANTS = [
  { name: 'Uber', category: 'transport', type: 'expense', min: 12, max: 45, prob: 0.15 },
  { name: 'iFood', category: 'eatingOut', type: 'expense', min: 35, max: 80, prob: 0.1 },
  { name: 'Carrefour', category: 'groceries', type: 'expense', min: 150, max: 400, prob: 0.05 },
  { name: 'Starbucks', category: 'eatingOut', type: 'expense', min: 15, max: 35, prob: 0.08 },
  { name: 'Netflix', category: 'services', type: 'expense', min: 39.9, max: 39.9, prob: 0.02, recurring: true },
  { name: 'Spotify', category: 'services', type: 'expense', min: 21.9, max: 21.9, prob: 0.02, recurring: true },
  { name: 'Smart Fit', category: 'health', type: 'expense', min: 119.9, max: 119.9, prob: 0.02, recurring: true },
  { name: 'Droga Raia', category: 'health', type: 'expense', min: 40, max: 120, prob: 0.05 },
  { name: 'Posto Ipiranga', category: 'transport', type: 'expense', min: 100, max: 250, prob: 0.05 },
  { name: 'Amazon Prime', category: 'services', type: 'expense', min: 14.9, max: 14.9, prob: 0.02, recurring: true },
  { name: 'Enel (Energia)', category: 'home', type: 'expense', min: 120, max: 280, prob: 0.02, recurring: true },
  { name: 'Sabesp (Água)', category: 'home', type: 'expense', min: 60, max: 140, prob: 0.02, recurring: true },
  { name: 'Cinemark', category: 'leisure', type: 'expense', min: 60, max: 120, prob: 0.03 },
  { name: 'Leroy Merlin', category: 'home', type: 'expense', min: 200, max: 800, prob: 0.01 },
  { name: 'Empresa XPTO Ltda', category: 'income', type: 'income', min: 5200, max: 5200, prob: 0.03, recurring: true }, // Salary
  { name: 'Freelance Design', category: 'income', type: 'income', min: 800, max: 2500, prob: 0.04 },
];

const PAYMENT_METHODS = [
  { name: 'pix', prob: 0.6 },
  { name: 'card', prob: 0.3 },
  { name: 'cash', prob: 0.08 },
  { name: 'transfer', prob: 0.02 },
];

function randomWeighted<T>(items: (T & { prob: number })[]): T {
  const sum = items.reduce((acc, item) => acc + item.prob, 0);
  let r = Math.random() * sum;
  for (const item of items) {
    r -= item.prob;
    if (r <= 0) return item;
  }
  return items[0];
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function generatePixKey() {
  const types = ['cpf', 'email', 'random'];
  const t = types[randomInt(0, 2)];
  if (t === 'cpf') return `***.${randomInt(100, 999)}.${randomInt(100, 999)}-**`;
  if (t === 'email') return `contato@${Math.random().toString(36).substring(7)}.com.br`;
  return uuidv4();
}

export function generateMockTransactions(
  userId: string,
  accountId: string,
  count: number = 300
): Prisma.TransactionCreateManyInput[] {
  const transactions: Prisma.TransactionCreateManyInput[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const merchant = randomWeighted(MERCHANTS);
    const method = randomWeighted(PAYMENT_METHODS);
    
    // Spread dates over the last 90 days
    // Add bias for weekends (iFood, Cinema) and weekdays (Uber, Coffee)
    let date = new Date(START_DATE.getTime() + Math.random() * (now - START_DATE.getTime()));
    const day = date.getDay();
    const isWeekend = day === 0 || day === 6;

    if (merchant.category === 'eatingOut' || merchant.category === 'leisure') {
      if (!isWeekend && Math.random() > 0.3) {
        // Shift to weekend
        date = new Date(date.getTime() + (6 - day) * 24 * 60 * 60 * 1000);
      }
      // Set time to evening (19:00 - 23:00)
      date.setHours(randomInt(19, 23), randomInt(0, 59));
    } else if (merchant.name === 'Uber' || merchant.name === 'Starbucks') {
      // Set time to commute hours (07:00-09:00 or 17:00-19:00)
      const hour = Math.random() > 0.5 ? randomInt(7, 9) : randomInt(17, 19);
      date.setHours(hour, randomInt(0, 59));
    }

    // Ensure it's not in the future
    if (date.getTime() > now) date = new Date(now - Math.random() * 86400000);

    const amountCents = Math.round((Math.random() * (merchant.max - merchant.min) + merchant.min) * 100);

    transactions.push({
      id: uuidv4(),
      user_id: userId,
      account_id: accountId,
      amount_cents: amountCents,
      type: merchant.type as any,
      category_id: merchant.category,
      merchant_name: merchant.name,
      description: `Mocked ${merchant.name}`,
      datetime: date,
      payment_method: method.name as any,
      pix_key: method.name === 'pix' ? generatePixKey() : null,
      authentication_code: uuidv4().replace(/-/g, '').substring(0, 20).toUpperCase(),
      is_recurring: merchant.recurring || false,
      recurrence_pattern: merchant.recurring ? `monthly:${amountCents}` : null,
      created_at: new Date(),
    });
  }

  // --- INJECT ANOMALIES FOR FORENSICS & ALERTS TESTING ---
  
  // 1. Unusual Amount (Uber R$ 1500)
  transactions.push({
    id: uuidv4(),
    user_id: userId,
    account_id: accountId,
    amount_cents: 150000,
    type: 'expense',
    category_id: 'transport',
    merchant_name: 'Uber',
    datetime: new Date(now - 2 * 86400000), // 2 days ago
    payment_method: 'card',
    authentication_code: 'ANOMALY_1',
    created_at: new Date(),
  });

  // 2. First-time expensive merchant
  transactions.push({
    id: uuidv4(),
    user_id: userId,
    account_id: accountId,
    amount_cents: 850000,
    type: 'expense',
    category_id: 'others',
    merchant_name: 'Apple Store SP',
    datetime: new Date(now - 5 * 86400000), // 5 days ago
    payment_method: 'card',
    authentication_code: 'ANOMALY_2',
    created_at: new Date(),
  });

  // 3. Duplicate transaction (Velocity fraud test)
  const dupId = uuidv4().replace(/-/g, '').substring(0, 20).toUpperCase();
  const dupDate = new Date(now - 10 * 86400000);
  
  transactions.push({
    id: uuidv4(),
    user_id: userId,
    account_id: accountId,
    amount_cents: 4500,
    type: 'expense',
    category_id: 'eatingOut',
    merchant_name: 'McDonalds',
    datetime: dupDate,
    payment_method: 'pix',
    authentication_code: dupId,
    created_at: new Date(),
  });
  
  transactions.push({
    id: uuidv4(),
    user_id: userId,
    account_id: accountId,
    amount_cents: 4500,
    type: 'expense',
    category_id: 'eatingOut',
    merchant_name: 'McDonalds',
    datetime: new Date(dupDate.getTime() + 1000 * 60 * 2), // 2 mins later
    payment_method: 'pix',
    authentication_code: dupId, // SAME auth code!
    created_at: new Date(),
  });

  return transactions;
}
