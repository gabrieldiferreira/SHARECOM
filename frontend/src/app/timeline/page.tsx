"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Receipt, Coffee, ShoppingBag, Car, Home as HomeIcon, X, Plus, Search, ChevronLeft, ChevronRight, Calendar, ArrowDownLeft, ArrowUpRight, Edit2, Trash2, Filter, Loader2, } from "lucide-react";
import GlassFAB from "@/components/GlassFAB";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { useTransactionStore } from "../../store/useTransactionStore";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from '@/lib/firebase';
import { useToast } from "@/components/ui/Toast";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "Alimentação": <Coffee size={20} />,
  "Compras": <ShoppingBag size={20} />,
  "Transporte": <Car size={20} />,
  "Casa": <HomeIcon size={20} />,
  "Serviços": <HomeIcon size={20} />,
  "Lazer": <ShoppingBag size={20} />,
  "Receita": <Plus size={20} />,
  "Outros": <Receipt size={20} />,
};

const CATEGORY_COLORS: Record<string, string> = {
  "Alimentação": "#F59E0B",
  "Compras": "#EC4899",
  "Transporte": "#3B82F6",
  "Casa": "#8B5CF6",
  "Serviços": "#14B8A6",
  "Lazer": "#F97316",
  "Receita": "#10B981",
  "Outros": "#6B7280",
};

const FILTER_CHIPS = [
  { id: 'all', label: 'Todos' },
  { id: 'inflow', label: 'Entradas' },
  { id: 'outflow', label: 'Saídas' },
  { id: 'pix', label: 'PIX' },
  { id: 'card', label: 'Cartão' },
  { id: 'boleto', label: 'Boleto' },
  { id: 'high_value', label: '+$500' },
];

