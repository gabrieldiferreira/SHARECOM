import { create } from 'zustand';
import { TransactionEntity, getDB, TRANSACTION_CACHE_OWNER_KEY } from '../lib/db';
import { getApiUrl } from '../lib/api';
import { authenticatedFetch, getCurrentFirebaseUser } from '../lib/auth';

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
  resetLocalState: () => void;
  setPendingNote: (note: string) => void;
}

const emptyTransactionData = {
  transactions: [],
  trashTransactions: [],
  totalInflow: 0,
  totalOutflow: 0,
  balance: 0,
};

type TransactionDB = NonNullable<Awaited<ReturnType<typeof getDB>>>;

let loadedOwnerUid: string | null = null;

async function getCurrentOwnerUid() {
  const user = await getCurrentFirebaseUser();
  return user?.uid ?? null;
}

function getStoredOwnerUid() {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(TRANSACTION_CACHE_OWNER_KEY);
  } catch {
    return null;
  }
}

function setStoredOwnerUid(ownerUid: string) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(TRANSACTION_CACHE_OWNER_KEY, ownerUid);
  } catch {}
}

async function deleteLocalTransactionIds(db: TransactionDB, ids: number[]) {
  if (ids.length === 0) return;

  const txSet = db.transaction('transactions', 'readwrite');
  for (const id of ids) {
    await txSet.store.delete(id);
  }
  await txSet.done;
}

async function ensureOwnerCache(db: TransactionDB, ownerUid: string) {
  const storedOwnerUid = getStoredOwnerUid();
  if (storedOwnerUid && storedOwnerUid !== ownerUid) {
    await db.clear('transactions');
    setStoredOwnerUid(ownerUid);
    return;
  }

  setStoredOwnerUid(ownerUid);

  const allTransactions = await db.getAll('transactions');
  const staleIds = allTransactions
    .filter((tx) => tx.id !== undefined && tx.owner_uid !== ownerUid)
    .map((tx) => tx.id as number);

  await deleteLocalTransactionIds(db, staleIds);
}

