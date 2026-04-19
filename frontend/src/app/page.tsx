"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { Receipt, Coffee, ShoppingBag, Car, Home as HomeIcon, X, BarChart3, Plus, Loader2, CheckCircle2, TrendingUp, Landmark, Clock, Award, MessageSquare, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, CartesianGrid } from 'recharts';
import { useTransactionStore } from "../store/useTransactionStore";
import { TransactionEntity } from "../lib/db";
import { getApiUrl } from "../lib/api";
import { authenticatedFetch } from "../lib/auth";

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
  const [showManualModal, setShowManualModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  
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

  if (!mounted) return null;

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

  const lifestyleData = useMemo(() => {
    let day = 0, night = 0;
    transactions.forEach(tx => {
       if(tx.transaction_type === 'Outflow' && tx.transaction_date) {
          const date = new Date(tx.transaction_date);
          if (isNaN(date.getTime())) return;
          const hour = date.getHours();
          if(hour >= 6 && hour < 18) day += tx.total_amount || 0;
          else night += tx.total_amount || 0;
       }
    });
    return [{ name: 'Diurno (6h-18h)', value: day }, { name: 'Noturno (18h-6h)', value: night }];
  }, [transactions]);

  const institutionsData = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach(tx => {
        if(tx.transaction_type === 'Outflow' && tx.total_amount) {
            const inst = tx.destination_institution || 'Outros';
            map[inst] = (map[inst] || 0) + tx.total_amount;
        }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value).slice(0, 6);
  }, [transactions]);

  const topBeneficiary = useMemo(() => {
     const map: Record<string, number> = {};
     transactions.forEach(tx => {
         if (tx.transaction_type === "Outflow") map[tx.merchant_name] = (map[tx.merchant_name] || 0) + 1;
     });
     let top = { name: "Nenhum", count: 0 };
     for(const [name, count] of Object.entries(map)) {
         if(count > top.count) top = { name, count };
     }
     return top;
  }, [transactions]);

  const growthData = useMemo(() => {
     let current = 0;
     const sorted = [...transactions].sort((a,b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
     return sorted.map(tx => {
         current += (tx.transaction_type === 'Inflow' ? tx.total_amount : -tx.total_amount);
         return { date: new Intl.DateTimeFormat('pt-BR', { month: 'short', day: 'numeric' }).format(new Date(tx.transaction_date)), capital: current };
     });
  }, [transactions]);

  const notesAnalysis = useMemo(() => {
    const keywords: Record<string, number> = {};
    transactions.forEach(tx => {
       if (tx.note) {
          const words = tx.note.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          words.forEach(w => { keywords[w] = (keywords[w] || 0) + tx.total_amount; });
       }
    });
    return Object.entries(keywords).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileSelection} />

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

          {/* Portfolio Growth Chart */}
          {growthData.length > 0 && (
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} style={{ color: '#3B82F6' }} />
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Evolução de Patrimônio</h2>
              </div>
              <div className="h-[220px] w-full select-none">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growthData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--ds-border)" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} dx={-10} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="capital" stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '12px' }}>
              {/* Institutional Exposure */}
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Landmark size={18} style={{ color: '#8B5CF6' }} />
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Exposição Institucional</h2>
                </div>
                {institutionsData.length > 0 ? (
                    <>
                      <div className="h-[160px] select-none">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={institutionsData} innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                              {institutionsData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center flex-wrap mt-2" style={{ gap: '16px' }}>
                          {institutionsData.map((entry, index) => (
                              <div key={index} className="flex items-center gap-1.5 text-label" style={{ color: 'var(--text-secondary)' }}>
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}></div>
                                  <span className="truncate max-w-[80px]">{entry.name}</span>
                              </div>
                          ))}
                      </div>
                    </>
                ) : (
                    <p className="text-label text-center py-8" style={{ color: 'var(--text-tertiary)' }}>Dados insuficientes</p>
                )}
              </div>

              {/* Lifestyle Analysis */}
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={18} style={{ color: '#F59E0B' }} />
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Análise de Costumes</h2>
                </div>
                {transactions.length > 0 ? (
                    <div className="h-[160px] select-none">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={lifestyleData} margin={{ left: -20, bottom: 0, top: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--ds-border)" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'var(--text-tertiary)'}} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'var(--text-tertiary)'}} dx={-10} />
                            <Tooltip cursor={{fill: 'var(--bg-tertiary)'}} contentStyle={tooltipStyle} />
                            <Bar dataKey="value" fill="#8B5CF6" barSize={30} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="text-label text-center py-8" style={{ color: 'var(--text-tertiary)' }}>Nenhuma saída verificada</p>
                )}
              </div>

              {/* Notes Analysis */}
              {notesAnalysis.length > 0 && (
                <div className="p-4 rounded-lg md:col-span-2" style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare size={18} style={{ color: '#EC4899' }} />
                    <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Dashboard de Notas</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="h-[180px] select-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={notesAnalysis} layout="vertical" margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} width={80} />
                          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--bg-tertiary)' }} />
                          <Bar dataKey="value" fill="#EC4899" radius={[0, 4, 4, 0]} barSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3">
                       <p className="text-label leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                         Padrões recorrentes baseados nas suas anotações manuais.
                       </p>
                       <div className="space-y-2">
                          {notesAnalysis.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-label" style={{ borderBottom: '0.5px solid var(--ds-border)', paddingBottom: '6px' }}>
                               <span className="font-medium capitalize" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                               <span className="valor-financeiro" style={{ color: '#3B82F6' }}>R$ {item.value.toLocaleString('pt-BR')}</span>
                            </div>
                          ))}
                       </div>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-4">
          
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
