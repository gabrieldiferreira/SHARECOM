import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  QueryConstraint,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'pix' | 'card' | 'cash' | 'transfer';

export interface UserProfile {
  email: string;
  name?: string | null;
  photoURL?: string | null;
  locale?: string;
  currency?: string;
  createdAt?: Date | string;
}

export interface TransactionRecord {
  id?: string;
  userId: string;
  merchant?: string | null;
  merchantLogoUrl?: string | null;
  amount: number;
  type: TransactionType;
  category?: string | null;
  paymentMethod?: PaymentMethod | null;
  pixKey?: string | null;
  authenticationCode?: string | null;
  datetime: Date | string;
  location?: string | null;
  tags?: string[];
  isRecurring?: boolean;
  description?: string | null;
  deletedAt?: Date | string | null;
  createdAt?: Date | string;
  transactionExternalId?: string | null;
}

export interface BudgetRecord {
  id?: string;
  userId: string;
  categoryId: string;
  month: string;
  limitAmount: number;
}

export interface GoalRecord {
  id?: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: Date | string | null;
  savingRules?: Record<string, unknown> | null;
}

export interface AlertRecord {
  id?: string;
  userId: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  isRead: boolean;
  createdAt?: Date | string;
  metadata?: Record<string, unknown> | null;
}

function requireDb() {
  if (!db) {
    throw new Error('Firestore is not configured');
  }

  return db;
}

function toDate(value: Date | string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        normalizeFirestoreValue(nestedValue),
      ]),
    );
  }

  return value;
}

function normalizeDoc<T extends Record<string, unknown>>(id: string, data: T) {
  return {
    id,
    ...(normalizeFirestoreValue(data) as Record<string, unknown>),
  } as T & { id: string };
}

function toComparableDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function isLikelyFirestoreQueryError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('index') ||
    message.includes('query requires') ||
    message.includes('invalid query') ||
    message.includes('failed-precondition')
  );
}

export async function upsertUser(
  userId: string,
  data: Partial<UserProfile>,
) {
  const firestore = requireDb();
  const userRef = doc(firestore, 'users', userId);
  const existing = await getDoc(userRef);

  const payload = {
    ...data,
    createdAt: existing.exists() ? existing.data().createdAt ?? new Date() : new Date(),
  };

  if (existing.exists()) {
    await updateDoc(userRef, payload);
  } else {
    await updateDocWithCreate(userRef, payload);
  }

  const snapshot = await getDoc(userRef);
  return normalizeDoc(snapshot.id, snapshot.data() as Record<string, unknown>);
}

async function updateDocWithCreate(reference: ReturnType<typeof doc>, data: Record<string, unknown>) {
  const firestore = requireDb();
  const batch = writeBatch(firestore);
  batch.set(reference, data);
  await batch.commit();
}

export async function getUserProfile(userId: string) {
  const firestore = requireDb();
  const snapshot = await getDoc(doc(firestore, 'users', userId));
  if (!snapshot.exists()) {
    return null;
  }

  return normalizeDoc(snapshot.id, snapshot.data() as Record<string, unknown>);
}

export async function createTransaction(
  userId: string,
  data: Omit<TransactionRecord, 'id' | 'userId' | 'createdAt'>,
) {
  const firestore = requireDb();
  const payload = {
    userId,
    ...data,
    datetime: toDate(data.datetime) ?? new Date(),
    deletedAt: data.deletedAt === undefined ? null : toDate(data.deletedAt) ?? null,
    createdAt: new Date(),
  };

  const reference = await addDoc(collection(firestore, 'transactions'), payload);
  const snapshot = await getDoc(reference);
  return normalizeDoc(snapshot.id, snapshot.data() as Record<string, unknown>);
}

