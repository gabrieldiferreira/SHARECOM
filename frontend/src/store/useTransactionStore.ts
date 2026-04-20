import { create } from 'zustand';
import { TransactionEntity, getDB } from '../lib/db';
import { getApiUrl } from '../lib/api';
import { authenticatedFetch } from '../lib/auth';

interface TransactionState {
  transactions: TransactionEntity[];
  trashTransactions: TransactionEntity[];
  isLoading: boolean;
  totalInflow: number;
  totalOutflow: number;
  balance: number;
  pendingNote: string;
  
  // Actions
  fetchTransactions: () => Promise<void>;
  addTransaction: (tx: TransactionEntity) => Promise<{ success: boolean, isDuplicate: boolean }>;
  moveToTrash: (id: number) => Promise<void>;
  restoreFromTrash: (id: number) => Promise<void>;
  permanentDelete: (id: number) => Promise<void>;
  emptyTrash: () => Promise<void>;
  clearAllData: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
  setPendingNote: (note: string) => void;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  trashTransactions: [],
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
    
    // Purge logic: Remove items older than 15 days in trash
    const now = new Date();
    const fifteenDaysInMs = 15 * 24 * 60 * 60 * 1000;
    
    const active: TransactionEntity[] = [];
    const trash: TransactionEntity[] = [];
    const toPurge: number[] = [];

    for (const tx of sorted) {
      if (tx.deleted_at) {
        const deletedTime = new Date(tx.deleted_at).getTime();
        if (now.getTime() - deletedTime > fifteenDaysInMs) {
          if (tx.id) toPurge.push(tx.id);
        } else {
          trash.push(tx);
        }
      } else {
        active.push(tx);
      }
    }

    // Execute purge
    if (toPurge.length > 0) {
      const txSet = db.transaction('transactions', 'readwrite');
      for (const id of toPurge) {
        await txSet.store.delete(id);
      }
      await txSet.done;
    }
    
    // Calculate metrics for active only
    const inflow = active.reduce((acc, tx) => (tx.transaction_type === 'Inflow' || tx.category === 'Receita') ? acc + tx.total_amount : acc, 0);
    const outflow = active.reduce((acc, tx) => (tx.transaction_type === 'Outflow' && tx.category !== 'Receita') ? acc + tx.total_amount : acc, 0);
    