export default function TimelinePage() {
  const {
    transactions,
    fetchTransactions,
    moveToTrash,
  } = useTransactionStore();
  const { showToast } = useToast();

  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [editModalData, setEditModalData] = useState<any>(null);
  const itemsPerPage = 15;

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    setMounted(true);
    import("../../lib/auth").then(({ getFirebaseAuthHeader }) => {
      getFirebaseAuthHeader({ requireUser: true })
        .then(() => {
          setIsCheckingAuth(false);
          fetchTransactions();
        })
        .catch(() => {});
    });
  }, [fetchTransactions]);

  const handleRefresh = useCallback(async () => {
    await fetchTransactions();
  }, [fetchTransactions]);

  usePullToRefresh(handleRefresh);

  useEffect(() => {
    let startX: number | null = null;
    let activeId: string | null = null;
    let moved = false;

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const el = target.closest('[data-swipeable]') as HTMLElement | null;
      if (!el) return;
      const scrollTop = document.scrollingElement?.scrollTop || 0;
      if (scrollTop !== 0) return;
      activeId = el.getAttribute('data-id');
      startX = e.touches[0].clientX;
      moved = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!activeId || startX === null) return;
      const currentX = e.touches[0].clientX;
      const delta = currentX - startX;
      if (delta < -80) moved = true;
    };

    const onTouchEnd = () => {
      if (activeId && moved) {
        const id = activeId;
        if (id && window.confirm('Excluir transação?')) {
          moveToTrash(typeof id === 'string' ? parseInt(id) : id);
        }
      }
      activeId = null;
      startX = null;
      moved = false;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [moveToTrash]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('pt-BR', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
  };

  const formatGroupDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const dLocal = d.toLocaleDateString('sv-SE');
    const todayLocal = today.toLocaleDateString('sv-SE');
    const yesterdayLocal = yesterday.toLocaleDateString('sv-SE');

    if (dLocal === todayLocal) return "Hoje";
    if (dLocal === yesterdayLocal) return "Ontem";
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const merchant = tx.merchant_name || "Desconhecido";
      const matchesSearch = merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tx.note && tx.note.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (tx.destination_institution && tx.destination_institution.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (tx.category && tx.category.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesFilter = true;
      if (activeFilter === "inflow") matchesFilter = tx.transaction_type === "Inflow";
      else if (activeFilter === "outflow") matchesFilter = tx.transaction_type === "Outflow";
      else if (activeFilter === "pix") matchesFilter = (tx.payment_method || '').toLowerCase().includes('pix');
      else if (activeFilter === "card") matchesFilter = (tx.payment_method || '').toLowerCase().includes('card');
      else if (activeFilter === "boleto") matchesFilter = (tx.payment_method || '').toLowerCase().includes('boleto');
      else if (activeFilter === "high_value") matchesFilter = tx.total_amount > 500;

      return matchesSearch && matchesFilter;
    });
  }, [transactions, searchQuery, activeFilter]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const groupedTransactions = useMemo(() => {
    const groups: Record<string, typeof paginatedTransactions> = {};
    paginatedTransactions.forEach(tx => {
      const dateKey = new Date(tx.transaction_date).toLocaleDateString('sv-SE');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(tx);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [paginatedTransactions]);

  const summaryStats = useMemo(() => {
    const inflow = filteredTransactions.reduce((acc, tx) => tx.transaction_type === 'Inflow' ? acc + tx.total_amount : acc, 0);
    const outflow = filteredTransactions.reduce((acc, tx) => tx.transaction_type === 'Outflow' ? acc + tx.total_amount : acc, 0);
    return { inflow, outflow, count: filteredTransactions.length };
  }, [filteredTransactions]);

  const handleEditTx = (tx: any) => {
    setSelectedTx(tx);
    setEditModalData({
      merchant_name: tx.merchant_name,
      total_amount: tx.total_amount,
      note: tx.note || ''
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTx || !editModalData) return;
    
    try {
      const user = auth?.currentUser;
      if (!user) return;
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/transactions/${selectedTx.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          merchant_name: editModalData.merchant_name,
          amount_cents: Math.round(editModalData.total_amount * 100),
          description: editModalData.note
        })
      });
      
      if (res.ok) {
        setShowEditModal(false);
        setEditModalData(null);
        fetchTransactions();
        showToast('Alterações salvas com sucesso!', 'success');
      } else {
        showToast('Erro ao salvar alterações', 'error');
      }
    } catch (e) {
      console.error('Edit error:', e);
      showToast('Erro ao salvar alterações', 'error');
    }
  };

  const handleDeleteTx = async (txId: string | number | undefined) => {
    if (!txId) return;
    if (!window.confirm('Tem certeza que deseja excluir esta transação?')) return;
    
    try {
      const user = auth?.currentUser;
      if (!user) return;
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        moveToTrash(typeof txId === 'string' ? parseInt(txId) : txId);
        showToast('Transação excluída com sucesso!', 'success');
      } else {
        showToast('Erro ao excluir transação', 'error');
      }
    } catch (e) {
      console.error('Delete error:', e);
      showToast('Erro ao excluir transação', 'error');
    }
  };

  if (!mounted) {
    return (
      <div className="p-6 space-y-4">
        {[1,2,3].map(i => (
          <div key={i} className="h-20 rounded-2xl skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 space-y-5 font-sans" style={{ maxWidth: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Histórico</h1>
          <p className="text-xs text-white/50 mt-0.5">{summaryStats.count} transação(ões)</p>
        </div>
      </div>

      {/* Summary Cards - Glassmorphic */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl glass-card-static">
          <p className="text-[10px] text-white/50 mb-1">Entradas</p>
          <p className="text-sm font-bold" style={{ color: '#10B981' }}>
            R$ {summaryStats.inflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="p-3.5 rounded-2xl glass-card-static">
          <p className="text-[10px] text-white/50 mb-1">Saídas</p>
          <p className="text-sm font-bold" style={{ color: '#EF4444' }}>
            R$ {summaryStats.outflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div 
          className="p-3.5 rounded-2xl"
          style={{ 
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <p className="text-[10px] text-white/50 mb-1">Registros</p>
          <p className="text-sm font-bold" style={{ color: '#8B5CF6' }}>{summaryStats.count}</p>
        </div>
      </div>

      {/* Sticky Search Bar with Glass Background */}
      <div className="sticky top-0 z-30 -mx-4 px-4 -mt-2 pt-2" style={{ 
        background: 'linear-gradient(to bottom, #0D0D12 60%, transparent)',
        paddingBottom: '12px',
      }}>
        <div 
          className="flex flex-col md:flex-row gap-3 items-center p-3 rounded-2xl"
          style={{ 
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Pesquisar transação..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full py-2.5 pl-9 pr-3 text-sm bg-white/5 rounded-xl outline-none text-white placeholder-white/30 transition-all"
              style={{ border: '1px solid rgba(255, 255, 255, 0.08)' }}
            />
          </div>
        </div>

        {/* Filter Chips - Horizontal Scroll */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 pb-1 -mx-1 px-1">
          {FILTER_CHIPS.map(f => (
            <button
              key={f.id}
              onClick={() => { setActiveFilter(f.id); setCurrentPage(1); }}
              className="px-3.5 py-2 text-xs font-medium whitespace-nowrap rounded-full transition-all"
              style={{
                background: activeFilter === f.id 
                  ? 'linear-gradient(135deg, #8B5CF6, #EC4899)' 
                  : 'rgba(255, 255, 255, 0.05)',
                color: activeFilter === f.id ? 'white' : 'rgba(255, 255, 255, 0.5)',
                border: activeFilter === f.id ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State Illustration */}
      {groupedTransactions.length === 0 ? (
        <div 
          className="p-12 text-center rounded-2xl"
          style={{ 
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div 
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ 
              background: 'rgba(139, 92, 246, 0.1)',
              color: '#8B5CF6',
            }}
          >
            <Calendar size={32} />
          </div>
          <p className="text-base font-semibold mb-1.5 text-white">Nenhuma transação</p>
          <p className="text-xs text-white/40">
            {searchQuery || activeFilter !== 'all'
              ? 'Tente ajustar seus filtros.'
              : 'Suas transações aparecerão aqui.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedTransactions.map(([dateKey, txs]) => (
            <div key={dateKey}>
              {/* Date Group Header with fade effect */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <Calendar size={14} className="text-white/40" />
                <span className="text-xs font-medium capitalize text-white/60">
                  {formatGroupDate(txs[0].transaction_date)}
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Transactions with swipe actions */}
              <AnimatePresence>
                {txs.map((tx, idx) => (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="relative mb-2"
                  >
                    {/* Swipe actions revealed on left swipe */}
                    <motion.div
                      className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2 rounded-xl"
                      style={{ 
                        background: 'rgba(239, 68, 68, 0.9)',
                      }}
                    >
                      <button
                        onClick={() => handleEditTx(tx)}
                        className="p-2.5 rounded-lg bg-white/10"
                        title="Editar"
                      >
                        <Edit2 size={16} className="text-white" />
                      </button>
                      <button
                        onClick={() => handleDeleteTx(tx.id)}
                        className="p-2.5 rounded-lg bg-white/10"
                        title="Excluir"
                      >
                        <Trash2 size={16} className="text-white" />
                      </button>
                    </motion.div>

                    {/* Main transaction row */}
                    <motion.div
                      data-swipeable={true}
                      data-id={tx.id}
                      drag="x"
                      dragConstraints={{ left: -120, right: 0 }}
                      onDragEnd={(_, info) => {
                        if (info.offset.x < -80 && tx.id) {
                          if (window.confirm('Excluir transação?')) {
                            handleDeleteTx(tx.id);
                          }
                        }
                      }}
                      className="relative flex items-center gap-3 p-4 rounded-2xl cursor-pointer group"
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      {/* Merchant Logo 48px Circle */}
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${CATEGORY_COLORS[tx.category] || '#6B7280'}20`,
                          color: CATEGORY_COLORS[tx.category] || '#6B7280',
                        }}
                      >
                        {CATEGORY_ICONS[tx.category] || <Receipt size={24} />}
                      </div>

                      {/* Details - Name + Datetime stacked */}
                      <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                        <span className="text-sm font-medium truncate text-white">
                          {tx.merchant_name}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-white/50">{tx.category}</span>
                          <span className="text-white/30">•</span>
                          <span className="text-xs text-white/50">{tx.payment_method}</span>
                          <span className="text-white/30">•</span>
                          <span className="text-xs text-white/40">{formatDate(tx.transaction_date)}</span>
                        </div>
                        {tx.note && (
                          <p className="text-xs italic mt-1" style={{ color: '#8B5CF6', borderLeft: '2px solid #8B5CF6', paddingLeft: '6px' }}>
                            &ldquo;{tx.note}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Amount right - color-coded */}
                      <div className="shrink-0 text-right">
                        <p 
                          className="text-base font-bold tabular-nums" 
                          style={{ color: tx.transaction_type === 'Inflow' ? '#10B981' : '#EF4444' }}
                        >
                          {tx.transaction_type === 'Inflow' ? '+' : '-'}R$ {tx.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <span className="text-[10px] text-white/30">
                          {tx.transaction_type === 'Inflow' ? 'Entrada' : 'Saída'}
                        </span>
                      </div>
                    </motion.div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      {/* Infinite scroll / Load more */}
      {currentPage < totalPages && (
        <div className="flex justify-center py-4">
          <button
            onClick={() => setCurrentPage(p => p + 1)}
            disabled={isLoadingMore}
            className="px-6 py-2.5 rounded-xl text-xs font-medium"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.6)',
            }}
          >
            {isLoadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Carregar mais'}
          </button>
        </div>
      )}

      {/* FAB - Bottom Right */}
      <div className="fixed bottom-24 right-5 z-40">
        <GlassFAB 
          icon={<Plus size={22} />} 
          onClick={() => window.location.href = '/transactions/new'}
          gradient="purple-pink"
        />
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEditModal && editModalData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowEditModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(40px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Editar Transação</h3>
                <button onClick={() => setShowEditModal(false)} className="p-2 text-white/50 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs text-white/50 mb-2 block">Estabelecimento</label>
                  <input
                    type="text"
                    value={editModalData.merchant_name}
                    onChange={(e) => setEditModalData({...editModalData, merchant_name: e.target.value})}
                    className="w-full py-3 px-4 bg-white/5 rounded-xl outline-none text-white border border-white/10"
                  />
                </div>
                
                <div>
                  <label className="text-xs text-white/50 mb-2 block">Valor</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editModalData.total_amount}
                    onChange={(e) => setEditModalData({...editModalData, total_amount: parseFloat(e.target.value) || 0})}
                    className="w-full py-3 px-4 bg-white/5 rounded-xl outline-none text-white border border-white/10"
                  />
                </div>
                
                <div>
                  <label className="text-xs text-white/50 mb-2 block">Observação</label>
                  <textarea
                    value={editModalData.note}
                    onChange={(e) => setEditModalData({...editModalData, note: e.target.value})}
                    className="w-full py-3 px-4 bg-white/5 rounded-xl outline-none text-white border border-white/10 h-20 resize-none"
                    placeholder="Adicione uma nota..."
                  />
                </div>
              </div>
              
              <div className="p-6 border-t border-white/10 flex gap-3">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold"
                >
                  Salvar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
