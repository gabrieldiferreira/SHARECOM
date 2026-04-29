"use client";

import { useState, useEffect, useMemo, useCallback, type TouchEvent } from "react";
import { Receipt, Coffee, ShoppingBag, Car, Home as HomeIcon, X, Plus, Search, Calendar, ArrowDownLeft, ArrowUpRight, Loader2, Copy, Check, Building2, CreditCard, Hash, Fingerprint, FileText, Tag, Clock, AlertTriangle, CheckCircle2, CloudOff, Trash2, RotateCcw } from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { useTransactionStore } from "../../store/useTransactionStore";
import { TransactionEntity } from "../../lib/db";
import { motion, AnimatePresence } from "framer-motion";
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
  { id: 'high_value', label: '+R$500' },
];

const SWIPE_THRESHOLD = 80;
const SWIPE_MAX = 120;
const TRASH_RETENTION_DAYS = 30;

function daysUntilPermanentDelete(deletedAt?: string) {
  if (!deletedAt) return TRASH_RETENTION_DAYS;
  const deletedTime = new Date(deletedAt).getTime();
  if (!Number.isFinite(deletedTime)) return TRASH_RETENTION_DAYS;
  const elapsedDays = Math.floor((Date.now() - deletedTime) / (24 * 60 * 60 * 1000));
  return Math.max(TRASH_RETENTION_DAYS - elapsedDays, 0);
}

