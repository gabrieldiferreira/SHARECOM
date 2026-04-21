"use client";

import { useState, useEffect, useMemo } from "react";
import { Receipt, Coffee, ShoppingBag, Car, Home as HomeIcon, X, Plus, Search, ChevronLeft, ChevronRight, Calendar, ArrowDownLeft, ArrowUpRight, } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import GlassFAB from "@/components/GlassFAB";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { useTransactionStore } from "../../store/useTransactionStore";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "Alimentação": <Coffee size={18} />,
  "Compras": <ShoppingBag size={18} />,
  "Transporte": <Car size={18} />,
  "Casa": <HomeIcon size={18} />,
  "Serviços": <HomeIcon size={18} />,
  "Lazer": <ShoppingBag size={18} />,
  "Receita": <Plus size={18} />,
  "Outros": <Receipt size={18} />,
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

export default function TimelinePage() {
  const {
    transactions,
    fetchTransactions,
    deleteTransaction,
  } = useTransactionStore();

  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    setMounted(true);
    
    // Proteção de Rota
    import("../../lib/auth").then(({ getFirebaseAuthHeader }) => {
      getFirebaseAuthHeader({ requireUser: true })
        .then(() => {
          setIsCheckingAuth(false);
          fetchTransactions();
        })
        .catch(() => {
          // O getFirebaseAuthHeader já redireciona para /login se falhar
        });
    });
  }, [fetchTransactions]);

  // Pull-to-refresh for mobile
  usePullToRefresh(fetchTransactions);

  // Swipe-to-delete handlers (touch)
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
          deleteTransaction(id);
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
  }, [deleteTransaction]);

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
      if (activeFilter === "outflow") matchesFilter = tx.transaction_type === "Outflow";
      if (activeFilter === "high_value") matchesFilter = tx.total_amount > 500;
      if (activeFilter === "with_notes") matchesFilter = !!tx.note;
      if (activeFilter === "today") {
        const todayLocal = new Date().toLocaleDateString('sv-SE');
        const txLocalDate = new Date(tx.transaction_date).toLocaleDateString('sv-SE');
        matchesFilter = txLocalDate === todayLocal;
      }

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
    const inflow = filteredTransactions.reduce((acc, tx) => (tx.transaction_type === 'Inflow' || tx.category === 'Receita') ? acc + tx.total_amount : acc, 0);
    const outflow = filteredTransactions.reduce((acc, tx) => (tx.transaction_type === 'Outflow' && tx.category !== 'Receita') ? acc + tx.total_amount : acc, 0);
    return { inflow, outflow, count: filteredTransactions.length };
  }, [filteredTransactions]);

  if (!mounted) {
    return <div className="p-8 animate-pulse text-center" style={{ color: 'var(--text-secondary)' }}>Carregando histórico...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 font-sans" style={{ maxWidth: '100%' }}>
      {/* Header */}
      <div className="mb-1">
        <h1 className="text-2xl font-medium" style={{ color: 'var(--text-primary)' }}>Histórico Completo</h1>
        <p className="text-label mt-1" style={{ color: 'var(--text-secondary)' }}>
          {summaryStats.count} transação(ões) encontrada(s)
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3" style={{ gap: '12px' }}>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <p className="text-label mb-1" style={{ color: 'var(--text-secondary)' }}>Entradas</p>
          <p className="valor-financeiro text-val-sm" style={{ color: '#10B981' }}>
            R$ {summaryStats.inflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <p className="text-label mb-1" style={{ color: 'var(--text-secondary)' }}>Saídas</p>
          <p className="valor-financeiro text-val-sm" style={{ color: '#EF4444' }}>
            R$ {summaryStats.outflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <p className="text-label mb-1" style={{ color: 'var(--text-secondary)' }}>Registros</p>
          <p className="valor-financeiro text-val-sm" style={{ color: '#3B82F6' }}>
            {summaryStats.count}
          </p>
        </div>
      </div>

      {/* Glassmorphic Sticky Header */}
      <div className="sticky top-0 z-30 w-full">
        <div className="glass-card-static flex flex-col md:flex-row gap-3 items-center justify-between p-3 rounded-2xl border border-white/10 shadow-lg backdrop-blur-2xl">
          <div className="relative w-full md:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Pesquisar por nome, nota, categoria ou banco..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="glass-input w-full py-2 pl-9 pr-3 text-sm focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto no-scrollbar">
            {[
              { id: 'all', label: 'Tudo' },
              { id: 'inflow', label: 'Entradas' },
              { id: 'outflow', label: 'Saídas' },
              { id: 'high_value', label: 'Altos Valores' },
              { id: 'today', label: 'Hoje' },
              { id: 'with_notes', label: 'Com Notas' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => { setActiveFilter(f.id); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-label whitespace-nowrap transition-all glass-input ${activeFilter === f.id ? 'bg-fuchsia-500 text-white' : 'bg-transparent text-[var(--text-secondary)]'}`}
                style={{ borderRadius: '6px' }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Transaction List Grouped by Date */}
      {groupedTransactions.length === 0 ? (
        <div className="p-12 text-center rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <div className="w-14 h-14 rounded-lg flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>
            <Calendar size={28} />
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Nenhuma transação encontrada</p>
          <p className="text-label" style={{ color: 'var(--text-tertiary)' }}>
            {searchQuery || activeFilter !== 'all'
              ? 'Tente ajustar seus filtros ou termo de busca.'
              : 'Suas transações aparecerão aqui após serem registradas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedTransactions.map(([dateKey, txs]) => (
            <div key={dateKey}>
              {/* Date Group Header */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <Calendar size={14} style={{ color: 'var(--text-tertiary)' }} />
                <span className="text-label font-medium capitalize" style={{ color: 'var(--text-secondary)' }}>
                  {formatGroupDate(txs[0].transaction_date)}
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--ds-border)' }} />
              </div>

              {/* Transactions */}
              <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)', borderRadius: '8px' }}>
                {txs.map((tx, idx) => (
                  <div
                    key={tx.id}
                    data-swipeable={true} data-id={tx.id} className="flex items-center gap-3 group cursor-default relative"
                    style={{
                      padding: '12px 16px',
                      borderBottom: idx < txs.length - 1 ? '0.5px solid var(--ds-border)' : 'none',
                    }}
                  >
                    {/* Category Icon */}
                    <div
  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
  style={{
    backgroundColor: `${CATEGORY_COLORS[tx.category] || '#6B7280'}15`,
    color: CATEGORY_COLORS[tx.category] || '#6B7280',
  }}
>
  {CATEGORY_ICONS[tx.category] || <Receipt size={24} />}
</div>

                    {/* Details */}
                    <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {tx.merchant_name}
                        </span>
                        {tx.receipt_hash && <Receipt size={10} style={{ color: '#3B82F6' }} />}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-label" style={{ color: 'var(--text-secondary)' }}>
                          {tx.category}
                        </span>
                        <span className="text-label" style={{ color: 'var(--text-tertiary)' }}>•</span>
                        <span className="text-label" style={{ color: 'var(--text-tertiary)' }}>
                          {tx.payment_method}
                        </span>
                        <span className="text-label" style={{ color: 'var(--text-tertiary)' }}>•</span>
                        <span className="text-label" style={{ color: 'var(--text-tertiary)' }}>
                          {formatDate(tx.transaction_date)}
                        </span>
                      </div>
                      {tx.destination_institution && (
                        <span className="text-label mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          → {tx.destination_institution}
                        </span>
                      )}
                      {tx.note && (
                        <p className="text-label italic mt-1" style={{ color: '#8B5CF6', borderLeft: '2px solid #8B5CF6', paddingLeft: '6px' }}>
                          &ldquo;{tx.note}&rdquo;
                        </p>
                      )}
                    </div>

                    {/* Amount & Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="valor-financeiro text-val-sm" style={{ color: tx.transaction_type === 'Inflow' ? '#10B981' : '#EF4444' }}>
                          {tx.transaction_type === 'Inflow' ? '+' : '-'}R$ {tx.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          {tx.transaction_type === 'Inflow' ? (
                            <ArrowDownLeft size={10} style={{ color: '#10B981' }} />
                          ) : (
                            <ArrowUpRight size={10} style={{ color: '#EF4444' }} />
                          )}
                          <span className="text-label" style={{ color: 'var(--text-tertiary)' }}>
                            {tx.transaction_type === 'Inflow' ? 'Entrada' : 'Saída'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => tx.id && deleteTransaction(tx.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                        style={{ color: '#EF4444' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2 pb-4">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 rounded-md disabled:opacity-30" style={{ border: '0.5px solid var(--ds-border)', color: 'var(--text-secondary)', borderRadius: '6px' }}>
            <ChevronLeft size={14} />
          </button>
          <div className="flex gap-1.5">
            {[...Array(Math.min(totalPages, 7))].map((_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (currentPage <= 4) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = currentPage - 3 + i;
              }
              return (
                <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className="w-7 h-7 flex items-center justify-center text-label font-medium transition-all" style={{ backgroundColor: currentPage === pageNum ? '#3B82F6' : 'transparent', color: currentPage === pageNum ? '#FFFFFF' : 'var(--text-secondary)', border: currentPage === pageNum ? 'none' : '0.5px solid var(--ds-border)', borderRadius: '6px' }}>
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 rounded-md disabled:opacity-30" style={{ border: '0.5px solid var(--ds-border)', color: 'var(--text-secondary)', borderRadius: '6px' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
    <GlassFAB icon={<Plus size={20} />} onClick={() => window.location.href = '/transactions/new'} />
  );
}
