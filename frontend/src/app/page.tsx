"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { Receipt, Coffee, ShoppingBag, Car, Home as HomeIcon, X, BarChart3, Plus, Loader2, CheckCircle2, TrendingUp, TrendingDown, Landmark, Clock, Award, MessageSquare, Search, Filter, ChevronLeft, ChevronRight, FileText, Info, Trash2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTransactionStore } from "../store/useTransactionStore";
import { TransactionEntity } from "../lib/db";
import { getApiUrl } from "../lib/api";
import { authenticatedFetch } from "../lib/auth";
import { useDashboardAgent, TemplateSentinel } from "../components/DashboardAgent";

// Lazy load recharts — reduz o bundle inicial em ~200 KB
// Os gráficos só carregam após o conteúdo principal estar visível
const ChartPlaceholder = () => (
  <div className="h-full w-full flex items-center justify-center" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
    <Loader2 size={16} className="animate-spin mr-2" /> Carregando gráfico...
  </div>
);

const { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, CartesianGrid } = {
  BarChart: dynamic(() => import('recharts').then(m => ({ default: m.BarChart })), { ssr: false, loading: ChartPlaceholder }),
  Bar: dynamic(() => import('recharts').then(m => ({ default: m.Bar })), { ssr: false }),
  LineChart: dynamic(() => import('recharts').then(m => ({ default: m.LineChart })), { ssr: false }),
  Line: dynamic(() => import('recharts').then(m => ({ default: m.Line })), { ssr: false }),
  PieChart: dynamic(() => import('recharts').then(m => ({ default: m.PieChart })), { ssr: false }),
  Pie: dynamic(() => import('recharts').then(m => ({ default: m.Pie })), { ssr: false }),
  XAxis: dynamic(() => import('recharts').then(m => ({ default: m.XAxis })), { ssr: false }),
  YAxis: dynamic(() => import('recharts').then(m => ({ default: m.YAxis })), { ssr: false }),
  ResponsiveContainer: dynamic(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })), { ssr: false }),
  Cell: dynamic(() => import('recharts').then(m => ({ default: m.Cell })), { ssr: false }),
  Tooltip: dynamic(() => import('recharts').then(m => ({ default: m.Tooltip })), { ssr: false }),
  CartesianGrid: dynamic(() => import('recharts').then(m => ({ default: m.CartesianGrid })), { ssr: false }),
};

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

