import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface TransactionEntity {
  id?: number;
  owner_uid?: string;
  total_amount: number;
  currency: string;
  transaction_date: string;  // Date printed on the receipt
  scanned_at?: string;       // ISO timestamp of when it was scanned into the system
  transaction_type: 'Inflow' | 'Outflow';
  payment_method: string;
  merchant_name: string;
  category: string;
  destination_institution?: string;
  transaction_id?: string;
  masked_cpf?: string;
  description?: string;
  needs_manual_review?: boolean;
  receipt_hash?: string; // SHA-256
  is_synced: boolean;
  note?: string;
  deleted_at?: string; // ISO date for trash retention
}

interface SharecomDB extends DBSchema {
  transactions: {
    key: number;
    value: TransactionEntity;
    indexes: { 'by-date': string; 'by-owner': string; 'by-owner-hash': [string, string] };
  };
}

let dbPromise: Promise<IDBPDatabase<SharecomDB>> | null = null;
export const TRANSACTION_CACHE_OWNER_KEY = 'sharecom-db-owner-uid';

export function getDB() {
  if (typeof window === 'undefined') return null;
  
  if (!dbPromise) {
    dbPromise = openDB<SharecomDB>('sharecom-db', 5, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('transactions', {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('by-date', 'transaction_date');
          store.createIndex('by-owner', 'owner_uid');
          store.createIndex('by-owner-hash', ['owner_uid', 'receipt_hash'], { unique: true });
        }
        if (oldVersion < 3) {
          // v3: Fix field mapping from backend. Clear local cache — data re-downloaded via syncWithBackend.
          if (db.objectStoreNames.contains('transactions')) {
            transaction.objectStore('transactions').clear();
          }
        }
        // v4: Added scanned_at field — no data migration needed, field is optional.
        // Existing records without scanned_at will fall back to transaction_date in filters.
        if (oldVersion < 5 && db.objectStoreNames.contains('transactions')) {
          // v5: Local transaction cache is now user-scoped. Legacy rows do not carry owner_uid,
          // so clear them and re-download from the authenticated Firebase account.
          const store = transaction.objectStore('transactions');
          const mutableStore = store as typeof store & {
            deleteIndex(name: string): void;
            indexNames: DOMStringList;
          };
          store.clear();
          if (mutableStore.indexNames.contains('by-hash')) {
            mutableStore.deleteIndex('by-hash');
          }
          if (!store.indexNames.contains('by-owner')) {
            store.createIndex('by-owner', 'owner_uid');
          }
          if (!store.indexNames.contains('by-owner-hash')) {
            store.createIndex('by-owner-hash', ['owner_uid', 'receipt_hash'], { unique: true });
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function clearLocalTransactionCache() {
  if (typeof window === 'undefined') return;

  const db = await getDB();
  if (db) {
    await db.clear('transactions');
  }
  window.localStorage.removeItem(TRANSACTION_CACHE_OWNER_KEY);
}

export async function computeSHA256(file: File | Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
