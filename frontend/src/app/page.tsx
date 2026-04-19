"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { Receipt, Coffee, ShoppingBag, Car, Home as HomeIcon, X, BarChart3, Plus, Loader2, CheckCircle2, TrendingUp, TrendingDown, Landmark, Clock, Award, MessageSquare, Search, Filter, ChevronLeft, ChevronRight, FileText, Info } from "lucide-react";
import { useTransactionStore } from "../store/useTransactionStore";
import { TransactionEntity } from "../lib/db";
import { getApiUrl } from "../lib/api";
import { authenticatedFetch } from "../lib/auth";

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
  const [uploadType, setUploadType] = useState<"Inflow" | "Outflow">("Outflow");
  const [showManualModal, setShowManualModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const [dashboardMode, setDashboardMode] = useState<"minimal" | "main" | "surgical">("minimal");
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

  if (!mounted) {
    return <div className="p-8 animate-pulse text-center" style={{ color: 'var(--text-secondary)' }}>Iniciando...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 font-sans w-full max-w-full">
      
      {/* Loading Bar */}
      <div className={`fixed top-0 left-0 w-full h-1 z-50 transition-opacity duration-300 ${(isUploading || uploadSuccess) ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="h-full transition-all ease-out bg-fn-income" style={{ width: uploadSuccess ? '100%' : (isUploading ? '90%' : '0%'), transitionDuration: isUploading ? '15s' : '0.5s' }}></div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-2">
         <div>
            <h1 className="text-2xl font-medium text-ds-text-primary">Meus Comprovantes</h1>
            <p className="text-[12px] mt-1 text-ds-text-secondary">Inteligência Financeira Avançada</p>
         </div>
         <div className="flex items-center gap-2 bg-ds-bg-secondary p-1 rounded-lg border-thin border-ds-border">
            <button onClick={() => setDashboardMode("minimal")} className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${dashboardMode === "minimal" ? "bg-ds-bg-primary text-ds-text-primary shadow-sm" : "text-ds-text-secondary"}`}>Minimalista</button>
            <button onClick={() => setDashboardMode("main")} className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${dashboardMode === "main" ? "bg-ds-bg-primary text-ds-text-primary shadow-sm" : "text-ds-text-secondary"}`}>Principal</button>
            <button onClick={() => setDashboardMode("surgical")} className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${dashboardMode === "surgical" ? "bg-ds-bg-primary text-ds-text-primary shadow-sm" : "text-ds-text-secondary"}`}>Cirúrgico</button>
         </div>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileSelection} />

      {/* MODALS */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="w-full max-w-sm relative z-10 overflow-hidden bg-ds-bg-primary border-thin border-ds-border rounded-lg">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-medium text-ds-text-primary">Confirmar Envio</h3>
                <button onClick={() => setShowModal(false)} className="text-ds-text-tertiary"><Plus size={18} className="rotate-45" /></button>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-ds-bg-secondary border-thin border-ds-border">
                 <div className="w-9 h-9 rounded-full flex items-center justify-center bg-ds-bg-tertiary text-fn-balance"><Plus size={18} /></div>
                 <div className="overflow-hidden">
                    <p className="text-[12px] text-ds-text-tertiary">Arquivo Selecionado</p>
                    <p className="text-[14px] font-medium truncate text-ds-text-primary">{selectedFile?.name}</p>
                 </div>
              </div>
              <div className="space-y-2">
                 <label className="text-[12px] block text-ds-text-secondary">Tipo de Transação</label>
                 <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setUploadType("Outflow")} className={`flex items-center justify-center gap-2 p-3 rounded-md border-thin transition-all ${uploadType === 'Outflow' ? 'bg-[#EF4444] bg-opacity-10 border-[#EF4444] text-[#EF4444]' : 'bg-ds-bg-secondary border-ds-border text-ds-text-tertiary'}`}>
                       <TrendingDown size={18} />
                       <span className="text-[12px] font-medium">Saída</span>
                    </button>
                    <button onClick={() => setUploadType("Inflow")} className={`flex items-center justify-center gap-2 p-3 rounded-md border-thin transition-all ${uploadType === 'Inflow' ? 'bg-[#10B981] bg-opacity-10 border-[#10B981] text-[#10B981]' : 'bg-ds-bg-secondary border-ds-border text-ds-text-tertiary'}`}>
                       <TrendingUp size={18} />
                       <span className="text-[12px] font-medium">Entrada</span>
                    </button>
                 </div>
              </div>
              <div>
                <label className="text-[12px] block mb-1 text-ds-text-secondary">Comentário (opcional)</label>
                <textarea autoFocus value={pendingNote} onChange={(e) => setPendingNote(e.target.value)} placeholder="Ex: Almoço com cliente..." className="w-full p-3 text-[14px] focus:outline-none h-20 resize-none bg-ds-bg-secondary border-thin border-ds-border rounded-md text-ds-text-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-[14px] font-medium border-thin border-ds-border rounded-md text-ds-text-secondary">Cancelar</button>
                <button onClick={executeUpload} className="px-4 py-2.5 text-[14px] font-medium text-white bg-fn-balance rounded-md">Enviar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showManualModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowManualModal(false)} />
          <div className="w-full max-w-sm relative z-10 overflow-hidden bg-ds-bg-primary border-thin border-ds-border rounded-lg">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-medium text-ds-text-primary">Registro Manual</h3>
                <button onClick={() => setShowManualModal(false)} className="text-ds-text-tertiary"><X size={18} /></button>
              </div>
              <div>
                <label className="text-[12px] block mb-1 text-ds-text-secondary">Onde / Quem</label>
                <input placeholder="Nome do Recebedor/Loja" className="w-full p-3 text-[14px] focus:outline-none bg-ds-bg-secondary border-thin border-ds-border rounded-md text-ds-text-primary" value={manualTx.merchant_name} onChange={e => setManualTx({...manualTx, merchant_name: e.target.value})} />
              </div>
              <div>
                <label className="text-[12px] block mb-1 text-ds-text-secondary">Valor (R$)</label>
                <input type="number" placeholder="0,00" className="w-full p-3 text-[14px] focus:outline-none bg-ds-bg-secondary border-thin border-ds-border rounded-md text-ds-text-primary" value={manualTx.total_amount} onChange={e => setManualTx({...manualTx, total_amount: e.target.value})} />
              </div>
              <div>
                <label className="text-[12px] block mb-1 text-ds-text-secondary">Categoria</label>
                <select className="w-full p-3 text-[14px] focus:outline-none bg-ds-bg-secondary border-thin border-ds-border rounded-md text-ds-text-primary" value={manualTx.category} onChange={e => setManualTx({...manualTx, category: e.target.value})}>
                  <option value="Outros">Outros</option>
                  <option value="Alimentação">Alimentação</option>
                  <option value="Transporte">Transporte</option>
                  <option value="Lazer">Lazer</option>
                  <option value="Saúde">Saúde</option>
                  <option value="Receita">Receita (Entrada)</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] block mb-1 text-ds-text-secondary">Nota</label>
                <textarea placeholder="Ex: Almoço de negócios..." className="w-full p-3 text-[14px] h-16 resize-none focus:outline-none bg-ds-bg-secondary border-thin border-ds-border rounded-md text-ds-text-primary" value={manualTx.note} onChange={e => setManualTx({...manualTx, note: e.target.value})} />
              </div>
              <button onClick={handleManualAdd} className="w-full py-3 text-[14px] font-medium text-white bg-fn-balance rounded-md">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD CONTENT SWITCHER */}
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
                  <h3 className="text-[12px] font-medium text-ds-text-secondary uppercase tracking-wider">Últimos Registros</h3>
                  <button onClick={() => setShowManualModal(true)} className="text-[12px] text-fn-balance font-medium">Adicionar +</button>
               </div>
               {transactions.slice(0, 3).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-4 bg-ds-bg-secondary border-thin border-ds-border rounded-xl">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-ds-bg-primary border-thin border-ds-border flex items-center justify-center text-ds-text-tertiary">
                           <Receipt size={16} />
                        </div>
                        <div>
                           <p className="text-[14px] font-medium text-ds-text-primary truncate max-w-[150px]">{tx.merchant_name}</p>
                           <p className="text-[12px] text-ds-text-tertiary">{tx.category}</p>
                        </div>
                     </div>
                     <p className={`flex items-center gap-1 text-[14px] font-medium tabular-nums ${tx.transaction_type === 'Inflow' ? 'text-fn-income' : 'text-fn-expense'}`}>
                        {tx.transaction_type === 'Inflow' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        R$ {tx.total_amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                     </p>
                  </div>
               ))}
            </div>
         </div>
      )}

      {dashboardMode === "main" && (
         <div className="space-y-6">
            {/* Inflow / Outflow Summary Cards */}
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
                  {/* Capital Growth Chart */}
                  <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                     <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-4 gap-3">
                        <div>
                           <p className="text-[12px] font-medium text-ds-text-secondary uppercase tracking-widest mb-1">Evolução Patrimonial</p>
                           <h2 className="text-[28px] md:text-[32px] font-medium tabular-nums text-ds-text-primary truncate">R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
                        </div>
                        <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium self-start ${dailyInsights.isPositive ? 'bg-[#10B981] bg-opacity-10 text-fn-income' : 'bg-[#EF4444] bg-opacity-10 text-fn-expense'}`}>
                           {dailyInsights.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                           {dailyInsights.isPositive ? '+' : '-'}R$ {dailyInsights.absDelta.toLocaleString('pt-BR', {maximumFractionDigits:0})} hoje
                        </div>
                     </div>
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
                  </div>

                  {/* Categories Breakdown */}
                  <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                     <h2 className="text-[14px] font-medium text-ds-text-primary mb-4">Gastos por Categoria</h2>
                     {categoriesData.length > 0 ? (
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
                     ) : (
                        <p className="text-[12px] text-ds-text-tertiary text-center py-8">Nenhuma saída registrada ainda.</p>
                     )}
                  </div>
               </div>

               {/* Top 5 Maiores Gastos */}
               <div className="space-y-6">
                  <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                     <h2 className="text-[14px] font-medium text-ds-text-primary mb-4">Top 5 Maiores Gastos</h2>
                     <div className="space-y-4">
                        {transactions.filter(t => t.transaction_type === 'Outflow').sort((a,b) => b.total_amount - a.total_amount).slice(0, 5).map((tx, i) => (
                           <div key={tx.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-full bg-ds-bg-primary border-thin border-ds-border flex items-center justify-center text-[12px] font-bold text-ds-text-tertiary">{i+1}</div>
                                 <div className="min-w-0 max-w-[120px]">
                                    <p className="text-[12px] font-medium text-ds-text-primary truncate">{tx.merchant_name}</p>
                                    <p className="text-[10px] text-ds-text-secondary truncate">{tx.category}</p>
                                 </div>
                              </div>
                              <div className="text-right">
                                 <p className="flex items-center justify-end gap-1 text-[14px] font-medium tabular-nums text-fn-expense">
                                    <TrendingDown size={12} /> R$ {tx.total_amount.toLocaleString('pt-BR')}
                                 </p>
                                 <p className="text-[10px] text-ds-text-tertiary">{totalOutflow > 0 ? ((tx.total_amount / totalOutflow) * 100).toFixed(1) : 0}% do total</p>
                              </div>
                           </div>
                        ))}
                        {transactions.filter(t => t.transaction_type === 'Outflow').length === 0 && (
                           <p className="text-[12px] text-ds-text-tertiary text-center py-4">Nenhuma saída registrada.</p>
                        )}
                     </div>
                  </div>

                  {/* Recent Transactions */}
                  <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
                     <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[14px] font-medium text-ds-text-primary">Últimas Movimentações</h2>
                        <span className="text-[11px] text-ds-text-tertiary">{transactions.length} total</span>
                     </div>
                     <div className="space-y-3">
                        {transactions.slice(0, 5).map(tx => (
                           <div key={tx.id} className="flex items-center justify-between py-2 border-b-thin border-ds-border last:border-b-0">
                              <div className="flex items-center gap-3 min-w-0">
                                 <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tx.transaction_type === 'Inflow' ? 'bg-[#10B981] bg-opacity-10 text-fn-income' : 'bg-[#EF4444] bg-opacity-10 text-fn-expense'}`}>
                                    {tx.transaction_type === 'Inflow' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                 </div>
                                 <div className="min-w-0">
                                    <p className="text-[13px] font-medium text-ds-text-primary truncate">{tx.merchant_name}</p>
                                    <p className="text-[11px] text-ds-text-tertiary">{formatDate(tx.transaction_date)}</p>
                                 </div>
                              </div>
                              <p className={`text-[13px] font-medium tabular-nums shrink-0 ml-2 ${tx.transaction_type === 'Inflow' ? 'text-fn-income' : 'text-fn-expense'}`}>
                                 {tx.transaction_type === 'Inflow' ? '+' : '-'}R$ {tx.total_amount.toLocaleString('pt-BR', {minimumFractionDigits:2})}
                              </p>
                           </div>
                        ))}
                        {transactions.length === 0 && (
                           <p className="text-[12px] text-ds-text-tertiary text-center py-4">Nenhuma movimentação registrada.</p>
                        )}
                     </div>
                  </div>
               </div>
            </div>
         </div>
      )}

      {dashboardMode === "surgical" && (
         <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               {/* Weekday Intensity */}
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

               {/* Categories Pie */}
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

            {/* Payment Methods + Alerts row */}
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

               {/* Alerts */}
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

            {/* Full Transactions Table */}
            <div className="bg-ds-bg-secondary p-5 rounded-xl border-thin border-ds-border">
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                  <h2 className="text-[14px] font-medium text-ds-text-primary">Todos os Comprovantes</h2>
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
               <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {["Data", "Destino", "Categoria", "Tipo", "Valor"].map(h => (
                          <th key={h} className="text-[11px] text-left px-3 py-2 font-medium text-ds-text-tertiary uppercase tracking-wider border-b-thin border-ds-border">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTransactions.length > 0 ? paginatedTransactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-ds-bg-tertiary transition-colors">
                           <td className="px-3 py-2.5 text-[13px] text-ds-text-primary border-b-thin border-ds-border whitespace-nowrap">{formatDate(tx.transaction_date)}</td>
                           <td className="px-3 py-2.5 text-[13px] text-ds-text-primary border-b-thin border-ds-border truncate max-w-[180px]">{tx.merchant_name}</td>
                           <td className="px-3 py-2.5 text-[12px] text-ds-text-secondary border-b-thin border-ds-border">{tx.category}</td>
                           <td className="px-3 py-2.5 border-b-thin border-ds-border">
                              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${tx.transaction_type === 'Inflow' ? 'bg-[#10B981] bg-opacity-10 text-fn-income' : 'bg-[#EF4444] bg-opacity-10 text-fn-expense'}`}>
                                 {tx.transaction_type === 'Inflow' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                 {tx.transaction_type === 'Inflow' ? 'Entrada' : 'Saída'}
                              </span>
                           </td>
                           <td className="px-3 py-2.5 text-[13px] tabular-nums font-medium border-b-thin border-ds-border text-right">
                              <span className={tx.transaction_type === 'Inflow' ? 'text-fn-income' : 'text-fn-expense'}>
                                 {tx.transaction_type === 'Inflow' ? '+' : '-'}R$ {tx.total_amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                              </span>
                           </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={5} className="py-8 text-center text-[12px] text-ds-text-tertiary">Nenhum registro encontrado.</td></tr>
                      )}
                    </tbody>
                  </table>
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
    </div>
  );
}

export default ExpenseTracker;