export async function getTransactions(
  userId: string,
  dateRange?: { start?: Date; end?: Date },
) {
  const firestore = requireDb();
  const constraints: QueryConstraint[] = [where('userId', '==', userId)];

  if (dateRange?.start) {
    constraints.push(where('datetime', '>=', dateRange.start));
  }

  if (dateRange?.end) {
    constraints.push(where('datetime', '<=', dateRange.end));
  }

  constraints.push(orderBy('datetime', 'desc'));
  constraints.push(limit(100));

  try {
    const snapshot = await getDocs(query(collection(firestore, 'transactions'), ...constraints));

    return snapshot.docs
      .map((transactionDoc) =>
        normalizeDoc(transactionDoc.id, transactionDoc.data() as Record<string, unknown>),
      )
      .filter((transaction) => !transaction.deletedAt);
  } catch (error) {
    if (!isLikelyFirestoreQueryError(error)) {
      throw error;
    }

    console.warn('Firestore transaction query failed, using fallback scan:', error);

    const fallbackSnapshot = await getDocs(
      query(collection(firestore, 'transactions'), where('userId', '==', userId), limit(500)),
    );

    return fallbackSnapshot.docs
      .map((transactionDoc) =>
        normalizeDoc(transactionDoc.id, transactionDoc.data() as Record<string, unknown>),
      )
      .filter((transaction) => !transaction.deletedAt)
      .filter((transaction) => {
        const transactionDate = toComparableDate(transaction.datetime);
        if (!transactionDate) {
          return false;
        }

        if (dateRange?.start && transactionDate < dateRange.start) {
          return false;
        }

        if (dateRange?.end && transactionDate > dateRange.end) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftTime = toComparableDate(left.datetime)?.getTime() ?? 0;
        const rightTime = toComparableDate(right.datetime)?.getTime() ?? 0;
        return rightTime - leftTime;
      })
      .slice(0, 100);
  }
}

export async function getTransactionById(userId: string, id: string) {
  const firestore = requireDb();
  const snapshot = await getDoc(doc(firestore, 'transactions', id));

  if (!snapshot.exists()) {
    return null;
  }

  const transaction = normalizeDoc(snapshot.id, snapshot.data() as Record<string, unknown>);
  if (transaction.userId !== userId) {
    return null;
  }

  return transaction;
}

export async function updateTransaction(
  id: string,
  data: Partial<Omit<TransactionRecord, 'id' | 'userId'>>,
) {
  const firestore = requireDb();
  const payload = {
    ...data,
    ...(data.datetime !== undefined ? { datetime: toDate(data.datetime) } : {}),
    ...(data.deletedAt !== undefined ? { deletedAt: toDate(data.deletedAt) } : {}),
  };

  await updateDoc(doc(firestore, 'transactions', id), payload);
  const snapshot = await getDoc(doc(firestore, 'transactions', id));
  return normalizeDoc(snapshot.id, snapshot.data() as Record<string, unknown>);
}

export async function deleteTransaction(id: string) {
  const firestore = requireDb();
  await deleteDoc(doc(firestore, 'transactions', id));
}

export async function importTransactions(
  userId: string,
  transactions: Array<Partial<TransactionRecord>>,
) {
  const created = await Promise.all(
    transactions.map((transaction) =>
      createTransaction(userId, {
        amount: Number(transaction.amount ?? 0),
        type: transaction.type === 'income' ? 'income' : 'expense',
        merchant: transaction.merchant ?? transaction.description ?? 'Imported transaction',
        merchantLogoUrl: transaction.merchantLogoUrl ?? null,
        category: transaction.category ?? 'other',
        paymentMethod:
          transaction.paymentMethod === 'pix' ||
          transaction.paymentMethod === 'card' ||
          transaction.paymentMethod === 'cash' ||
          transaction.paymentMethod === 'transfer'
            ? transaction.paymentMethod
            : null,
        pixKey: transaction.pixKey ?? null,
        authenticationCode: transaction.authenticationCode ?? null,
        datetime: transaction.datetime ?? new Date(),
        location: transaction.location ?? null,
        tags: Array.isArray(transaction.tags) ? transaction.tags : [],
        isRecurring: Boolean(transaction.isRecurring),
        description: transaction.description ?? null,
        transactionExternalId: transaction.transactionExternalId ?? null,
        deletedAt: null,
      }),
    ),
  );

  return created;
}