    set({ 
      transactions: active,
      trashTransactions: trash,
      isLoading: false,
      totalInflow: inflow,
      totalOutflow: outflow,
      balance: inflow - outflow
    });
  },

  addTransaction: async (tx: TransactionEntity): Promise<{ success: boolean, isDuplicate: boolean }> => {
    const db = await getDB();
    if (!db) return { success: false, isDuplicate: false };

    try {
      if (tx.receipt_hash) {
        const existing = await db.getFromIndex('transactions', 'by-hash', tx.receipt_hash);
        if (existing?.id) {
          // SUBSTIUIÇÃO DO MAIS ANTIGO: 
          // O 'put' com o ID existente sobrescreve os dados antigos com a nova extração
          await db.put('transactions', {
            ...existing,
            ...tx,
            id: existing.id,
            deleted_at: undefined, // Restaura se estava na lixeira
            is_synced: false // Força nova sincronização se houve mudança
          });
          get().fetchTransactions();
          return { success: true, isDuplicate: true };
        }
      }

      const id = await db.put('transactions', { ...tx, deleted_at: undefined });
      get().fetchTransactions();
      return { success: true, isDuplicate: false };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        get().fetchTransactions();
        return { success: true, isDuplicate: true };
      }
      return { success: false, isDuplicate: false };
    }
  },

  moveToTrash: async (id: number) => {
    const db = await getDB();
    if (!db) return;
    
    const tx = await db.get('transactions', id);
    if (tx) {
      const deletedAt = new Date().toISOString();
      
      // ECOSSISTEMA INTERLIGADO: Se tiver transaction_id, deleta todas as notas com esse mesmo ID
      if (tx.transaction_id) {
        const allTxs = await db.getAll('transactions');
        const linkedTxs = allTxs.filter(t => t.transaction_id === tx.transaction_id && t.id);
        
        const txSet = db.transaction('transactions', 'readwrite');
        for (const lTx of linkedTxs) {
          const lId = lTx.id as number;
          lTx.deleted_at = deletedAt;
          await txSet.store.put(lTx);
          // Sync com o backend
          try {
            await authenticatedFetch(getApiUrl(`/expenses/${lId}`), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ deleted_at: deletedAt })
            });
          } catch (e) {}
        }
        await txSet.done;
      } else {
        tx.deleted_at = deletedAt;
        await db.put('transactions', tx);
        try {
          await authenticatedFetch(getApiUrl(`/expenses/${id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleted_at: deletedAt })
          });
        } catch (e) {}
      }
      
      get().fetchTransactions();
    }
  },

  restoreFromTrash: async (id: number) => {
    const db = await getDB();
    if (!db) return;
    
    const tx = await db.get('transactions', id);
    if (tx) {
      // Sincronismo de ID na restauração também
      if (tx.transaction_id) {
        const allTxs = await db.getAll('transactions');
        const linkedTxs = allTxs.filter(t => t.transaction_id === tx.transaction_id && t.id);
          
        const txSet = db.transaction('transactions', 'readwrite');
        for (const lTx of linkedTxs) {
          const lId = lTx.id as number;
          lTx.deleted_at = undefined;
          await txSet.store.put(lTx);
          // Sync com o backend (limpar deleted_at)
          try {
            await authenticatedFetch(getApiUrl(`/expenses/${lId}`), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ deleted_at: null })
            });
          } catch (e) {}
        }
        await txSet.done;
      } else {
        tx.deleted_at = undefined;
        await db.put('transactions', tx);
        try {
          await authenticatedFetch(getApiUrl(`/expenses/${id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleted_at: null })
          });
        } catch (e) {}
      }
      get().fetchTransactions();
    }
  },

  permanentDelete: async (id: number) => {
    const db = await getDB();
    if (!db) return;
    
    const tx = await db.get('transactions', id);
    if (tx && tx.transaction_id) {
       const allTxs = await db.getAll('transactions');
       const linkedIds = allTxs
         .filter(t => t.transaction_id === tx.transaction_id && t.id)
         .map(t => t.id as number);

       for (const lId of linkedIds) {
          try { await authenticatedFetch(getApiUrl(`/expenses/${lId}`), { method: 'DELETE' }); } catch (e) {}
          await db.delete('transactions', lId);
       }
    } else {
       try { await authenticatedFetch(getApiUrl(`/expenses/${id}`), { method: 'DELETE' }); } catch (e) {}
       await db.delete('transactions', id);
    }
    
    get().fetchTransactions();
  },

  emptyTrash: async () => {
    // 1. Chama o endpoint otimizado no backend primeiro
    try {
      await authenticatedFetch(getApiUrl("/expenses/clear-all?only_trash=true"), {
        method: 'POST'
      });
    } catch (e) {
      console.error("Erro ao limpar lixeira no backend:", e);
    }

    // 2. Limpa o IndexedDB local
    const db = await getDB();
    if (!db) return;

    const txs = await db.getAll('transactions');
    const idsToDelete = txs
      .filter(tx => tx.deleted_at && tx.id)
      .map(tx => tx.id as number);

    if (idsToDelete.length > 0) {
      const txSet = db.transaction('transactions', 'readwrite');
      for (const id of idsToDelete) {
        await txSet.store.delete(id);
      }
      await txSet.done;
    }

    get().fetchTransactions();
  },

  clearAllData: async () => {
    try {
      await authenticatedFetch(getApiUrl("/expenses/clear-all"), { method: 'POST' });
    } catch (e) {}

    const db = await getDB();
    if (db) {
      await db.clear('transactions');
      get().fetchTransactions();
    }
  },

  syncWithBackend: async () => {
    try {
      const res = await authenticatedFetch(getApiUrl(`/expenses?t=${Date.now()}`), { cache: "no-store" });
      if (res.ok) {
        const remoteData = await res.json();
        const db = await getDB();
        if (db) {
          try {
            const txSet = db.transaction('transactions', 'readwrite');
            for (const item of remoteData) {
              const existing = await txSet.store.get(item.id);
              
              // Se o item já existe localmente e está na lixeira, mantém o estado local
              // a menos que o servidor também diga que está na lixeira (sincronismo).
              const merged: TransactionEntity = {
                id: item.id,
                total_amount: Number(item.amount) || 0,
                currency: 'BRL',
                transaction_date: item.date,
                transaction_type: item.transaction_type || 'Outflow',
                payment_method: item.payment_method || 'Comprovante',
                merchant_name: item.merchant || 'Desconhecido',
                category: item.category || 'Outros',
                receipt_hash: item.receipt || undefined,
                destination_institution: item.destination_institution || undefined,
                transaction_id: item.transaction_id || undefined,
                masked_cpf: item.masked_cpf || undefined,
                description: item.description || undefined,
                is_synced: true,
                note: item.note || undefined,
                deleted_at: item.deleted_at || existing?.deleted_at || undefined,
              };

              await txSet.store.put(merged);
            }
            await txSet.done;
            get().fetchTransactions();
          } catch (dbError) {
            console.error("Sync error:", dbError);
          }
        }
      }
    } catch (e) {
      console.warn("Offline: Synchronization deferred.");
    }
  },
  
  setPendingNote: (note: string) => set({ pendingNote: note })
}));
