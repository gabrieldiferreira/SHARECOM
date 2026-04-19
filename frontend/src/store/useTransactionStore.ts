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
  clearAllData: () => Promise<void>;
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
    
    try {
      // First try to delete from backend
      await authenticatedFetch(getApiUrl(`/expenses/${id}`), {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn("Could not delete from backend, it might be already gone.");
    }

    // Always delete locally
    await db.delete('transactions', id);
    set({ transactions: get().transactions.filter(t => t.id !== id) });
    get().fetchTransactions();
  },

  clearAllData: async () => {
    try {
      await authenticatedFetch(getApiUrl("/expenses/clear-all"), {
        method: 'POST'
      });
    } catch (e) {
      console.error("Failed to clear backend data");
    }

    const db = await getDB();
    if (db) {
      await db.clear('transactions');
      get().fetchTransactions();
    }
  },

  syncWithBackend: async () => {
    try {
      const res = await authenticatedFetch(getApiUrl("/expenses"));
      if (res.ok) {
        const remoteData = await res.json();
        const db = await getDB();
        if (db) {
          try {
            const txSet = db.transaction('transactions', 'readwrite');
            for (const item of remoteData) {
              // Mapeamento correto dos campos do backend para o store
              await txSet.store.put({
                id: item.id,
                total_amount: Number(item.amount) || 0,
                currency: 'BRL',
                transaction_date: item.date,
                transaction_type: item.transaction_type || 'Outflow',  // usa o valor real do backend
                payment_method: item.payment_method || 'Comprovante',
                merchant_name: item.merchant || 'Desconhecido',
                category: item.category || 'Outros',
                receipt_hash: item.receipt || undefined,
                destination_institution: item.destination_institution || undefined,
                transaction_id: item.transaction_id || undefined,
                masked_cpf: item.masked_cpf || undefined,
                is_synced: true,
                note: item.note || undefined,
                is_deductible: item.is_deductible === 1 || item.is_deductible === true,
                reimbursement_status: item.reimbursement_status || 'None',
              });
            }
            await txSet.done;
            get().fetchTransactions();
          } catch (dbError) {
            if (dbError instanceof DOMException && dbError.name === 'AbortError') {
              console.warn("IndexedDB transaction aborted during sync.");
            } else {
              throw dbError;
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message === "AUTH_REQUIRED") {
        return; // Ignora sync antes do login estar pronto
      }
      console.warn("Offline: Synchronization deferred.");
    }
  },
  
  setPendingNote: (note: string) => set({ pendingNote: note })
}));
