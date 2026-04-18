import { create } from 'zustand';
import { TransactionEntity, getDB } from '../lib/db';
import { getApiUrl } from '../lib/api';
import { authenticatedFetch } from '../lib/auth';

interface TransactionState {
  transactions: TransactionEntity[];
  isLoading: boolean;
  totalInflow: number;
  totalOutflow: number;
  balance: number;
  pendingNote: string;
  
  // Actions
  fetchTransactions: () => Promise<void>;
  addTransaction: (tx: TransactionEntity) => Promise<void>;
  deleteTransaction: (id: number) => Promise<void>;
  syncWithBackend: () => Promise<void>;
  setPendingNote: (note: string) => void;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  isLoading: false,
  totalInflow: 0,
  totalOutflow: 0,
  balance: 0,
  pendingNote: "",

  fetchTransactions: async () => {
    set({ isLoading: true });
    const db = await getDB();
    if (!db) return;
    const txs = await db.getAllFromIndex('transactions', 'by-date');
    const sorted = txs.reverse();
    
    // Calculate metrics
    const inflow = sorted.reduce((acc, tx) => (tx.transaction_type === 'Inflow' || tx.category === 'Receita') ? acc + tx.total_amount : acc, 0);
    const outflow = sorted.reduce((acc, tx) => (tx.transaction_type === 'Outflow' && tx.category !== 'Receita') ? acc + tx.total_amount : acc, 0);
    
    set({ 
      transactions: sorted, 
      isLoading: false,
      totalInflow: inflow,
      totalOutflow: outflow,
      balance: inflow - outflow
    });
  },

  addTransaction: async (tx: TransactionEntity) => {
    const db = await getDB();
    if (!db) return;

    try {
      if (tx.receipt_hash) {
        const existing = await db.getFromIndex('transactions', 'by-hash', tx.receipt_hash);
        if (existing?.id) {
          await db.put('transactions', {
            ...existing,
            ...tx,
            id: existing.id,
          });
          get().fetchTransactions();
          return;
        }
      }

      const id = await db.put('transactions', tx);
      const newTx = { ...tx, id: id as number };
      const currentTxs = [newTx, ...get().transactions];
      set({ transactions: currentTxs });
      get().fetchTransactions();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        // Duplicate hash race condition: refresh view and continue gracefully.
        get().fetchTransactions();
        return;
      }
      throw error;
    }
  },

  deleteTransaction: async (id: number) => {
    const db = await getDB();
    if (!db) return;
    await db.delete('transactions', id);
    set({ transactions: get().transactions.filter(t => t.id !== id) });
    get().fetchTransactions();
  },

  syncWithBackend: async () => {
    // Basic sync logic: fetch from backend and merge
    try {
      const res = await authenticatedFetch(getApiUrl("/expenses"));
      if (res.ok) {
        const remoteData = await res.json();
        const db = await getDB();
        if (db) {
          const txSet = db.transaction('transactions', 'readwrite');
          for (const item of remoteData) {
            await txSet.store.put({
               id: item.id,
               total_amount: item.amount,
               currency: 'BRL',
               transaction_date: item.date,
               transaction_type: 'Outflow', 
               payment_method: 'Desconhecido',
               merchant_name: item.merchant,
               category: item.category,
               receipt_hash: item.receipt,
               is_synced: true,
               note: item.note
            });
          }
          await txSet.done;
          get().fetchTransactions();
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message === "AUTH_REQUIRED") {
        // Ignore startup sync before auth is fully established.
        return;
      }
      console.warn("Offline: Synchronization deferred.");
    }
  },
  
  setPendingNote: (note: string) => set({ pendingNote: note })
}));