export async function listAlerts(userId: string, options?: { unreadOnly?: boolean; severity?: string; limitCount?: number }) {
  const firestore = requireDb();
  const constraints: QueryConstraint[] = [where('userId', '==', userId)];

  if (options?.unreadOnly) {
    constraints.push(where('isRead', '==', false));
  }

  if (options?.severity) {
    constraints.push(where('severity', '==', options.severity));
  }

  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(options?.limitCount ?? 50));

  const snapshot = await getDocs(query(collection(firestore, 'alerts'), ...constraints));
  return snapshot.docs.map((alertDoc) =>
    normalizeDoc(alertDoc.id, alertDoc.data() as Record<string, unknown>),
  );
}

export async function markAlertRead(userId: string, alertId: string) {
  const alert = await getDoc(doc(requireDb(), 'alerts', alertId));
  if (!alert.exists() || alert.data().userId !== userId) {
    return { success: false };
  }

  await updateDoc(alert.ref, { isRead: true });
  return { success: true };
}

export async function markAllAlertsRead(userId: string) {
  const firestore = requireDb();
  const snapshot = await getDocs(
    query(collection(firestore, 'alerts'), where('userId', '==', userId), where('isRead', '==', false)),
  );

  if (snapshot.empty) {
    return { success: true, updated: 0 };
  }

  const batch = writeBatch(firestore);
  snapshot.docs.forEach((alertDoc) => batch.update(alertDoc.ref, { isRead: true }));
  await batch.commit();

  return { success: true, updated: snapshot.size };
}

export async function clearUserCollections(userId: string) {
  const firestore = requireDb();
  const collectionsToClear = ['transactions', 'alerts', 'budgets', 'goals'];
  const counts: Record<string, number> = {};

  for (const collectionName of collectionsToClear) {
    const snapshot = await getDocs(
      query(collection(firestore, collectionName), where('userId', '==', userId), limit(500)),
    );

    counts[collectionName] = snapshot.size;

    if (!snapshot.empty) {
      const batch = writeBatch(firestore);
      snapshot.docs.forEach((entry) => batch.delete(entry.ref));
      await batch.commit();
    }
  }

  return counts;
}

export async function seedFirestore(userId: string, count = 300) {
  const merchants = [
    'Starbucks',
    'Uber',
    'iFood',
    'Rappi',
    'Netflix',
    'Spotify',
    'Amazon',
    'Mercado Livre',
    'Nubank',
    'Carrefour',
    'McDonald\'s',
    'Shell',
  ];
  const categories = [
    'eating_out',
    'groceries',
    'transport',
    'entertainment',
    'shopping',
    'health',
    'subscriptions',
    'other',
  ];
  const paymentMethods: PaymentMethod[] = ['pix', 'card', 'cash', 'transfer'];

  const tasks = Array.from({ length: count }, async () => {
    const isIncome = Math.random() < 0.15;
    const randomDaysAgo = Math.floor(Math.random() * 90);

    return createTransaction(userId, {
      merchant: merchants[Math.floor(Math.random() * merchants.length)],
      merchantLogoUrl: null,
      amount: Number((Math.random() * (isIncome ? 4500 : 490) + (isIncome ? 500 : 10)).toFixed(2)),
      type: isIncome ? 'income' : 'expense',
      category: categories[Math.floor(Math.random() * categories.length)],
      paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
      pixKey: null,
      authenticationCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
      datetime: new Date(Date.now() - randomDaysAgo * 24 * 60 * 60 * 1000),
      location: null,
      tags: [],
      isRecurring: Math.random() < 0.2,
      description: isIncome ? 'Recebimento' : 'Pagamento',
      transactionExternalId: crypto.randomUUID(),
      deletedAt: null,
    });
  });

  await Promise.all(tasks);
  return { transactionsCreated: count };
}

export async function getCashFlowSummary(userId: string, startDate: Date) {
  const transactions = await getTransactions(userId, { start: startDate });

  const income = transactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);

  const expenses = transactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);

  return {
    transactions,
    income,
    expenses,
    net: income - expenses,
  };
}