// ── Transaction Detail Bottom Sheet ──────────────────────────────────────────
function TransactionDetailModal({ tx, onClose }: { tx: TransactionEntity; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (value: string, key: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const isInflow = tx.transaction_type === 'Inflow';
  const amountColor = isInflow ? '#10B981' : '#EF4444';
  const categoryColor = CATEGORY_COLORS[tx.category] || '#6B7280';

  const formatFullDate = (dateStr: string) => {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).format(new Date(dateStr));
    } catch { return dateStr; }
  };

  const fields: { label: string; value: string | number | boolean | undefined | null; icon: React.ReactNode; copyable?: boolean; mono?: boolean }[] = [
    { label: 'Tipo', value: isInflow ? 'Entrada (Inflow)' : 'Saída (Outflow)', icon: isInflow ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} /> },
    { label: 'Categoria', value: tx.category, icon: <Tag size={15} /> },
    { label: 'Forma de Pagamento', value: tx.payment_method, icon: <CreditCard size={15} /> },
    { label: 'Instituição Destino', value: tx.destination_institution, icon: <Building2 size={15} /> },
    { label: 'Descrição', value: tx.description, icon: <FileText size={15} /> },
    { label: 'Observação', value: tx.note, icon: <FileText size={15} /> },
    { label: 'CPF/CNPJ Mascarado', value: tx.masked_cpf, icon: <Fingerprint size={15} />, mono: true },
    { label: 'ID da Transação', value: tx.transaction_id, icon: <Hash size={15} />, copyable: true, mono: true },
    { label: 'Data no Comprovante', value: formatFullDate(tx.transaction_date), icon: <Clock size={15} /> },
    { label: 'Data de Escaneamento', value: tx.scanned_at ? formatFullDate(tx.scanned_at) : 'N/A', icon: <Clock size={15} /> },
    { label: 'Moeda', value: tx.currency, icon: <Tag size={15} /> },
    { label: 'ID Interno', value: tx.id?.toString(), icon: <Hash size={15} />, mono: true },
    { label: 'Hash do Recibo (SHA-256)', value: tx.receipt_hash, icon: <Hash size={15} />, copyable: true, mono: true },
    { label: 'Sincronizado', value: tx.is_synced ? 'Sim ✓' : 'Não (pendente)', icon: tx.is_synced ? <CheckCircle2 size={15} /> : <CloudOff size={15} /> },
    { label: 'Revisão Manual', value: tx.needs_manual_review ? 'Necessária' : undefined, icon: <AlertTriangle size={15} /> },
  ];

  const visibleFields = fields.filter(f => f.value !== undefined && f.value !== null && String(f.value).trim() !== '');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col"
        style={{ background: '#0D0D12', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <h2 className="text-base font-semibold text-white">Detalhes do Comprovante</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <X size={16} className="text-white" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Amount Hero */}
          <div className="px-5 py-6 text-center border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: `${categoryColor}20`, color: categoryColor }}
            >
              {CATEGORY_ICONS[tx.category] || <Receipt size={24} />}
            </div>
            <p className="text-white/50 text-xs mb-1">{tx.merchant_name}</p>
            <p className="text-3xl font-bold tabular-nums" style={{ color: amountColor }}>
              {isInflow ? '+' : '-'}R$ {tx.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs mt-1" style={{ color: amountColor }}>
              {isInflow ? 'Entrada recebida' : 'Saída realizada'}
            </p>
          </div>

          {/* All Fields */}
          <div className="px-5 py-4 space-y-2.5">
            {visibleFields.map((field, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="mt-0.5 shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {field.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {field.label}
                  </p>
                  <p className={`text-sm text-white break-all leading-relaxed ${field.mono ? 'font-mono text-xs' : ''}`}>
                    {String(field.value)}
                  </p>
                </div>
                {field.copyable && field.value && (
                  <button
                    onClick={() => copyToClipboard(String(field.value), field.label)}
                    className="shrink-0 p-1.5 rounded-lg transition-all active:scale-90"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    {copied === field.label
                      ? <Check size={13} className="text-green-400" />
                      : <Copy size={13} style={{ color: 'rgba(255,255,255,0.4)' }} />
                    }
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="h-10" />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TransactionRow({
  tx,
  isTrash,
  formatDate,
  onOpen,
  onDelete,
  onRestore,
}: {
  tx: TransactionEntity;
  isTrash: boolean;
  formatDate: (dateStr: string) => string;
  onOpen: (tx: TransactionEntity) => void;
  onDelete: (tx: TransactionEntity) => void | Promise<void>;
  onRestore: (tx: TransactionEntity) => void | Promise<void>;
}) {
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number } | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const categoryColor = CATEGORY_COLORS[tx.category] || '#6B7280';
  const daysLeft = daysUntilPermanentDelete(tx.deleted_at);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (isTrash) return;
    const touch = event.touches[0];
    setSwipeStart({ x: touch.clientX, y: touch.clientY });
    setIsSwiping(true);
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!swipeStart || isTrash) return;
    const touch = event.touches[0];
    const deltaX = swipeStart.x - touch.clientX;
    const deltaY = Math.abs(swipeStart.y - touch.clientY);

    if (deltaX > 0 && deltaX > deltaY) {
      event.preventDefault();
      setSwipeX(Math.min(deltaX, SWIPE_MAX));
    } else if (deltaX < 0) {
      setSwipeX(0);
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    setSwipeStart(null);

    if (!isTrash && swipeX >= SWIPE_THRESHOLD) {
      setSwipeX(0);
      void onDelete(tx);
      return;
    }

    setSwipeX(0);
  };

  const handleOpen = () => {
    if (swipeX > 0) {
      setSwipeX(0);
      return;
    }
    onOpen(tx);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl mb-2 md:overflow-visible">
      {!isTrash && (
        <div
          className="absolute inset-0 flex items-center justify-end rounded-2xl bg-red-500 pr-6 md:hidden"
          style={{ opacity: Math.min(swipeX / SWIPE_THRESHOLD, 1) }}
        >
          <Trash2 className="text-white" size={24} />
        </div>
      )}

      <div
        onClick={handleOpen}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`relative z-10 group flex items-center gap-3 p-4 rounded-2xl cursor-pointer bg-bg-secondary border border-border hover:border-purple-500/40 active:scale-[0.98] ${
          isSwiping ? '' : 'transition-all'
        } ${isTrash ? 'opacity-70 hover:opacity-100' : ''}`}
        style={{ transform: `translateX(-${isTrash ? 0 : swipeX}px)` }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${categoryColor}20`, color: categoryColor }}
        >
          {CATEGORY_ICONS[tx.category] || <Receipt size={24} />}
        </div>

        <div className="flex flex-col overflow-hidden flex-1 min-w-0">
          <span className="text-sm font-medium truncate text-text-primary">{tx.merchant_name}</span>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-text-secondary">{tx.category}</span>
            <span className="text-text-tertiary text-xs">•</span>
            <span className="text-xs text-text-secondary">{tx.payment_method}</span>
            <span className="text-text-tertiary text-xs">•</span>
            <span className="text-xs text-text-tertiary">{formatDate(tx.scanned_at || tx.transaction_date)}</span>
          </div>
          {isTrash ? (
            <p className="text-xs mt-1 text-red-300 truncate">
              Excluído • remoção permanente em {daysLeft} dia{daysLeft === 1 ? '' : 's'}
            </p>
          ) : tx.description ? (
            <p className="text-xs mt-1 text-text-secondary truncate">{tx.description}</p>
          ) : tx.destination_institution ? (
            <p className="text-xs mt-1 text-text-tertiary truncate">Para: {tx.destination_institution}</p>
          ) : null}
          {!isTrash && tx.note && (
            <p className="text-xs italic mt-1 text-purple-400 border-l-2 border-purple-500 pl-1.5 truncate">&ldquo;{tx.note}&rdquo;</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className={`text-base font-bold tabular-nums ${tx.transaction_type === 'Inflow' ? 'text-green-500' : 'text-red-500'}`}>
            {tx.transaction_type === 'Inflow' ? '+' : '-'}R$ {tx.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-text-tertiary">{tx.transaction_type === 'Inflow' ? 'Entrada' : 'Saída'}</span>
        </div>

        {isTrash ? (
          <button
            onClick={(event) => {
              event.stopPropagation();
              void onRestore(tx);
            }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Restaurar</span>
          </button>
        ) : (
          <button
            onClick={(event) => {
              event.stopPropagation();
              void onDelete(tx);
            }}
            className="hidden md:flex shrink-0 opacity-30 hover:opacity-100 p-2 rounded-xl text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
            aria-label="Excluir comprovante"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function TimelinePage() {
  const { transactions, trashTransactions, fetchTransactions, moveToTrash, restoreFromTrash } = useTransactionStore();
  const { showToast, showToastWithUndo } = useToast();

  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<'active' | 'trash'>('active');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore] = useState(false);
  const [selectedTx, setSelectedTx] = useState<TransactionEntity | null>(null);
  const itemsPerPage = 15;

  useEffect(() => {
    setMounted(true);
    import("../../lib/auth").then(({ getFirebaseAuthHeader }) => {
      getFirebaseAuthHeader({ requireUser: true })
        .then(() => { fetchTransactions(); })
        .catch(() => {});
    });
  }, [fetchTransactions]);

  const handleRefresh = useCallback(async () => {
    await fetchTransactions();
  }, [fetchTransactions]);

  usePullToRefresh(handleRefresh);

  const handleSoftDelete = useCallback(async (tx: TransactionEntity) => {
    if (!tx.id) return;
    await moveToTrash(tx.id);
    showToastWithUndo('Comprovante deletado', async () => {
      if (!tx.id) return;
      await restoreFromTrash(tx.id);
      showToast('Comprovante restaurado', 'success');
    });
  }, [moveToTrash, restoreFromTrash, showToast, showToastWithUndo]);

  const handleRestore = useCallback(async (tx: TransactionEntity) => {
    if (!tx.id) return;
    await restoreFromTrash(tx.id);
    showToast('Comprovante restaurado', 'success');
  }, [restoreFromTrash, showToast]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('pt-BR', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
  };

  const formatGroupDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toLocaleDateString('sv-SE') === today.toLocaleDateString('sv-SE')) return "Hoje";
    if (d.toLocaleDateString('sv-SE') === yesterday.toLocaleDateString('sv-SE')) return "Ontem";
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  };

  const filteredTransactions = useMemo(() => {
    const source = activeTab === 'trash' ? trashTransactions : transactions;
    return source.filter(tx => {
      const merchant = tx.merchant_name || "Desconhecido";
      const matchesSearch =
        merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
  }, [transactions, trashTransactions, activeTab, searchQuery, activeFilter]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const groupedTransactions = useMemo(() => {
    const groups: Record<string, typeof paginatedTransactions> = {};
    paginatedTransactions.forEach(tx => {
      const key = new Date(tx.scanned_at || tx.transaction_date).toLocaleDateString('sv-SE');
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [paginatedTransactions]);

  const summaryStats = useMemo(() => {
    const inflow = filteredTransactions.reduce((acc, tx) => tx.transaction_type === 'Inflow' ? acc + tx.total_amount : acc, 0);
    const outflow = filteredTransactions.reduce((acc, tx) => tx.transaction_type === 'Outflow' ? acc + tx.total_amount : acc, 0);
    return { inflow, outflow, count: filteredTransactions.length };
  }, [filteredTransactions]);

  if (!mounted) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl skeleton" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 pt-1 md:pt-2 space-y-5 font-sans" style={{ maxWidth: '100%' }}>

      {/* Detail Bottom Sheet */}
      <AnimatePresence>
        {selectedTx && (
          <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Histórico</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            {activeTab === 'trash' ? `${trashTransactions.length} item(ns) na lixeira` : `${summaryStats.count} transação(ões)`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-bg-secondary border border-border p-1">
        {[
          { id: 'active' as const, label: 'Ativos', count: transactions.length },
          { id: 'trash' as const, label: 'Lixeira', count: trashTransactions.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setCurrentPage(1);
            }}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? tab.id === 'trash'
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-purple-500/15 text-purple-300'
                : 'text-text-secondary hover:bg-bg-tertiary'
            }`}
          >
            {tab.id === 'trash' ? <Trash2 size={14} /> : <Receipt size={14} />}
            {tab.label}
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px]">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl glass-card-static">
          <p className="text-[10px] text-text-tertiary mb-1">Entradas</p>
          <p className="text-sm font-bold text-green-500">R$ {summaryStats.inflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="p-3.5 rounded-2xl glass-card-static">
          <p className="text-[10px] text-text-tertiary mb-1">Saídas</p>
          <p className="text-sm font-bold text-red-500">R$ {summaryStats.outflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="p-3.5 rounded-2xl glass-card-static" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-[10px] text-white/50 mb-1">Registros</p>
          <p className="text-sm font-bold" style={{ color: '#8B5CF6' }}>{summaryStats.count}</p>
        </div>
      </div>

      {/* Sticky Search + Filters */}
      <div className="sticky top-0 z-30 -mx-4 px-4 -mt-2 pt-2" style={{ background: 'linear-gradient(to bottom, #0D0D12 60%, transparent)', paddingBottom: '12px' }}>
        <div className="flex items-center p-3 rounded-2xl bg-bg-secondary border border-border">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Pesquisar transação..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full py-2.5 pl-9 pr-3 text-sm bg-bg-tertiary rounded-xl outline-none text-text-primary placeholder-text-muted border border-border focus:border-accent-purple transition-all"
            />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 pb-1">
          {FILTER_CHIPS.map(f => (
            <button
              key={f.id}
              onClick={() => { setActiveFilter(f.id); setCurrentPage(1); }}
              className={`px-3.5 py-2 text-xs font-medium whitespace-nowrap rounded-full transition-all ${
                activeFilter === f.id
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                  : 'bg-bg-tertiary text-text-secondary border border-border'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {groupedTransactions.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-bg-secondary border border-border">
          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 ${activeTab === 'trash' ? 'bg-red-500/10' : 'bg-purple-500/10'}`}>
            {activeTab === 'trash'
              ? <Trash2 size={32} className="text-red-400" />
              : <Calendar size={32} className="text-purple-500" />
            }
          </div>
          <p className="text-base font-semibold mb-1.5 text-text-primary">
            {activeTab === 'trash' ? 'Lixeira vazia' : 'Nenhuma transação'}
          </p>
          <p className="text-xs text-text-tertiary">
            {activeTab === 'trash'
              ? 'Comprovantes excluídos ficam disponíveis por 30 dias.'
              : searchQuery || activeFilter !== 'all' ? 'Tente ajustar seus filtros.' : 'Suas transações aparecerão aqui.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedTransactions.map(([dateKey, txs]) => (
            <div key={dateKey}>
              {/* Date Group Header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <Calendar size={14} className="text-text-tertiary" />
                <span className="text-xs font-medium capitalize text-text-secondary">{formatGroupDate(txs[0].scanned_at || txs[0].transaction_date)}</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <AnimatePresence>
                {txs.map((tx, idx) => (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ delay: idx * 0.02, duration: 0.25 }}
                    className="mb-2"
                  >
                    <TransactionRow
                      tx={tx}
                      isTrash={activeTab === 'trash'}
                      formatDate={formatDate}
                      onOpen={setSelectedTx}
                      onDelete={handleSoftDelete}
                      onRestore={handleRestore}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {currentPage < totalPages && (
        <div className="flex justify-center py-4">
          <button
            onClick={() => setCurrentPage(p => p + 1)}
            disabled={isLoadingMore}
            className="px-6 py-2.5 rounded-xl text-xs font-medium bg-bg-secondary border border-border text-text-secondary hover:bg-bg-tertiary transition-colors disabled:opacity-50"
          >
            {isLoadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Carregar mais'}
          </button>
        </div>
      )}
    </div>
  );
}
