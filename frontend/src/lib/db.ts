import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface TransactionEntity {
  id?: number;
  total_amount: number;
  currency: string;
  transaction_date: string;
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
}

interface SharecomDB extends DBSchema {
  transactions: {
    key: number;
    value: TransactionEntity;
    indexes: { 'by-date': string, 'by-hash': string };
  };
}

let dbPromise: Promise<IDBPDatabase<SharecomDB>> | null = null;

export function getDB() {
  if (typeof window === 'undefined') return null;
  
  if (!dbPromise) {
    dbPromise = openDB<SharecomDB>('sharecom-db', 3, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('transactions', {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('by-date', 'transaction_date');
          store.createIndex('by-hash', 'receipt_hash', { unique: true });
        }
        if (oldVersion < 3) {
          // v3: Corrige mapeamento errado dos campos vindos do backend.
          // Limpa o cache local — dados corretos são re-baixados via syncWithBackend.
          if (db.objectStoreNames.contains('transactions')) {
            transaction.objectStore('transactions').clear();
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function computeSHA256(file: File | Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