function ExpenseTracker() {
  const { 
    transactions, 
    trashTransactions,
    totalInflow, 
    totalOutflow, 
    balance,
    pendingNote,
    setPendingNote,
    fetchTransactions, 
    addTransaction, 
    moveToTrash,
    restoreFromTrash,
    permanentDelete,
    emptyTrash,
    clearAllData,
    syncWithBackend 
  } = useTransactionStore();

  const agent = useDashboardAgent(transactions);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "duplicate" | "error">("idle");
  const [showTrash, setShowTrash] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [uploadType, setUploadType] = useState<"Inflow" | "Outflow">("Outflow");
  const [showManualModal, setShowManualModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const [dashboardMode, setDashboardMode] = useState<"minimal" | "main" | "surgical" | "entities">("minimal");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); 
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedTxId, setExpandedTxId] = useState<string | number | null>(null);
  const itemsPerPage = 6;

  const [manualTx, setManualTx] = useState({
    merchant_name: "",
    total_amount: "",
    category: "Outros",
    transaction_type: "Outflow" as "Inflow" | "Outflow",
    payment_method: "Dinheiro",
    note: ""
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    fetchTransactions();
    syncWithBackend();
  }, [fetchTransactions, syncWithBackend]);


  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const merchant = tx.merchant_name || "Desconhecido";
      const matchesSearch = merchant.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (tx.note && tx.note.toLowerCase().includes(searchQuery.toLowerCase())) ||
                           (tx.destination_institution && tx.destination_institution.toLowerCase().includes(searchQuery.toLowerCase()));
      
      let matchesFilter = true;
      if (activeFilter === "inflow") matchesFilter = tx.transaction_type === "Inflow";
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

  const handleManualAdd = async () => {
     if (!manualTx.merchant_name || !manualTx.total_amount) return;
     const newTx: TransactionEntity = {
        total_amount: parseFloat(manualTx.total_amount),
        merchant_name: manualTx.merchant_name,
        category: manualTx.category,
        currency: 'BRL',
        transaction_date: new Date().toISOString(),
        transaction_type: manualTx.transaction_type,
        payment_method: manualTx.payment_method,
        is_synced: false,
        note: manualTx.note || undefined
     };
     await addTransaction(newTx);
     setShowManualModal(false);
     setManualTx({ merchant_name: "", total_amount: "", category: "Outros", transaction_type: "Outflow", payment_method: "Dinheiro", note: "" });
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadType("Outflow");
    setShowModal(true);
  };

  const executeUpload = async () => {
    if (!selectedFile) return;
    setShowModal(false);
    setIsUploading(true);
    const formData = new FormData();
    formData.append("received_file", selectedFile);
    if (pendingNote) formData.append("note", pendingNote);
    formData.append("transaction_type", uploadType);
    
    try {
      const response = await authenticatedFetch(getApiUrl("/receipts"), {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const ai = data.ai_data || {};
        
        if (ai.merchant_name && ai.merchant_name.includes("Check API Key")) {
           alert("O backend está rodando, mas a GEMINI_API_KEY está ausente ou inválida. Configure o .env");
           setIsUploading(false);
           return;
        }
        if (ai.merchant_name && ai.merchant_name.includes("Limite Gemini atingido")) {
          alert("Limite de uso da API Gemini atingido. Aguarde o reset da cota ou troque para um plano com mais capacidade.");
          setIsUploading(false);
          return;
        }

        const newTx: TransactionEntity = {
          id: data.database_id, // Use the official ID from the backend
          total_amount: ai.total_amount || 0,
          merchant_name: ai.merchant_name || 'Desconhecido',
          category: ai.smart_category || 'Outros',
          currency: 'BRL',
          transaction_date: ai.transaction_date || new Date().toISOString(),
          transaction_type: ai.transaction_type || 'Outflow',
          payment_method: ai.payment_method || 'Comprovante',
          description: ai.description || undefined,
          destination_institution: ai.destination_institution || undefined,
          transaction_id: ai.transaction_id || undefined,
          masked_cpf: ai.masked_cpf || undefined,
          needs_manual_review: false,
          receipt_hash: data.filename || undefined,
          is_synced: true, // It is already synced as it comes from the backend
          note: data.note || undefined
        };

        const result = await addTransaction(newTx);
        setUploadStatus(result.isDuplicate ? "duplicate" : "success");
        setTimeout(() => setUploadStatus("idle"), 3000);
      } else {
        if (response.status === 401) {
          alert("Sua sessão expirou. Faça login novamente para continuar.");
          return;
        }
        try {
          const errorText = await response.text();
          const errObj = JSON.parse(errorText);
          if (errObj.detail) { alert(`Falha: ${errObj.detail}`); return; }
        } catch (e) {}
        alert("Falha ao processar o recibo automaticamente.");
      }
    } catch (e) {
      console.error("Upload error:", e);
      if (e instanceof Error && e.message === "AUTH_REQUIRED") {
        alert("Você precisa estar autenticado para enviar recibos.");
      } else {
        alert("Erro ao conectar com o servidor. Verifique sua internet.");
      }
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
      setPendingNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('pt-BR', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
  };

  const formatCurrency = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const normalizeBusinessName = (value?: string) => {
    if (!value) return null;
    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : null;
  };

  const counterpartiesData = useMemo(() => {
    const map: Record<string, { name: string; count: number; total: number; lastDate: string; isLegal: boolean }> = {};
    
    const legalKeywords = ['LTDA', 'S/A', 'S.A.', 'ME', 'EPP', 'EIRELI', 'BANCO', 'ITAU', 'BRADESCO', 'NUBANK', 'INTER', 'CAIXA', 'SANTANDER', 'PAGSEGURO', 'MERCADO PAGO', 'SERVICOS', 'SOLUCOES', 'COMERCIO', 'INDUSTRIA'];
    
    transactions.forEach(tx => {
      const name = normalizeBusinessName(tx.merchant_name) || 'Desconhecido';
      
      // Heurística para detectar PJ: Palavras-chave ou nome muito curto/longo com termos corporativos
      const isLegal = legalKeywords.some(k => name.toUpperCase().includes(k)) || 
                      (tx.masked_cpf && tx.masked_cpf.length > 14); // CNPJ tem mais caracteres que CPF
      
      if (!map[name]) {
        map[name] = { name, count: 0, total: 0, lastDate: tx.transaction_date, isLegal };
      }
      map[name].count += 1;
      map[name].total += Number(tx.total_amount) || 0;
      if (new Date(tx.transaction_date).getTime() > new Date(map[name].lastDate).getTime()) {
        map[name].lastDate = tx.transaction_date;
      }
    });

    const all = Object.values(map).sort((a, b) => b.count - a.count);
    return {
      physical: all.filter(p => !p.isLegal).slice(0, 10),
      legal: all.filter(p => p.isLegal).slice(0, 10)
    };
  }, [transactions]);

  const topCounterparties = useMemo(() => {
     return [...counterpartiesData.physical, ...counterpartiesData.legal].sort((a,b) => b.count - a.count).slice(0, 5);
  }, [counterpartiesData]);

  const topBanks = useMemo(() => {
    const map: Record<string, { name: string; count: number; total: number }> = {};
    transactions.forEach(tx => {
      const bank = normalizeBusinessName(tx.destination_institution) || normalizeBusinessName(tx.payment_method);
      if (!bank) return;
      if (!map[bank]) {
        map[bank] = { name: bank, count: 0, total: 0 };
      }
      map[bank].count += 1;
      map[bank].total += Number(tx.total_amount) || 0;
    });
    return Object.values(map)
      .sort((a, b) => (b.count - a.count) || (b.total - a.total))
      .slice(0, 5);
  }, [transactions]);

  const mostRecentReceipt = useMemo(() => {
    if (transactions.length === 0) return null;
    return [...transactions].sort((a, b) => {
      const idDiff = (Number(b.id) || 0) - (Number(a.id) || 0);
      if (idDiff !== 0) return idDiff;
      return new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime();
    })[0];
  }, [transactions]);

  const recentReceipts = useMemo(() => {
    if (!mostRecentReceipt) return [];
    return [
      mostRecentReceipt,
      ...transactions.filter((tx) => tx.id !== mostRecentReceipt.id).slice(0, 4),
    ];
  }, [transactions, mostRecentReceipt]);

  const getReceiptFields = (tx: TransactionEntity) => {
    const fields = [
      { label: 'Estabelecimento', value: tx.merchant_name },
      { label: 'Categoria', value: tx.category },
      { label: 'Valor', value: formatCurrency(tx.total_amount) },
      { label: 'Data da transação', value: formatDate(tx.transaction_date) },
      { label: 'Tipo', value: tx.transaction_type === 'Inflow' ? 'Entrada' : 'Saída' },
      { label: 'Meio de pagamento', value: tx.payment_method },
      { label: 'Instituição / banco', value: tx.destination_institution },
      { label: 'ID da transação', value: tx.transaction_id },
      { label: 'CPF mascarado', value: tx.masked_cpf },
      { label: 'Descrição extraída', value: tx.description },
      { label: 'Nota', value: tx.note },
      { label: 'Hash do comprovante', value: tx.receipt_hash },
      { label: 'Sincronização', value: tx.is_synced ? 'Sincronizado' : 'Pendente local' },
      { label: 'Revisão manual', value: tx.needs_manual_review ? 'Necessária' : undefined },
    ];

    return fields.filter((field) => field.value !== undefined && field.value !== null && String(field.value).trim() !== '');
  };

  const categoriesData = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach(tx => {
        if(tx.transaction_type === 'Outflow' && tx.total_amount) {
            map[tx.category] = (map[tx.category] || 0) + (Number(tx.total_amount) || 0);
        }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value);
  }, [transactions]);

  const growthData = useMemo(() => {
     let current = 0;
     const sorted = [...transactions]
        .filter(tx => tx.transaction_date && !isNaN(new Date(tx.transaction_date).getTime()))
        .sort((a,b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
     const data = sorted.map(tx => {
         const val = Number(tx.total_amount) || 0;
         current += (tx.transaction_type === 'Inflow' ? val : -val);
         const date = new Date(tx.transaction_date);
         return { date: new Intl.DateTimeFormat('pt-BR', { month: 'short', day: 'numeric' }).format(date), capital: current };
     });
     if (data.length === 1) data.push({ date: 'Hoje', capital: data[0].capital });
     return data;
  }, [transactions]);

  const dailyInsights = useMemo(() => {
    const today = new Date().toLocaleDateString('sv-SE');
    const todayTxs = transactions.filter(tx => tx.transaction_date && new Date(tx.transaction_date).toLocaleDateString('sv-SE') === today);
    const todayInflow = todayTxs.reduce((acc, tx) => tx.transaction_type === "Inflow" ? acc + tx.total_amount : acc, 0);
    const todayOutflow = todayTxs.reduce((acc, tx) => tx.transaction_type === "Outflow" ? acc + tx.total_amount : acc, 0);
    const delta = todayInflow - todayOutflow;
    return {
      delta, absDelta: Math.abs(delta),
      message: delta > 0 ? "Você está mais rico do que ontem." : (delta < 0 ? "Houve redução de patrimônio hoje." : "Patrimônio estável hoje."),
      isPositive: delta >= 0
    };
  }, [transactions]);

  const weekdayIntensity = useMemo(() => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const intensity = [0, 0, 0, 0, 0, 0, 0];
    transactions.forEach(tx => {
      const date = new Date(tx.transaction_date);
      if (!isNaN(date.getTime())) intensity[date.getDay()] += tx.total_amount;
    });
    return days.map((day, i) => ({ day, val: intensity[i] }));
  }, [transactions]);

  const paymentMethodsData = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach(tx => {
      if (tx.transaction_type === 'Outflow') {
        const method = tx.payment_method || 'Outros';
        map[method] = (map[method] || 0) + tx.total_amount;
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [transactions]);

  const inflowCount = useMemo(() => transactions.filter(t => t.transaction_type === 'Inflow').length, [transactions]);
  const outflowCount = useMemo(() => transactions.filter(t => t.transaction_type === 'Outflow').length, [transactions]);
  const avgOutflow = outflowCount > 0 ? totalOutflow / outflowCount : 0;
  const avgInflow = inflowCount > 0 ? totalInflow / inflowCount : 0;

  const alerts = useMemo(() => {
    const list: {id:string; color:string; icon:React.ReactNode; title:string; message:string}[] = [];
    const transportTotal = transactions.filter(t => t.category === "Transporte").reduce((a, t) => a + t.total_amount, 0);
    if (transportTotal > 1500) {
      list.push({ id: 'transp', color: '#F59E0B', icon: <Award size={20} />, title: 'Gasto com Transporte elevado',
        message: `Você acumulou R$ ${transportTotal.toLocaleString('pt-BR')} em Transporte.` });
    }
    const reviewPending = transactions.filter(t => t.needs_manual_review);
    if (reviewPending.length > 0) {
      const amt = reviewPending.reduce((a, t) => a + t.total_amount, 0);
      list.push({ id: 'review', color: '#EF4444', icon: <FileText size={20} />, title: `${reviewPending.length} comprovante(s) aguardando revisão`,
        message: `Total de R$ ${amt.toLocaleString('pt-BR')} em registros que precisam de verificação manual.` });
    }
    return list;
  }, [transactions]);

  const CHART_COLORS = ['#8B5CF6', '#3B82F6', '#F59E0B', '#EC4899', '#14B8A6', '#6B7280'];

  const tooltipStyle = {
    backgroundColor: 'var(--bg-primary)',
    border: '0.5px solid var(--ds-border)',
    borderRadius: '8px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    padding: '12px',
  };

  const renderReceiptCard = (tx: TransactionEntity) => {
    const fields = getReceiptFields(tx);
    const isExpanded = expandedTxId === tx.id;

    return (
      <div key={tx.id} className="relative overflow-hidden rounded-xl">
        {/* Background Action (Red Trash) */}
        <div className="absolute inset-0 bg-red-600 flex items-center justify-end px-6">
           <Trash2 className="text-white animate-pulse" size={24} />
        </div>

        <motion.div 
          drag="x"
          dragConstraints={{ left: -100, right: 0 }}
          onDragEnd={(_, info) => {
            if (info.offset.x < -80 && tx.id) {
              moveToTrash(tx.id);
            }
          }}
          onClick={() => setExpandedTxId(isExpanded ? null : (tx.id || null))}
          className={`relative z-10 rounded-xl border-thin border-ds-border bg-ds-bg-secondary p-4 space-y-4 cursor-pointer transition-all hover:border-fn-balance/30 ${isExpanded ? 'ring-1 ring-fn-balance/20' : ''}`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-ds-bg-primary border-thin border-ds-border flex items-center justify-center text-ds-text-tertiary shrink-0">
                {CATEGORY_ICONS[tx.category] || <Receipt size={18} />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-ds-text-tertiary uppercase tracking-widest font-bold mb-0.5">Destinatário</p>
                <p className="text-[16px] font-semibold text-ds-text-primary break-words leading-tight">{tx.merchant_name || 'Desconhecido'}</p>
                <p className="text-[12px] text-ds-text-tertiary mt-0.5">{formatDate(tx.transaction_date)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between md:flex-col md:items-end gap-2">
              <p className={`text-[18px] font-bold tabular-nums ${tx.transaction_type === 'Inflow' ? 'text-fn-income' : 'text-fn-expense'}`}>
                {tx.transaction_type === 'Inflow' ? '+' : '-'}{formatCurrency(tx.total_amount)}
              </p>
              <div className="flex gap-2">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${tx.transaction_type === 'Inflow' ? 'bg-[#10B981] bg-opacity-10 text-fn-income' : 'bg-[#EF4444] bg-opacity-10 text-fn-expense'}`}>
                  {tx.transaction_type === 'Inflow' ? 'ENTRADA' : 'SAÍDA'}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-ds-bg-primary border-thin border-ds-border text-ds-text-secondary">
                  {tx.payment_method || 'PIX'}
                </span>
              </div>
            </div>
          </div>

          {isExpanded && (
            <div className="pt-4 border-t border-ds-border animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
                {fields.map((field) => (
                  <div key={`${tx.id}-${field.label}`} className="rounded-lg bg-ds-bg-primary border-thin border-ds-border p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ds-text-tertiary mb-1 font-bold">{field.label}</p>
                    <p className="text-[13px] text-ds-text-primary break-words font-medium">{field.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-[11px] text-ds-text-tertiary">
                <p className="italic">Arraste para a esquerda para apagar.</p>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    tx.id && moveToTrash(tx.id);
                  }} 
                  className="px-3 py-1.5 rounded-md bg-red-500/10 text-fn-expense font-bold hover:bg-red-500/20 transition-colors"
                >
                  MOVER PARA LIXEIRA
                </button>
              </div>
            </div>
          )}
          
          {!isExpanded && (
            <div className="flex justify-center pt-1">
               <div className="w-8 h-1 rounded-full bg-ds-border/50"></div>
            </div>
          )}
        </motion.div>
      </div>
    );
  };

  if (!mounted) {
    return <div className="p-8 animate-pulse text-center" style={{ color: 'var(--text-secondary)' }}>Iniciando...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 font-sans w-full max-w-full">
      
      {/* Loading Bar & Toast Notification */}
      <div className={`fixed top-0 left-0 w-full h-1 z-50 transition-opacity duration-300 ${(isUploading || uploadStatus !== "idle") ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className={`h-full transition-all ease-out ${uploadStatus === "duplicate" ? "bg-amber-500" : "bg-fn-income"}`} style={{ width: uploadStatus !== "idle" ? '100%' : (isUploading ? '90%' : '0%'), transitionDuration: isUploading ? '15s' : '0.5s' }}></div>
      </div>

      <AnimatePresence>
        {(uploadStatus === "success" || uploadStatus === "duplicate") && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-[500] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border-thin backdrop-blur-md ${uploadStatus === "duplicate" ? "bg-amber-500/90 border-amber-400 text-white" : "bg-emerald-600/90 border-emerald-500 text-white"}`}
          >
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
            <span className="text-[14px] font-bold tracking-tight">
              {uploadStatus === "duplicate" ? "Comprovante Duplicado: Registro Atualizado" : "Comprovante Processado com Sucesso"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DASHBOARD CONTENT SWITCHER - EXPOSTO APENAS SE HOUVER DADOS */}
      {transactions.length > 0 ? (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-2">
            <div>
                <h1 className="text-2xl font-medium text-ds-text-primary">Meus Comprovantes</h1>
                <p className="text-[12px] mt-1 text-ds-text-secondary">Inteligência Financeira Avançada</p>
            </div>
            <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowTrash(true)}
                  className="relative p-2 rounded-lg bg-ds-bg-secondary border-thin border-ds-border text-ds-text-secondary hover:text-fn-expense transition-colors"
                >
                  <Trash2 size={20} />
                  {trashTransactions.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-ds-bg-primary">
                      {trashTransactions.length}
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-2 bg-ds-bg-secondary p-1 rounded-lg border-thin border-ds-border">
                  <button onClick={() => setDashboardMode("minimal")} className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${dashboardMode === "minimal" ? "bg-ds-bg-primary text-ds-text-primary shadow-sm" : "text-ds-text-secondary"}`}>Minimalista</button>
                  <button onClick={() => setDashboardMode("main")} className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${dashboardMode === "main" ? "bg-ds-bg-primary text-ds-text-primary shadow-sm" : "text-ds-text-secondary"}`}>Principal</button>
                  <button onClick={() => setDashboardMode("surgical")} className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${dashboardMode === "surgical" ? "bg-ds-bg-primary text-ds-text-primary shadow-sm" : "text-ds-text-secondary"}`}>Cirúrgico</button>
                  <button onClick={() => setDashboardMode("entities")} className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${dashboardMode === "entities" ? "bg-ds-bg-primary text-ds-text-primary shadow-sm" : "text-ds-text-secondary"}`}>Pessoas</button>
                </div>
            </div>
          </div>

          {dashboardMode === "minimal" && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-12">
                <div className="text-center space-y-2">
                  <p className="text-[14px] font-medium text-ds-text-secondary uppercase tracking-widest">Saldo Atual</p>
                  <h1 className="text-[48px] md:text-[64px] font-medium tabular-nums tracking-tight text-fn-balance">
                      R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </h1>
                </div>

                <div className="flex items-center gap-8 text-center">
                  <div>
                      <p className="text-[12px] text-ds-text-secondary mb-1">Burn Rate Diário</p>
                      <div className="flex items-center justify-center gap-1.5">
                        <TrendingDown size={16} className="text-fn-income" />
                        <span className="text-[22px] font-medium tabular-nums text-ds-text-primary">R$ {(totalOutflow / Math.max(1, new Date().getDate())).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                      </div>
                  </div>
                  <div className="w-[1px] h-10 bg-ds-border"></div>
                  <div>
                      <p className="text-[12px] text-ds-text-secondary mb-1">Transações</p>
                      <div className="flex items-center justify-center gap-1.5">
                        <Award size={16} className="text-fn-balance" />
                        <span className="text-[22px] font-medium tabular-nums text-ds-text-primary">{transactions.length}</span>
                      </div>
                  </div>
                </div>

                <div className="w-full max-w-md mx-auto space-y-3">
                  <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[12px] font-medium text-ds-text-secondary uppercase tracking-wider">Comprovante Mais Recente</h3>
                      <button onClick={() => setShowManualModal(true)} className="text-[12px] text-fn-balance font-medium">Adicionar +</button>
                  </div>
                  {recentReceipts.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between p-4 bg-ds-bg-secondary border-thin border-ds-border rounded-xl">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-ds-bg-primary border-thin border-ds-border flex items-center justify-center text-ds-text-tertiary shrink-0">
                              <Landmark size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] text-ds-text-tertiary uppercase tracking-wider font-bold">Enviado para</p>
                              <p className="text-[14px] font-medium text-ds-text-primary truncate">{tx.merchant_name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[11px] text-ds-text-tertiary">{formatDate(tx.transaction_date)}</span>
                                  <span className="w-1 h-1 rounded-full bg-ds-border"></span>
                                  <span className="text-[11px] text-ds-text-tertiary truncate max-w-[120px]">
                                    {tx.destination_institution || tx.payment_method || 'Instituição não identificada'}
                                  </span>
                              </div>
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <p className={`text-[15px] font-semibold tabular-nums ${tx.transaction_type === 'Inflow' ? 'text-fn-income' : 'text-fn-expense'}`}>
                              {tx.transaction_type === 'Inflow' ? '+' : '-'}{formatCurrency(tx.total_amount)}
                            </p>
                            <p className="text-[10px] text-ds-text-tertiary uppercase tracking-wide">{tx.category}</p>
                        </div>
                      </div>
                  ))}
                </div>
            </div>
          )}

          {dashboardMode === "main" && (
            <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-ds-bg-secondary p-4 rounded-xl border-thin border-ds-border">
                      <p className="text-[11px] font-medium text-ds-text-tertiary uppercase tracking-wider mb-2">Entradas</p>
                      <p className="text-[22px] font-medium tabular-nums text-fn-income">R$ {totalInflow.toLocaleString('pt-BR', {maximumFractionDigits:0})}</p>
                      <p className="text-[11px] text-ds-text-tertiary mt-1">{inflowCount} transação(ões)</p>
                  </div>
                  <div className="bg-ds-bg-secondary p-4 rounded-xl border-thin border-ds-border">
                      <p className="text-[11px] font-medium text-ds-text-tertiary uppercase tracking-wider mb-2">Saídas</p>
                      <p className="text-[22px] font-medium tabular-nums text-fn-expense">R$ {totalOutflow.toLocaleString('pt-BR', {maximumFractionDigits:0})}</p>
                      <p className="text-[11px] text-ds-text-tertiary mt-1">{outflowCount} transação(ões)</p>
                  </div>
                  <div className="bg-ds-bg-secondary p-4 rounded-xl border-thin border-ds-border">
                      <p className="text-[11px] font-medium text-ds-text-tertiary uppercase tracking-wider mb-2">Saldo Líquido</p>
                      <p className={`text-[22px] font-medium tabular-nums ${balance >= 0 ? 'text-fn-income' : 'text-fn-expense'}`}>R$ {balance.toLocaleString('pt-BR', {maximumFractionDigits:0})}</p>
                      <p className="text-[11px] text-ds-text-tertiary mt-1">{dailyInsights.message}</p>
                  </div>
                  <div className="bg-ds-bg-secondary p-4 rounded-xl border-thin border-ds-border">
                      <p className="text-[11px] font-medium text-ds-text-tertiary uppercase tracking-wider mb-2">Ticket Médio Saída</p>
                      <p className="text-[22px] font-medium tabular-nums text-ds-text-primary">R$ {avgOutflow.toLocaleString('pt-BR', {maximumFractionDigits:0})}</p>
                      <p className="text-[11px] text-ds-text-tertiary mt-1">por comprovante</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                      <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                        <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-4 gap-3">
                            <div>
                              <p className="text-[12px] font-medium text-ds-text-secondary uppercase tracking-widest mb-1">Evolução Patrimonial</p>
                              <h2 className="text-[28px] md:text-[32px] font-medium tabular-nums text-ds-text-primary truncate">R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
                            </div>
                            <TemplateSentinel id="hasInsights" agent={agent}>
                              <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium self-start ${dailyInsights.isPositive ? 'bg-[#10B981] bg-opacity-10 text-fn-income' : 'bg-[#EF4444] bg-opacity-10 text-fn-expense'}`}>
                                  {dailyInsights.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                  {dailyInsights.isPositive ? '+' : '-'}R$ {dailyInsights.absDelta.toLocaleString('pt-BR', {maximumFractionDigits:0})} hoje
                              </div>
                            </TemplateSentinel>
                        </div>
                        <TemplateSentinel id="hasGrowth" agent={agent}>
                            <div className="h-[200px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={growthData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--ds-border)" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} dx={-10} />
                                    <Tooltip contentStyle={tooltipStyle} />
                                    <Line type="monotone" dataKey="capital" stroke="#3B82F6" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#3B82F6' }} />
                                  </LineChart>
                              </ResponsiveContainer>
                            </div>
                        </TemplateSentinel>
                      </div>

                      <TemplateSentinel id="hasCategories" agent={agent}>
                        <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                            <h2 className="text-[14px] font-medium text-ds-text-primary mb-4">Gastos por Categoria</h2>
                            <div className="space-y-3">
                              {categoriesData.slice(0, 6).map((cat, i) => {
                                  const pct = totalOutflow > 0 ? (cat.value / totalOutflow) * 100 : 0;
                                  return (
                                    <div key={cat.name}>
                                        <div className="flex items-center justify-between mb-1">
                                          <div className="flex items-center gap-2">
                                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                              <span className="text-[13px] font-medium text-ds-text-primary">{cat.name}</span>
                                          </div>
                                          <span className="text-[13px] tabular-nums font-medium text-ds-text-secondary">R$ {cat.value.toLocaleString('pt-BR', {maximumFractionDigits:0})} <span className="text-ds-text-tertiary">({pct.toFixed(0)}%)</span></span>
                                        </div>
                                        <div className="w-full h-2 rounded-full bg-ds-bg-tertiary overflow-hidden">
                                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                        </div>
                                    </div>
                                  );
                              })}
                            </div>
                        </div>
                      </TemplateSentinel>
                  </div>

                  <div className="space-y-6">
                      <TemplateSentinel id="hasCounterparties" agent={agent}>
                        <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                            <h2 className="text-[14px] font-medium text-ds-text-primary mb-4">Pessoas / empresas com mais recorrência</h2>
                            <div className="space-y-4">
                              {topCounterparties.map((party, i) => (
                                  <div key={party.name} className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-ds-bg-primary border-thin border-ds-border flex items-center justify-center text-[12px] font-bold text-ds-text-tertiary">{i+1}</div>
                                        <div className="min-w-0 max-w-[120px]">
                                          <p className="text-[12px] font-medium text-ds-text-primary truncate">{party.name}</p>
                                          <p className="text-[10px] text-ds-text-secondary truncate">Último movimento: {formatDate(party.lastDate)}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[14px] font-medium tabular-nums text-ds-text-primary">{party.count} comprovante(s)</p>
                                        <p className="text-[10px] text-ds-text-tertiary">{formatCurrency(party.total)} movimentados</p>
                                    </div>
                                  </div>
                              ))}
                            </div>
                        </div>
                      </TemplateSentinel>

                      <TemplateSentinel id="hasBanks" agent={agent}>
                        <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                            <div className="flex items-center justify-between mb-4">
                              <h2 className="text-[14px] font-medium text-ds-text-primary">Bancos / instituições mais usados</h2>
                              <Landmark size={16} className="text-ds-text-tertiary" />
                            </div>
                            <div className="space-y-3">
                              {topBanks.map((bank, i) => (
                                  <div key={bank.name} className="flex items-center justify-between py-2 border-b-thin border-ds-border last:border-b-0">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-ds-bg-primary border-thin border-ds-border flex items-center justify-center text-[12px] font-bold text-ds-text-tertiary">{i + 1}</div>
                                        <div className="min-w-0">
                                          <p className="text-[13px] font-medium text-ds-text-primary truncate">{bank.name}</p>
                                          <p className="text-[11px] text-ds-text-tertiary">{bank.count} uso(s)</p>
                                        </div>
                                    </div>
                                    <p className="text-[13px] font-medium tabular-nums shrink-0 ml-2 text-ds-text-primary">
                                        {formatCurrency(bank.total)}
                                    </p>
                                  </div>
                              ))}
                            </div>
                        </div>
                      </TemplateSentinel>

                      <TemplateSentinel id="hasRecent" agent={agent}>
                        <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                            <div className="flex items-center justify-between mb-4">
                              <h2 className="text-[14px] font-medium text-ds-text-primary">Comprovante Mais Recente</h2>
                              <span className="text-[11px] text-ds-text-tertiary">{transactions.length} total</span>
                            </div>
                            <div className="space-y-3">
                              {recentReceipts.map(tx => (
                                  <div key={tx.id} className="flex items-center justify-between py-2 border-b-thin border-ds-border last:border-b-0">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tx.transaction_type === 'Inflow' ? 'bg-[#10B981] bg-opacity-10 text-fn-income' : 'bg-[#EF4444] bg-opacity-10 text-fn-expense'}`}>
                                          {tx.transaction_type === 'Inflow' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-[13px] font-medium text-ds-text-primary truncate">{tx.merchant_name}</p>
                                          <div className="flex items-center gap-2">
                                              <p className="text-[11px] text-ds-text-tertiary">{formatDate(tx.transaction_date)}</p>
                                              <span className="w-1 h-0.5 bg-ds-border"></span>
                                              <p className="text-[11px] text-ds-text-tertiary truncate max-w-[100px]">{tx.destination_institution || tx.payment_method || 'N/A'}</p>
                                          </div>
                                        </div>
                                    </div>
                                    <p className={`text-[13px] font-medium tabular-nums shrink-0 ml-2 ${tx.transaction_type === 'Inflow' ? 'text-fn-income' : 'text-fn-expense'}`}>
                                        {tx.transaction_type === 'Inflow' ? '+' : '-'}R$ {tx.total_amount.toLocaleString('pt-BR', {minimumFractionDigits:2})}
                                    </p>
                                  </div>
                              ))}
                            </div>
                        </div>
                      </TemplateSentinel>
                  </div>
                </div>
            </div>
          )}

          {dashboardMode === "entities" && (
            <div className="space-y-12 animate-in fade-in duration-500">
                <div className="space-y-4">
                  <h2 className="text-[20px] font-medium text-ds-text-primary">Distribuição de Relacionamentos</h2>
                  <p className="text-[12px] text-ds-text-secondary">Análise visual da concentração de movimentações por natureza jurídica.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <TemplateSentinel id="hasCounterparties" agent={agent}>
                      <div className="bg-ds-bg-secondary p-6 rounded-2xl border-thin border-ds-border">
                        <h3 className="text-[14px] font-bold uppercase tracking-widest text-ds-text-primary mb-6">Volume por Natureza (R$)</h3>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                  <Pie
                                    data={[
                                        { name: 'Pessoas Físicas', value: counterpartiesData.physical.reduce((acc, p) => acc + p.total, 0) },
                                        { name: 'Empresas / Bancos', value: counterpartiesData.legal.reduce((acc, p) => acc + p.total, 0) }
                                    ]}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                  >
                                    <Cell fill="#3B82F6" />
                                    <Cell fill="#8B5CF6" />
                                  </Pie>
                                  <Tooltip contentStyle={tooltipStyle} />
                              </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-6 mt-4">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-[#3B82F6]"></div>
                              <span className="text-[12px] text-ds-text-secondary">Pessoas Físicas</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-[#8B5CF6]"></div>
                              <span className="text-[12px] text-ds-text-secondary">Empresas / Bancos</span>
                            </div>
                        </div>
                      </div>
                  </TemplateSentinel>

                  <TemplateSentinel id="hasPhysicalEntities" agent={agent}>
                      <div className="bg-ds-bg-secondary p-6 rounded-2xl border-thin border-ds-border">
                        <h3 className="text-[14px] font-bold uppercase tracking-widest text-ds-text-primary mb-6">Frequência: Top Pessoas Físicas</h3>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={counterpartiesData.physical.slice(0, 5)} layout="vertical" margin={{ left: 20, right: 30 }}>
                                  <XAxis type="number" hide />
                                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} width={80} />
                                  <Tooltip contentStyle={tooltipStyle} />
                                  <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={20} />
                              </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-[11px] text-ds-text-tertiary text-center mt-4 italic">Concentração por número de comprovantes enviados.</p>
                      </div>
                  </TemplateSentinel>

                  <TemplateSentinel id="hasLegalEntities" agent={agent}>
                      <div className="bg-ds-bg-secondary p-6 rounded-2xl border-thin border-ds-border lg:col-span-2">
                        <h3 className="text-[14px] font-bold uppercase tracking-widest text-ds-text-primary mb-6">Volume Financeiro por Empresa / Instituição</h3>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={counterpartiesData.legal.slice(0, 8)}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--ds-border)" />
                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                                  <Tooltip contentStyle={tooltipStyle} />
                                  <Bar dataKey="total" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                        </div>
                      </div>
                  </TemplateSentinel>
                </div>

                <TemplateSentinel id="hasCounterparties" agent={agent}>
                  <div className="pt-12 border-t border-ds-border">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-[20px] font-medium text-ds-text-primary">Relacionamentos Detalhados</h2>
                        <p className="text-[12px] text-ds-text-tertiary">Gerencie todas as notas vinculadas aos seus parceiros.</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {transactions.slice(0, 10).map(tx => renderReceiptCard(tx))}
                      </div>
                  </div>
                </TemplateSentinel>
            </div>
          )}

          {dashboardMode === "surgical" && (
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                      <div className="flex items-center gap-2 mb-4">
                        <Clock size={18} className="text-cat-4" />
                        <h2 className="text-[14px] font-medium text-ds-text-primary">Gastos por Dia da Semana</h2>
                      </div>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weekdayIntensity}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--ds-border)" />
                              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                              <Tooltip cursor={{fill: 'var(--bg-tertiary)'}} contentStyle={tooltipStyle} formatter={(val: number) => `R$ ${Number(val).toLocaleString('pt-BR')}`} />
                              <Bar dataKey="val" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                      </div>
                  </div>

                  <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                      <h2 className="text-[14px] font-medium text-ds-text-primary mb-4">Categorias de Saída</h2>
                      {categoriesData.length > 0 ? (
                        <>
                            <div className="h-[180px]">
                              <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie data={categoriesData.slice(0, 6)} innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
                                        {categoriesData.slice(0, 6).map((_, index) => (
                                          <Cell key={`c-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => `R$ ${Number(val).toLocaleString('pt-BR')}`} />
                                  </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 mt-3">
                              {categoriesData.slice(0, 6).map((c, i) => (
                                  <div key={c.name} className="flex items-center gap-1.5 text-[11px] text-ds-text-secondary">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor: CHART_COLORS[i % CHART_COLORS.length]}} />
                                    <span className="truncate">{c.name}</span>
                                  </div>
                              ))}
                            </div>
                        </>
                      ) : (
                        <p className="text-[12px] text-ds-text-tertiary text-center py-12">Sem dados de categorias.</p>
                      )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                      <h2 className="text-[14px] font-medium text-ds-text-primary mb-4">Meios de Pagamento</h2>
                      {paymentMethodsData.length > 0 ? (
                        <div className="space-y-3">
                            {paymentMethodsData.map((pm, i) => {
                              const pct = totalOutflow > 0 ? (pm.value / totalOutflow) * 100 : 0;
                              return (
                                  <div key={pm.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                        <span className="text-[13px] text-ds-text-primary">{pm.name}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[13px] tabular-nums font-medium text-ds-text-primary">R$ {pm.value.toLocaleString('pt-BR', {maximumFractionDigits:0})}</span>
                                        <span className="text-[11px] text-ds-text-tertiary ml-1.5">({pct.toFixed(0)}%)</span>
                                    </div>
                                  </div>
                              );
                            })}
                        </div>
                      ) : (
                        <p className="text-[12px] text-ds-text-tertiary text-center py-8">Nenhum dado de pagamento disponível.</p>
                      )}
                  </div>

                  <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                      <h2 className="text-[14px] font-medium text-ds-text-primary mb-4">Alertas Inteligentes</h2>
                      {alerts.length > 0 ? (
                        <div className="space-y-3">
                            {alerts.map(a => (
                              <div key={a.id} className="flex gap-3 p-3 rounded-lg" style={{backgroundColor: `${a.color}1A`, border: `0.5px solid ${a.color}`}}>
                                  <div style={{color: a.color}} className="shrink-0 mt-0.5">{a.icon}</div>
                                  <div>
                                    <p className="text-[13px] font-medium text-ds-text-primary">{a.title}</p>
                                    <p className="text-[11px] text-ds-text-secondary mt-0.5">{a.message}</p>
                                  </div>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <CheckCircle2 size={28} className="text-fn-income mb-2" />
                            <p className="text-[13px] font-medium text-ds-text-primary">Tudo certo!</p>
                            <p className="text-[11px] text-ds-text-tertiary mt-1">Nenhum alerta no momento.</p>
                        </div>
                      )}
                  </div>
                </div>

                <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                      <div>
                        <h2 className="text-[14px] font-medium text-ds-text-primary">Todos os Comprovantes</h2>
                        <p className="text-[11px] text-ds-text-tertiary mt-1">Cada comprovante mostra todos os campos que foram extraídos e armazenados.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ds-bg-primary border-thin border-ds-border">
                            <Search size={14} className="text-ds-text-tertiary" />
                            <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} placeholder="Buscar..." className="text-[12px] bg-transparent focus:outline-none w-32 text-ds-text-primary" />
                        </div>
                        <select value={activeFilter} onChange={e => { setActiveFilter(e.target.value); setCurrentPage(1); }} className="text-[12px] px-2.5 py-1.5 rounded-lg bg-ds-bg-primary border-thin border-ds-border text-ds-text-primary focus:outline-none">
                            <option value="all">Todos</option>
                            <option value="inflow">Entradas</option>
                            <option value="high_value">Alto valor (&gt;500)</option>
                            <option value="with_notes">Com notas</option>
                            <option value="today">Hoje</option>
                        </select>
                      </div>
                  </div>
                  <div className="space-y-4">
                      {paginatedTransactions.length > 0 ? paginatedTransactions.map(renderReceiptCard) : (
                        <div className="py-8 text-center text-[12px] text-ds-text-tertiary">Nenhum registro encontrado.</div>
                      )}
                  </div>
                  {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-3 border-t-thin border-ds-border">
                        <p className="text-[11px] text-ds-text-tertiary">{filteredTransactions.length} registro(s) • Página {currentPage} de {totalPages}</p>
                        <div className="flex items-center gap-1">
                            <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 rounded-md border-thin border-ds-border text-ds-text-tertiary disabled:opacity-30"><ChevronLeft size={14} /></button>
                            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 rounded-md border-thin border-ds-border text-ds-text-tertiary disabled:opacity-30"><ChevronRight size={14} /></button>
                        </div>
                      </div>
                  )}
                </div>
            </div>
          )}
        </>
      ) : (
        /* EMPTY STATE - "CLEAN SLATE" */
        <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8 animate-in fade-in zoom-in-95 duration-700">
           <div className="relative">
              <div className="w-32 h-32 rounded-full bg-ds-bg-secondary border-thin border-ds-border flex items-center justify-center text-ds-text-tertiary/20">
                 <FileText size={64} />
              </div>
              <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-fn-balance flex items-center justify-center text-white shadow-lg border-4 border-ds-bg-primary animate-bounce">
                 <Plus size={24} />
              </div>
           </div>
           
           <div className="text-center max-w-sm space-y-3">
              <h2 className="text-[24px] font-bold text-ds-text-primary">Inicie sua Gestão</h2>
              <p className="text-[14px] text-ds-text-secondary leading-relaxed">
                 O ecossistema SHARECOM está pronto. Envie seu primeiro comprovante para ativar os dashboards de inteligência.
              </p>
           </div>

           <div className="flex flex-col items-center gap-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-8 py-4 bg-fn-balance text-white rounded-2xl font-bold shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
              >
                <Plus size={20} />
                ENVIAR PRIMEIRO COMPROVANTE
              </button>
              <button 
                onClick={() => setShowManualModal(true)}
                className="text-[14px] font-medium text-ds-text-tertiary hover:text-ds-text-primary transition-colors"
              >
                Ou registre manualmente
              </button>
           </div>

           {/* Lixeira acessível mesmo vazia para transparência */}
           {trashTransactions.length > 0 && (
             <button 
               onClick={() => setShowTrash(true)}
               className="mt-12 flex items-center gap-2 text-[12px] text-ds-text-tertiary hover:text-fn-expense transition-colors"
             >
               <Trash2 size={14} />
               Ver {trashTransactions.length} itens na lixeira
             </button>
           )}
        </div>
      )}

      {/* TRASH MODAL */}
      <AnimatePresence>
        {showTrash && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-ds-bg-primary border-thin border-ds-border rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-ds-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                    <Trash2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold text-ds-text-primary">Lixeira</h3>
                    <p className="text-[11px] text-ds-text-tertiary">Itens serão apagados após 15 dias.</p>
                  </div>
                </div>
                <button onClick={() => setShowTrash(false)} className="p-2 text-ds-text-tertiary hover:text-ds-text-primary">
                  <X size={20} />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
                {trashTransactions.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <div className="w-12 h-12 bg-ds-bg-secondary rounded-full flex items-center justify-center mx-auto opacity-20">
                      <Trash2 size={24} />
                    </div>
                    <p className="text-[13px] text-ds-text-tertiary">Lixeira vazia.</p>
                  </div>
                ) : (
                  trashTransactions.map(tx => (
                    <div key={tx.id} className="p-4 rounded-xl bg-ds-bg-secondary border-thin border-ds-border flex items-center justify-between group">
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-ds-text-primary truncate">{tx.merchant_name}</p>
                        <p className="text-[11px] text-ds-text-tertiary">R$ {tx.total_amount.toLocaleString('pt-BR')} • Excluído em {formatDate(tx.deleted_at || "")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => tx.id && restoreFromTrash(tx.id)}
                          className="p-2 rounded-lg hover:bg-emerald-500/10 text-emerald-500 transition-colors"
                          title="Restaurar"
                        >
                          <RotateCcw size={18} />
                        </button>
                        <button 
                          onClick={() => tx.id && permanentDelete(tx.id)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                          title="Excluir Permanentemente"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {trashTransactions.length > 0 && (
                <div className="p-4 bg-ds-bg-secondary/50 border-t border-ds-border flex justify-between items-center">
                  <p className="text-[11px] text-ds-text-tertiary">{trashTransactions.length} item(ns) na lixeira</p>
                  <button 
                    onClick={() => {
                      if(window.confirm("Deseja esvaziar a lixeira permanentemente?")) emptyTrash();
                    }}
                    className="text-[12px] font-bold text-red-500 hover:underline"
                  >
                    ESVAZIAR LIXEIRA
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ExpenseTracker;
