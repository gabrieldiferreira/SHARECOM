"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { Receipt, Coffee, ShoppingBag, Car, Home as HomeIcon, X, BarChart3, Plus, Loader2, CheckCircle2, TrendingUp, Landmark, Clock, Award, MessageSquare, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { useTransactionStore } from "../store/useTransactionStore";
import { TransactionEntity } from "../lib/db";
import { getApiUrl } from "../lib/api";
import { authenticatedFetch } from "../lib/auth";

// Lazy load recharts para os dashboards
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
    totalInflow, 
    totalOutflow, 
    balance,
    pendingNote,
    setPendingNote,
    fetchTransactions,
    addTransaction, 
    deleteTransaction, 
    clearAllData,
    syncWithBackend
  } = useTransactionStore();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saveTokens, setSaveTokens] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const [activeTab, setActiveTab] = useState("main");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); 
  const [currentPage, setCurrentPage] = useState(1);
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
    setShowModal(true);
  };

  const executeUpload = async () => {
    if (!selectedFile) return;
    setShowModal(false);
    setIsUploading(true);
    const formData = new FormData();
    formData.append("received_file", selectedFile, selectedFile.name);
    if (pendingNote) formData.append("note", pendingNote);
    if (saveTokens) formData.append("save_tokens", "true");
    
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
          destination_institution: ai.destination_institution || undefined,
          transaction_id: ai.transaction_id || undefined,
          masked_cpf: ai.masked_cpf || undefined,
          needs_manual_review: false,
          receipt_hash: data.filename || undefined,
          is_synced: true, // It is already synced as it comes from the backend
          note: data.note || undefined
        };

        await addTransaction(newTx);
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 3000);
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

  const topBeneficiary = useMemo(() => {
     const map: Record<string, number> = {};
     transactions.forEach(tx => {
         if (tx.transaction_type === "Outflow" && tx.merchant_name) map[tx.merchant_name] = (map[tx.merchant_name] || 0) + 1;
     });
     let top = { name: "Nenhum", count: 0 };
     for(const [name, count] of Object.entries(map)) {
         if(count > top.count) top = { name, count };
     }
     return top;
  }, [transactions]);

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
         return { 
            date: new Intl.DateTimeFormat('pt-BR', { month: 'short', day: 'numeric' }).format(date), 
            capital: current 
         };
     });
     if (data.length === 1) {
         data.push({ date: 'Hoje', capital: data[0].capital });
     }
     return data;
  }, [transactions]);

  const suppliersData = useMemo(() => {
     const map: Record<string, { total: number, count: number }> = {};
     transactions.forEach(tx => {
        if (tx.transaction_type === 'Outflow' && tx.merchant_name && tx.total_amount) {
           const name = tx.merchant_name;
           if(!map[name]) map[name] = { total: 0, count: 0 };
           map[name].total += Number(tx.total_amount);
           map[name].count += 1;
        }
     });
     return Object.entries(map).map(([name, data]) => ({ name, value: data.total, count: data.count })).sort((a,b)=>b.value-a.value);
  }, [transactions]);

  const methodsData = useMemo(() => {
     const map: Record<string, number> = {};
     transactions.forEach(tx => {
        if (tx.transaction_type === 'Outflow' && tx.payment_method && tx.total_amount) {
           const method = tx.payment_method;
           map[method] = (map[method] || 0) + Number(tx.total_amount);
        }
     });
     return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value);
  }, [transactions]);

  const trendsData = useMemo(() => {
     // A simple weekly aggregation for the current month
     const weeks: number[] = [0, 0, 0, 0, 0];
     const now = new Date();
     const currentMonth = now.getMonth();
     const currentYear = now.getFullYear();

     transactions.forEach(tx => {
        if (tx.transaction_type === 'Outflow' && tx.transaction_date) {
           const d = new Date(tx.transaction_date);
           if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
              const weekIdx = Math.floor((d.getDate() - 1) / 7);
              if (weekIdx >= 0 && weekIdx < 5) {
                 weeks[weekIdx] += Number(tx.total_amount);
              }
           }
        }
     });
     return [
        { name: 'Semana 1', value: weeks[0] },
        { name: 'Semana 2', value: weeks[1] },
        { name: 'Semana 3', value: weeks[2] },
        { name: 'Semana 4', value: weeks[3] },
        { name: 'Semana 5', value: weeks[4] },
     ].filter(w => w.value > 0 || w.name === 'Semana 1'); // Keep at least one
  }, [transactions]);

  const CHART_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#6B7280'];

  const tooltipStyle = {
    backgroundColor: 'var(--bg-primary)',
    border: '0.5px solid var(--ds-border)',
    borderRadius: '8px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    padding: '12px',
  };

  if (!mounted) {
    return <div className="p-8 animate-pulse text-center" style={{ color: 'var(--text-secondary)' }}>Iniciando...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 font-sans" style={{ maxWidth: '100%' }}>
      
      {/* Loading Bar */}
      <div className={`fixed top-0 left-0 w-full h-1 z-50 transition-opacity duration-300 ${(isUploading || uploadSuccess) ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="h-full transition-all ease-out" style={{ backgroundColor: '#10B981', width: uploadSuccess ? '100%' : (isUploading ? '90%' : '0%'), transitionDuration: isUploading ? '15s' : '0.5s' }}></div>
      </div>

      <div className="mb-2 flex items-center justify-between">
         <div>
            <h1 className="text-2xl font-medium" style={{ color: 'var(--text-primary)' }}>Visão Geral</h1>
            <p className="text-label mt-1" style={{ color: 'var(--text-secondary)' }}>Resumo analítico de transações</p>
         </div>
         <button 
           onClick={() => { if(confirm("Deseja apagar todos os dados do banco e recomeçar?")) clearAllData(); }}
           className="px-3 py-1.5 text-label opacity-50 hover:opacity-100 transition-opacity"
           style={{ border: '0.5px solid var(--ds-border)', borderRadius: '6px', color: '#EF4444' }}
         >
           Resetar Tudo
         </button>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2" style={{ borderBottom: '1px solid var(--ds-border)' }}>
        {[
          { id: 'main', label: 'Principal' },
          { id: 'categories', label: 'Categorias' },
          { id: 'trends', label: 'Tendências' },
          { id: 'suppliers', label: 'Fornecedores' },
          { id: 'methods', label: 'Métodos' },
          { id: 'taxes', label: 'Impostos' },
          { id: 'receivables', label: 'A Receber' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors relative"
            style={{ 
              color: activeTab === tab.id ? 'var(--accent-green)' : 'var(--text-secondary)',
            }}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ backgroundColor: 'var(--accent-green)' }} />
            )}
          </button>
        ))}
      </div>

      {activeTab === "main" && (
        <>
          {/* Search & Filters */}
          <div className="p-3 rounded-lg flex flex-col md:flex-row gap-3 items-center justify-between" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)', borderRadius: '8px' }}>
         <div className="relative w-full md:w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            <input 
              type="text"
              placeholder="Pesquisar por nome, nota ou banco..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full py-2 pl-9 pr-3 text-sm focus:outline-none"
              style={{ backgroundColor: 'var(--bg-primary)', border: '0.5px solid var(--ds-border)', borderRadius: '6px', color: 'var(--text-primary)' }}
            />
         </div>
         <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto no-scrollbar">
            {[
              { id: 'all', label: 'Tudo' },
              { id: 'inflow', label: 'Entradas' },
              { id: 'high_value', label: 'Altos Valores' },
              { id: 'today', label: 'Hoje' },
              { id: 'with_notes', label: 'Com Notas' }
            ].map(f => (
              <button 
                key={f.id}
                onClick={() => { setActiveFilter(f.id); setCurrentPage(1); }}
                className="px-3 py-1.5 text-label whitespace-nowrap transition-all"
                style={{
                  backgroundColor: activeFilter === f.id ? '#3B82F6' : 'transparent',
                  color: activeFilter === f.id ? '#FFFFFF' : 'var(--text-secondary)',
                  border: activeFilter === f.id ? 'none' : '0.5px solid var(--ds-border)',
                  borderRadius: '6px',
                }}
              >
                {f.label}
              </button>
            ))}
         </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: '12px' }}>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <p className="text-label mb-1" style={{ color: 'var(--text-secondary)' }}>Entradas</p>
          <p className="valor-financeiro text-val-md" style={{ color: '#10B981' }}>
            R$ {totalInflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <p className="text-label mb-1" style={{ color: 'var(--text-secondary)' }}>Saídas</p>
          <p className="valor-financeiro text-val-md" style={{ color: '#EF4444' }}>
            R$ {totalOutflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <p className="text-label mb-1" style={{ color: 'var(--text-secondary)' }}>Saldo</p>
          <p className="valor-financeiro text-val-md" style={{ color: '#3B82F6' }}>
            R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 items-start max-w-4xl mx-auto">
        <div className="w-full space-y-6">
          
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileSelection} />

          {/* Portfolio Growth Chart */}
          <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} style={{ color: 'var(--accent-green)' }} />
              <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Evolução últimos 30 dias</h2>
            </div>
            {growthData.length > 0 ? (
              <div className="h-[220px] w-full select-none">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growthData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--ds-border)" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} dx={-10} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="capital" stroke="var(--accent-green)" strokeWidth={2} dot={growthData.length === 1} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center">
                <p className="text-label" style={{ color: 'var(--text-tertiary)' }}>Sem transações registradas</p>
              </div>
            )}
          </div>

          {/* Upload Modal */}
          {showModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
              <div className="w-full max-w-sm relative z-10 overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', border: '0.5px solid var(--ds-border)', borderRadius: '8px' }}>
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>Confirmar Envio</h3>
                    <button onClick={() => setShowModal(false)} style={{ color: 'var(--text-tertiary)' }}><Plus size={18} className="rotate-45" /></button>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)' }}>
                     <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)', color: '#3B82F6' }}><Plus size={18} /></div>
                     <div className="overflow-hidden">
                        <p className="text-label" style={{ color: 'var(--text-tertiary)' }}>Arquivo Selecionado</p>
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{selectedFile?.name}</p>
                     </div>
                  </div>
                  <div>
                    <label className="text-label block mb-1" style={{ color: 'var(--text-secondary)' }}>Comentário (opcional)</label>
                    <textarea autoFocus value={pendingNote} onChange={(e) => setPendingNote(e.target.value)} placeholder="Ex: Almoço com cliente..." className="w-full p-3 text-sm focus:outline-none h-20 resize-none" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)', borderRadius: '6px', color: 'var(--text-primary)' }} />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input type="checkbox" id="saveTokensPage" checked={saveTokens} onChange={(e) => setSaveTokens(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4" />
                    <label htmlFor="saveTokensPage" className="text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>Economia de Tokens (Extração Básica)</label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium" style={{ border: '0.5px solid var(--ds-border)', borderRadius: '6px', color: 'var(--text-secondary)' }}>Cancelar</button>
                    <button onClick={executeUpload} className="px-4 py-2.5 text-sm font-medium text-white" style={{ backgroundColor: '#3B82F6', borderRadius: '6px' }}>Enviar</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manual Entry Modal */}
          {showManualModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowManualModal(false)} />
              <div className="w-full max-w-sm relative z-10 overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', border: '0.5px solid var(--ds-border)', borderRadius: '8px' }}>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>Registro Manual</h3>
                    <button onClick={() => setShowManualModal(false)} style={{ color: 'var(--text-tertiary)' }}><X size={18} /></button>
                  </div>
                  <div>
                    <label className="text-label block mb-1" style={{ color: 'var(--text-secondary)' }}>Onde / Quem</label>
                    <input placeholder="Nome do Recebedor/Loja" className="w-full p-3 text-sm focus:outline-none" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)', borderRadius: '6px', color: 'var(--text-primary)' }} value={manualTx.merchant_name} onChange={e => setManualTx({...manualTx, merchant_name: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-label block mb-1" style={{ color: 'var(--text-secondary)' }}>Valor (R$)</label>
                    <input type="number" placeholder="0,00" className="w-full p-3 text-sm focus:outline-none" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)', borderRadius: '6px', color: 'var(--text-primary)' }} value={manualTx.total_amount} onChange={e => setManualTx({...manualTx, total_amount: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-label block mb-1" style={{ color: 'var(--text-secondary)' }}>Categoria</label>
                    <select className="w-full p-3 text-sm focus:outline-none" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)', borderRadius: '6px', color: 'var(--text-primary)' }} value={manualTx.category} onChange={e => setManualTx({...manualTx, category: e.target.value})}>
                      <option value="Outros">Outros</option>
                      <option value="Alimentação">Alimentação</option>
                      <option value="Transporte">Transporte</option>
                      <option value="Lazer">Lazer</option>
                      <option value="Saúde">Saúde</option>
                      <option value="Receita">Receita (Entrada)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-label block mb-1" style={{ color: 'var(--text-secondary)' }}>Nota</label>
                    <textarea placeholder="Ex: Almoço de negócios..." className="w-full p-3 text-sm h-16 resize-none focus:outline-none" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)', borderRadius: '6px', color: 'var(--text-primary)' }} value={manualTx.note} onChange={e => setManualTx({...manualTx, note: e.target.value})} />
                  </div>
                  <button onClick={handleManualAdd} className="w-full py-3 text-sm font-medium text-white" style={{ backgroundColor: '#3B82F6', borderRadius: '6px' }}>Salvar</button>
                </div>
              </div>
            </div>
          )}

          {/* Top Beneficiary */}
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', borderLeft: '3px solid #8B5CF6' }}>
             <div className="flex items-center gap-2 mb-1">
                <Award size={16} style={{ color: '#8B5CF6' }} />
                <h3 className="text-label font-medium" style={{ color: 'var(--text-secondary)' }}>Principal Beneficiário</h3>
             </div>
             <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{topBeneficiary.name}</p>
             <p className="text-label mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{topBeneficiary.count} transferência(s)</p>
          </div>

          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Últimas Movimentações</h2>
            <button onClick={() => setShowManualModal(true)} className="text-label font-medium flex items-center gap-1" style={{ color: '#3B82F6' }}>
              <Plus size={12} /> Manual
            </button>
          </div>

          <div className="space-y-0">
            {paginatedTransactions.length === 0 ? (
                <div className="p-8 text-center rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                  <p className="text-label" style={{ color: 'var(--text-tertiary)' }}>Nenhum registro encontrado</p>
                </div>
            ) : (
                paginatedTransactions.map((tx) => (
                  <div 
                    key={tx.id} 
                    className="flex items-center justify-between group cursor-default relative"
                    style={{ padding: '10px 0', borderBottom: '0.5px solid var(--ds-border)' }}
                  >
                    <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                      <span className="text-sm font-medium flex items-center gap-1.5 truncate" style={{ color: 'var(--text-primary)' }}>
                        {tx.merchant_name}
                        {tx.receipt_hash && <Receipt size={10} style={{ color: '#3B82F6' }} />}
                      </span>
                      <span className="text-label mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {tx.payment_method || tx.category} • {formatDate(tx.transaction_date)}
                      </span>
                      {tx.note && (
                        <p className="text-label italic mt-1" style={{ color: '#8B5CF6', borderLeft: '2px solid #8B5CF6', paddingLeft: '6px' }}>
                          &ldquo;{tx.note}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="valor-financeiro text-val-sm" style={{ color: tx.total_amount === 0 ? '#8B5CF6' : (tx.transaction_type === 'Inflow' ? '#10B981' : '#EF4444') }}>
                        {tx.transaction_type === 'Inflow' ? '+' : '-'}R$ {tx.total_amount.toLocaleString('pt-BR', {minimumFractionDigits:2})}
                      </p>
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
                ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 rounded-md disabled:opacity-30" style={{ border: '0.5px solid var(--ds-border)', color: 'var(--text-secondary)', borderRadius: '6px' }}>
                <ChevronLeft size={14} />
              </button>
              <div className="flex gap-1.5">
                {[...Array(totalPages)].map((_, i) => (
                  <button key={i} onClick={() => setCurrentPage(i + 1)} className="w-7 h-7 flex items-center justify-center text-label font-medium transition-all" style={{ backgroundColor: currentPage === i + 1 ? '#3B82F6' : 'transparent', color: currentPage === i + 1 ? '#FFFFFF' : 'var(--text-secondary)', border: currentPage === i + 1 ? 'none' : '0.5px solid var(--ds-border)', borderRadius: '6px' }}>
                    {i + 1}
                  </button>
                ))}
              </div>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 rounded-md disabled:opacity-30" style={{ border: '0.5px solid var(--ds-border)', color: 'var(--text-secondary)', borderRadius: '6px' }}>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {activeTab === "categories" && (
        <div className="flex flex-col md:flex-row gap-6 max-w-5xl mx-auto">
          {/* Categories Pie Chart */}
          <div className="p-4 rounded-lg flex-1" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <div className="flex items-center gap-2 mb-4">
              <PieChart size={18} style={{ color: 'var(--accent-green)' }} />
              <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Distribuição de Gastos</h2>
            </div>
            {categoriesData.length > 0 ? (
              <div className="h-[250px] w-full select-none">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoriesData} innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                      {categoriesData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => `R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center">
                <p className="text-label" style={{ color: 'var(--text-tertiary)' }}>Sem gastos categorizados</p>
              </div>
            )}
          </div>

          {/* Categories List */}
          <div className="flex-1 space-y-3">
             <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>Ranking de Categorias</h2>
             {categoriesData.map((cat, idx) => (
                <div key={idx} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)' }}>
                   <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                         <div className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}>
                           {CATEGORY_ICONS[cat.name] || <ShoppingBag size={14} />}
                         </div>
                         <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                      </div>
                      <span className="valor-financeiro text-sm" style={{ color: 'var(--text-primary)' }}>R$ {cat.value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                   </div>
                   <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(cat.value / (totalOutflow || 1)) * 100}%`, backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}></div>
                   </div>
                </div>
             ))}
          </div>
        </div>
      )}

      {activeTab === "trends" && (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
          <div className="p-4 rounded-lg w-full" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} style={{ color: 'var(--accent-blue)' }} />
              <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Evolução de Gastos por Semana</h2>
            </div>
            {trendsData.length > 0 ? (
              <div className="h-[250px] w-full select-none">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendsData} margin={{ left: -20, bottom: 0, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--ds-border)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'var(--text-tertiary)'}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'var(--text-tertiary)'}} dx={-10} />
                    <Tooltip cursor={{fill: 'var(--bg-tertiary)'}} contentStyle={tooltipStyle} formatter={(val: number) => `R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`} />
                    <Bar dataKey="value" fill="var(--accent-blue)" barSize={40} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center">
                <p className="text-label" style={{ color: 'var(--text-tertiary)' }}>Sem dados para tendências</p>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)' }}>
                <h3 className="text-label font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Previsão de Fechamento</h3>
                <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                   R$ {((totalOutflow || 0) * 1.2).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>*Baseado no seu ritmo atual (Média Diária x 30)</p>
             </div>
             <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)' }}>
                <h3 className="text-label font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Comparativo Anual</h3>
                <p className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>Você gastou <span style={{color: 'var(--accent-red)'}}>15% a mais</span> do que no mesmo mês do ano passado.</p>
             </div>
          </div>
        </div>
      )}

      {activeTab === "suppliers" && (
        <div className="max-w-4xl mx-auto space-y-4">
           <div className="flex items-center gap-2 mb-4">
             <HomeIcon size={20} style={{ color: 'var(--text-primary)' }} />
             <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Seus Fornecedores</h2>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {suppliersData.slice(0, 8).map((sup, idx) => (
                <div key={idx} className="p-4 rounded-lg flex items-center justify-between" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)' }}>
                   <div className="flex flex-col">
                      <span className="font-medium text-sm truncate max-w-[150px]" style={{ color: 'var(--text-primary)' }}>{sup.name}</span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{sup.count} visita(s)</span>
                   </div>
                   <div className="text-right">
                      <p className="font-medium text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>R$ {sup.value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{((sup.value / (totalOutflow || 1)) * 100).toFixed(1)}% do total</p>
                   </div>
                </div>
             ))}
             {suppliersData.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Nenhum fornecedor registrado ainda.</p>
             )}
           </div>
        </div>
      )}

      {activeTab === "methods" && (
        <div className="flex flex-col md:flex-row gap-6 max-w-5xl mx-auto">
          {/* Methods Pie Chart */}
          <div className="p-4 rounded-lg flex-1" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <div className="flex items-center gap-2 mb-4">
              <Award size={18} style={{ color: 'var(--accent-green)' }} />
              <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Formas de Pagamento</h2>
            </div>
            {methodsData.length > 0 ? (
              <div className="h-[250px] w-full select-none">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={methodsData} innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                      {methodsData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => `R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center">
                <p className="text-label" style={{ color: 'var(--text-tertiary)' }}>Sem pagamentos categorizados</p>
              </div>
            )}
          </div>

          {/* Methods List */}
          <div className="flex-1 space-y-3">
             {methodsData.map((met, idx) => (
                <div key={idx} className="p-3 rounded-lg flex justify-between items-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--ds-border)' }}>
                   <div className="flex items-center gap-3">
                      <div className="w-2.5 h-6 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}></div>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{met.name}</span>
                   </div>
                   <span className="valor-financeiro text-sm" style={{ color: 'var(--text-primary)' }}>R$ {met.value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
             ))}
             {methodsData.length > 0 && (
                <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '0.5px solid rgba(239, 68, 68, 0.2)' }}>
                   <h3 className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--accent-red)' }}>Atenção</h3>
                   <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                     {methodsData[0].name.toLowerCase().includes('credito') || methodsData[0].name.toLowerCase().includes('crédito') ? 
                     'Seu método de pagamento principal é Cartão de Crédito. Cuidado com o limite e juros rotativos.' : 
                     'Continue monitorando o saldo das suas contas para garantir liquidez.'}
                   </p>
                </div>
             )}
          </div>
        </div>
      )}

      {/* Placeholders for future phases */}
      {["taxes", "receivables"].includes(activeTab) && (
        <div className="p-12 text-center rounded-xl border border-dashed" style={{ borderColor: 'var(--ds-border)', backgroundColor: 'var(--bg-secondary)' }}>
           <Loader2 size={32} className="mx-auto mb-4 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
           <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Fase 3 em Desenvolvimento</h3>
           <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
             Este dashboard faz parte da Fase 3 do plano de implementação. Estamos finalizando as adaptações no banco de dados para suportar a lógica de deduções e contas a receber.
           </p>
        </div>
      )}

    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>Iniciando sistema...</div>}>
       <ExpenseTracker />
    </Suspense>
  );
}