async function getTransactionsForOwner(db: TransactionDB, ownerUid: string) {
  const txs = await db.getAllFromIndex('transactions', 'by-owner', ownerUid);

  return txs.sort((a, b) => {
    const dateA = new Date(a.transaction_date).getTime();
    const dateB = new Date(b.transaction_date).getTime();
    if (Number.isNaN(dateA) || Number.isNaN(dateB)) return 0;
    return dateB - dateA;
  });
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
    console.log('📦 fetchTransactions called');
    set({ isLoading: true });
    try {
      const ownerUid = await getCurrentOwnerUid();
      if (!ownerUid) {
        loadedOwnerUid = null;
        set({ ...emptyTransactionData, isLoading: false });
        return;
      }

      if (loadedOwnerUid !== ownerUid) {
        set({ ...emptyTransactionData, isLoading: true });
      }

      const db = await getDB();
      if (!db) {
        console.log('❌ No IndexedDB available');
        set({ isLoading: false });
        return;
      }

      await ensureOwnerCache(db, ownerUid);

      console.log('📊 Getting transactions from IndexedDB...');
      const txs = await getTransactionsForOwner(db, ownerUid);
      console.log(`📊 Found ${txs.length} transactions`);
      const sorted = txs;
      
      // Purge logic: Remove items older than 30 days in trash
      const now = new Date();
      const trashRetentionMs = 30 * 24 * 60 * 60 * 1000;
      
      const active: TransactionEntity[] = [];
      const trash: TransactionEntity[] = [];
      const toPurge: number[] = [];

      for (const tx of sorted) {
        if (tx.deleted_at) {
          const deletedTime = new Date(tx.deleted_at).getTime();
          if (now.getTime() - deletedTime > trashRetentionMs) {
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
      const inflow = active.reduce((acc, tx) => {
        const type = (tx.transaction_type || '').toLowerCase();
        const cat = (tx.category || '').toLowerCase();
        return (type === 'inflow' || cat === 'receita' || cat === 'income') ? acc + tx.total_amount : acc;
      }, 0);
      
      const outflow = active.reduce((acc, tx) => {
        const type = (tx.transaction_type || '').toLowerCase();
        const cat = (tx.category || '').toLowerCase();
        return (type === 'outflow' && cat !== 'receita' && cat !== 'income') ? acc + tx.total_amount : acc;
      }, 0);
      
      console.log('📊 Metrics calculated:', { active: active.length, trash: trash.length, inflow, outflow, balance: inflow - outflow });
      
      set({ 
        transactions: active,
        trashTransactions: trash,
        isLoading: false,
        totalInflow: inflow,
        totalOutflow: outflow,
        balance: inflow - outflow
      });
      loadedOwnerUid = ownerUid;
    } catch (error) {
      console.error("Failed to fetch local transactions:", error);
      set({ ...emptyTransactionData, isLoading: false });
      throw error;
    }
  },

  addTransaction: async (tx: TransactionEntity): Promise<{ success: boolean, isDuplicate: boolean }> => {
    const ownerUid = await getCurrentOwnerUid();
    if (!ownerUid) return { success: false, isDuplicate: false };

    const db = await getDB();
    if (!db) return { success: false, isDuplicate: false };

    try {
      await ensureOwnerCache(db, ownerUid);

      const txWithScanDate = { 
        ...tx, 
        owner_uid: ownerUid,
        scanned_at: tx.scanned_at || new Date().toISOString() 
      };

      if (txWithScanDate.receipt_hash) {
        const existing = await db.getFromIndex('transactions', 'by-owner-hash', [ownerUid, txWithScanDate.receipt_hash]);
        if (existing?.id) {
          // SUBSTIUIÇÃO DO MAIS ANTIGO: 
          // O 'put' com o ID existente sobrescreve os dados antigos com a nova extração
          await db.put('transactions', {
            ...existing,
            ...txWithScanDate,
            id: existing.id,
            owner_uid: ownerUid,
            scanned_at: existing.scanned_at || txWithScanDate.scanned_at, // Preserva a data de escaneamento original
            deleted_at: undefined, // Restaura se estava na lixeira
            is_synced: false // Força nova sincronização se houve mudança
          });
          get().fetchTransactions();
          return { success: true, isDuplicate: true };
        }
      }

      const id = await db.put('transactions', { ...txWithScanDate, deleted_at: undefined });
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
    const ownerUid = await getCurrentOwnerUid();
    if (!ownerUid) return;

    const db = await getDB();
    if (!db) return;

    await ensureOwnerCache(db, ownerUid);
    
    const tx = await db.get('transactions', id);
    if (tx && tx.owner_uid === ownerUid) {
      const deletedAt = new Date().toISOString();
      
      // ECOSSISTEMA INTERLIGADO: Se tiver transaction_id, deleta todas as notas com esse mesmo ID
      if (tx.transaction_id) {
        const allTxs = await getTransactionsForOwner(db, ownerUid);
        const linkedTxs = allTxs.filter(t => t.transaction_id === tx.transaction_id && t.id);
        
        const txSet = db.transaction('transactions', 'readwrite');
        for (const lTx of linkedTxs) {
          const lId = lTx.id as number;
          lTx.deleted_at = deletedAt;
          await txSet.store.put(lTx);
          // Sync com o backend
          try {
            await authenticatedFetch(getApiUrl(`/expenses/${lId}`), { method: 'DELETE' });
          } catch (e) {}
        }
        await txSet.done;
      } else {
        tx.deleted_at = deletedAt;
        await db.put('transactions', tx);
        try {
          await authenticatedFetch(getApiUrl(`/expenses/${id}`), { method: 'DELETE' });
        } catch (e) {}
      }
      
      get().fetchTransactions();
    }
  },

  restoreFromTrash: async (id: number) => {
    const ownerUid = await getCurrentOwnerUid();
    if (!ownerUid) return;

    const db = await getDB();
    if (!db) return;

    await ensureOwnerCache(db, ownerUid);
    
    const tx = await db.get('transactions', id);
    if (tx && tx.owner_uid === ownerUid) {
      // Sincronismo de ID na restauração também
      if (tx.transaction_id) {
        const allTxs = await getTransactionsForOwner(db, ownerUid);
        const linkedTxs = allTxs.filter(t => t.transaction_id === tx.transaction_id && t.id);
          
        const txSet = db.transaction('transactions', 'readwrite');
        for (const lTx of linkedTxs) {
          const lId = lTx.id as number;
          lTx.deleted_at = undefined;
          await txSet.store.put(lTx);
          // Sync com o backend (limpar deleted_at)
          try {
            await authenticatedFetch(getApiUrl(`/expenses/${lId}/restore`), { method: 'PATCH' });
          } catch (e) {}
        }
        await txSet.done;
      } else {
        tx.deleted_at = undefined;
        await db.put('transactions', tx);
        try {
          await authenticatedFetch(getApiUrl(`/expenses/${id}/restore`), { method: 'PATCH' });
        } catch (e) {}
      }
      get().fetchTransactions();
    }
  },

  permanentDelete: async (id: number) => {
    const ownerUid = await getCurrentOwnerUid();
    if (!ownerUid) return;

    const db = await getDB();
    if (!db) return;

    await ensureOwnerCache(db, ownerUid);
    
    const tx = await db.get('transactions', id);
    if (tx && tx.owner_uid === ownerUid && tx.transaction_id) {
       const allTxs = await getTransactionsForOwner(db, ownerUid);
       const linkedIds = allTxs
         .filter(t => t.transaction_id === tx.transaction_id && t.id)
         .map(t => t.id as number);

       for (const lId of linkedIds) {
          try { await authenticatedFetch(getApiUrl(`/expenses/${lId}?permanent=true`), { method: 'DELETE' }); } catch (e) {}
          await db.delete('transactions', lId);
       }
    } else if (tx && tx.owner_uid === ownerUid) {
       try { await authenticatedFetch(getApiUrl(`/expenses/${id}?permanent=true`), { method: 'DELETE' }); } catch (e) {}
       await db.delete('transactions', id);
    }
    
    get().fetchTransactions();
  },

  emptyTrash: async () => {
    const ownerUid = await getCurrentOwnerUid();
    if (!ownerUid) return;

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

    await ensureOwnerCache(db, ownerUid);

    const txs = await getTransactionsForOwner(db, ownerUid);
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
    const ownerUid = await getCurrentOwnerUid();
    if (!ownerUid) {
      loadedOwnerUid = null;
      set({ ...emptyTransactionData, isLoading: false });
      return;
    }

    try {
      await authenticatedFetch(getApiUrl("/expenses/clear-all"), { method: 'POST' });
    } catch (e) {}

    const db = await getDB();
    if (db) {
      await ensureOwnerCache(db, ownerUid);
      const txs = await getTransactionsForOwner(db, ownerUid);
      const idsToDelete = txs
        .filter(tx => tx.id !== undefined)
        .map(tx => tx.id as number);

      await deleteLocalTransactionIds(db, idsToDelete);
      get().fetchTransactions();
    }
  },

  syncWithBackend: async () => {
    console.log('🔄 syncWithBackend called');
    try {
      const ownerUid = await getCurrentOwnerUid();
      if (!ownerUid) {
        loadedOwnerUid = null;
        set({ ...emptyTransactionData, isLoading: false });
        return;
      }

      const res = await authenticatedFetch(getApiUrl(`/expenses?include_deleted=true&t=${Date.now()}`), { cache: "no-store" });
      console.log('🌐 Backend response status:', res.status);
      if (res.ok) {
        const remoteData = await res.json();
        console.log(`📥 Received ${remoteData.length} transactions from backend`);
        const currentUser = await getCurrentFirebaseUser(1000);
        if (currentUser?.uid !== ownerUid) {
          console.warn("⚠️ Sync descartado: usuário mudou durante a sincronização.");
          return;
        }

        const db = await getDB();
        if (db) {
          try {
            await ensureOwnerCache(db, ownerUid);

            const txSet = db.transaction('transactions', 'readwrite');
            const remoteIds = new Set<number>();

            for (const item of remoteData) {
              const remoteId = Number(item.id);
              if (Number.isFinite(remoteId)) {
                remoteIds.add(remoteId);
              }
            }

            const existingLocal = await txSet.store.index('by-owner').getAll(ownerUid);
            for (const localTx of existingLocal) {
              if (
                localTx.id !== undefined &&
                localTx.is_synced !== false &&
                !remoteIds.has(localTx.id)
              ) {
                await txSet.store.delete(localTx.id);
              }
            }

            for (const item of remoteData) {
              const remoteId = Number(item.id);
              if (!Number.isFinite(remoteId)) continue;

              const merged: TransactionEntity = {
                id: remoteId,
                owner_uid: ownerUid,
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
                deleted_at: item.deleted_at || undefined,
              };

              await txSet.store.delete(remoteId);
              await txSet.store.put(merged);
            }
            await txSet.done;
            console.log('✅ Sync complete - data merged into IndexedDB');
            get().fetchTransactions();
          } catch (dbError) {
            console.error("💥 Sync error:", dbError);
          }
        }
      }
    } catch (e) {
      console.warn("⚠️ Offline: Synchronization deferred.", e);
    }
  },
  
  resetLocalState: () => {
    loadedOwnerUid = null;
    set({ ...emptyTransactionData, isLoading: false });
  },

  setPendingNote: (note: string) => set({ pendingNote: note })
}));
