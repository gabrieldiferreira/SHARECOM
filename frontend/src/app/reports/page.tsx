"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  PieChart, Pie, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  FileText, FileSpreadsheet, Download, TrendingUp, TrendingDown,
  DollarSign, Layers, Calendar, CreditCard, Building2, Filter,
  ChevronDown, Loader2, Info, CheckCircle2, X
} from "lucide-react";
import { useTransactionStore } from "../../store/useTransactionStore";
import GlassFAB from "@/components/GlassFAB";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { getApiUrl } from "../../lib/api";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORY_COLORS: Record<string, string> = {
  "Alimentação": "#8B5CF6",
  "Compras": "#3B82F6",
  "Transporte": "#F59E0B",
  "Casa": "#EC4899",
  "Serviços": "#14B8A6",
  "Lazer": "#6B7280",
  "Receita": "#10B981",
  "Outros": "#6B7280",
};
const PIE_COLORS = ["#8B5CF6", "#3B82F6", "#F59E0B", "#EC4899", "#14B8A6", "#6B7280"];

type ReportType = "overview" | "category" | "monthly" | "payment" | "institution";
type TimeRange = "monthly" | "quarterly" | "annual";

interface DateRange { start: string; end: string }

export default function ReportsPage() {
  const { transactions, fetchTransactions } = useTransactionStore();
  usePullToRefresh(fetchTransactions);
  const [mounted, setMounted] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportType>("overview");
  const [timeRange, setTimeRange] = useState<TimeRange>("monthly");
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: "", end: "" });
  const [typeFilter, setTypeFilter] = useState<"all" | "Inflow" | "Outflow">("all");
  const [customerName, setCustomerName] = useState("");
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

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

  const loadReportData = useCallback(async () => {
    setIsLoadingReports(true);
    try {
      const params = new URLSearchParams({ timeframe: timeRange });
      if (dateRange.start) params.append('startDate', dateRange.start);
      if (dateRange.end) params.append('endDate', dateRange.end);
      
      const user = auth?.currentUser;
      if (!user) return;
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/reports?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (e) {
      console.error('Failed to load report data:', e);
    } finally {
      setIsLoadingReports(false);
    }
  }, [timeRange, dateRange]);

  useEffect(() => {
    if (mounted && !isCheckingAuth) {
      loadReportData();
    }
  }, [mounted, isCheckingAuth, loadReportData]);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.displayName && !customerName) {
        setCustomerName(user.displayName);
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (typeFilter !== "all" && tx.transaction_type !== typeFilter) return false;
      if (dateRange.start) {
        const txDate = new Date(tx.transaction_date).toLocaleDateString("sv-SE");
        if (txDate < dateRange.start) return false;
      }
      if (dateRange.end) {
        const txDate = new Date(tx.transaction_date).toLocaleDateString("sv-SE");
        if (txDate > dateRange.end) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, dateRange]);

  // ── derived data ──────────────────────────────────────────────
  const inflowTotal = useMemo(() => filtered.reduce((a, t) => t.transaction_type === "Inflow" ? a + t.total_amount : a, 0), [filtered]);
  const outflowTotal = useMemo(() => filtered.reduce((a, t) => t.transaction_type === "Outflow" ? a + t.total_amount : a, 0), [filtered]);
  const balance = inflowTotal - outflowTotal;

  const categoryData = useMemo(() => {
    const map: Record<string, { inflow: number; outflow: number; count: number }> = {};
    filtered.forEach(tx => {
      if (!map[tx.category]) map[tx.category] = { inflow: 0, outflow: 0, count: 0 };
      map[tx.category].count++;
      if (tx.transaction_type === "Inflow") map[tx.category].inflow += tx.total_amount;
      else map[tx.category].outflow += tx.total_amount;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, total: v.inflow + v.outflow, inflow: v.inflow, outflow: v.outflow, count: v.count, color: CATEGORY_COLORS[name] || "#6B7280" }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const monthlyData = useMemo(() => {
    const map: Record<string, { inflow: number; outflow: number; count: number }> = {};
    filtered.forEach(tx => {
      const d = new Date(tx.transaction_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map[key]) map[key] = { inflow: 0, outflow: 0, count: 0 };
      map[key].count++;
      if (tx.transaction_type === "Inflow") map[key].inflow += tx.total_amount;
      else map[key].outflow += tx.total_amount;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => {
        const [y, m] = month.split("-");
        const label = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(new Date(+y, +m - 1));
        return { month, label, ...v, balance: v.inflow - v.outflow };
      });
  }, [filtered]);

  const paymentData = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    filtered.forEach(tx => {
      const pm = tx.payment_method || "Desconhecido";
      if (!map[pm]) map[pm] = { total: 0, count: 0 };
      map[pm].total += tx.total_amount;
      map[pm].count++;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const institutionData = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    filtered.forEach(tx => {
      const inst = tx.destination_institution || "Não informado";
      if (!map[inst]) map[inst] = { total: 0, count: 0 };
      map[inst].total += tx.total_amount;
      map[inst].count++;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  // ── export helpers ────────────────────────────────────────────
  const reportTitles: Record<ReportType, string> = {
    overview: "Relatório Geral",
    category: "Relatório por Categoria",
    monthly: "Relatório Mensal",
    payment: "Relatório por Método de Pagamento",
    institution: "Relatório por Instituição",
  };

  const handleExport = async (format: "pdf" | "excel") => {
    setExporting(format);
    try {
      const payload = {
        transactions: filtered.map(tx => ({
          merchant_name: tx.merchant_name,
          total_amount: tx.total_amount,
          category: tx.category,
          transaction_type: tx.transaction_type,
          payment_method: tx.payment_method,
          transaction_date: tx.transaction_date,
          destination_institution: tx.destination_institution || null,
          note: tx.note || null,
        })),
        report_title: reportTitles[activeReport],
        report_type: activeReport,
        customer_name: customerName.trim() || null,
      };

      const res = await fetch(getApiUrl(`/export/${format}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf" ? "relatorio.pdf" : "relatorio.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      
      setNotification({
        type: 'success',
        message: `${format.toUpperCase()} gerado e baixado com sucesso!`
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      console.error("Export error:", err);
      setNotification({
        type: 'error',
        message: "Erro ao exportar. Verifique a conexão com o servidor."
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setExporting(null);
    }
  };

  // ── format helpers ────────────────────────────────────────────
  const fmtMoney = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const reports: { id: ReportType; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Visão Geral", icon: <TrendingUp size={16} /> },
    { id: "category", label: "Categorias", icon: <Layers size={16} /> },
    { id: "monthly", label: "Mensal", icon: <Calendar size={16} /> },
    { id: "payment", label: "Pagamentos", icon: <CreditCard size={16} /> },
    { id: "institution", label: "Instituições", icon: <Building2 size={16} /> },
  ];

  if (!mounted) {
    return <div className="p-8 animate-pulse text-center" style={{ color: "var(--text-secondary)" }}>Carregando relatórios...</div>;
  }

  // ── tooltip style ─────────────────────────────────────────────
  const tooltipStyle = { backgroundColor: "var(--bg-secondary)", border: "0.5px solid var(--ds-border)", borderRadius: "6px", fontSize: "12px" };

  return (
    <div className="p-4 md:p-5 pt-1 md:pt-2 space-y-5 font-sans" style={{ maxWidth: '100%' }}>
      {/* Notification Card */}
      {notification && (
        <div className="fixed top-[calc(env(safe-area-inset-top)+5rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`flex items-center gap-3 p-4 rounded-xl border-thin shadow-lg backdrop-blur-md ${
            notification.type === 'success' 
              ? 'bg-ds-bg-secondary/90 border-fn-income/30' 
              : 'bg-ds-bg-secondary/90 border-fn-expense/30'
          }`}>
            <div className={notification.type === 'success' ? 'text-fn-income' : 'text-fn-expense'}>
              {notification.type === 'success' ? <CheckCircle2 size={20} /> : <Info size={20} />}
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-medium text-ds-text-primary">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="text-ds-text-tertiary hover:text-ds-text-primary transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ds-text-primary">Relatórios Avançados</h1>
          <p className="text-xs text-ds-text-tertiary mt-0.5">
            Análise detalhada de {filtered.length} transação(ões)
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }} className="w-full sm:w-auto">
            <input
              type="text"
              placeholder="Nome do cliente"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="py-2 text-[14px] font-medium w-full bg-ds-bg-secondary text-ds-text-primary border-thin border-ds-border rounded-md outline-none min-w-[180px] pl-3 pr-8"
            />
            <div className="group absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer flex items-center">
              <Info size={16} className="text-ds-text-tertiary" />
              <span
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 whitespace-nowrap rounded-md px-2 py-1 text-[12px] opacity-0 group-hover:opacity-100 transition-opacity bg-ds-bg-secondary text-ds-text-primary border-thin border-ds-border z-50"
              >
                Insira seu nome
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport("pdf")}
              disabled={exporting !== null || filtered.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-[14px] font-medium transition-all disabled:opacity-40 bg-fn-expense text-white rounded-md"
            >
              {exporting === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              <span className="hidden xs:inline">PDF</span><span className="inline xs:hidden">PDF</span>
            </button>
            <button
              onClick={() => handleExport("excel")}
              disabled={exporting !== null || filtered.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-[14px] font-medium transition-all disabled:opacity-40 bg-fn-income text-white rounded-md"
            >
              {exporting === "excel" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              <span className="hidden xs:inline">Excel</span><span className="inline xs:hidden">Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="p-3 rounded-lg flex flex-col lg:flex-row gap-3 lg:items-center bg-ds-bg-secondary border-thin border-ds-border">
        <div className="flex items-center gap-2 shrink-0">
          <Filter size={14} className="text-ds-text-tertiary" />
          <span className="text-[12px] font-medium text-ds-text-secondary">Filtros:</span>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as "all" | "Inflow" | "Outflow")}
            className="py-1.5 px-3 text-[14px] focus:outline-none w-full sm:w-auto bg-ds-bg-primary border-thin border-ds-border rounded-md text-ds-text-primary"
          >
            <option value="all">Todos os tipos</option>
            <option value="Inflow">Apenas Entradas</option>
            <option value="Outflow">Apenas Saídas</option>
          </select>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="py-1.5 px-3 text-[14px] focus:outline-none flex-1 sm:w-32 bg-ds-bg-primary border-thin border-ds-border rounded-md text-ds-text-primary"
            />
            <span className="text-[12px] shrink-0 text-ds-text-tertiary">até</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="py-1.5 px-3 text-[14px] focus:outline-none flex-1 sm:w-32 bg-ds-bg-primary border-thin border-ds-border rounded-md text-ds-text-primary"
            />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Entradas", value: fmtMoney(inflowTotal), colorClass: "text-fn-income", bgClass: "bg-[#10B981] bg-opacity-10", icon: <TrendingUp size={18} /> },
          { label: "Saídas", value: fmtMoney(outflowTotal), colorClass: "text-fn-expense", bgClass: "bg-[#EF4444] bg-opacity-10", icon: <TrendingDown size={18} /> },
          { label: "Saldo", value: fmtMoney(balance), colorClass: balance >= 0 ? "text-fn-income" : "text-fn-expense", bgClass: balance >= 0 ? "bg-[#10B981] bg-opacity-10" : "bg-[#EF4444] bg-opacity-10", icon: <DollarSign size={18} /> },
          { label: "Transações", value: String(filtered.length), colorClass: "text-fn-balance", bgClass: "bg-[#3B82F6] bg-opacity-10", icon: <Layers size={18} /> },
        ].map(c => (
          <div key={c.label} className="p-2 sm:p-3 rounded-lg flex items-center gap-2 bg-ds-bg-secondary border-thin border-ds-border min-w-0">
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 ${c.colorClass} ${c.bgClass}`}>
              {c.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-ds-text-secondary truncate">{c.label}</p>
              <p className={`tabular-nums font-bold text-[14px] sm:text-[20px] truncate ${c.colorClass}`}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Glass Segmented Control - Top Tabs */}
      <div 
        className="flex items-center gap-1 p-1 rounded-2xl overflow-x-auto no-scrollbar"
        style={{ 
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {reports.map(r => (
          <button
            key={r.id}
            onClick={() => setActiveReport(r.id)}
            className={`flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap rounded-xl transition-all flex-1 ${activeReport === r.id ? 'text-white' : 'text-white/50 hover:text-white/70'}`}
            style={activeReport === r.id ? { 
              background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
              boxShadow: '0 2px 12px rgba(139, 92, 246, 0.3)',
            } : {}}
          >
            {r.icon}
            {r.label}
          </button>
        ))}
      </div>

      {/* Period tabs - Monthly/Quarterly/Annual (glass segmented) */}
      <div 
        className="flex items-center gap-1 p-1 rounded-xl"
        style={{ 
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          width: 'fit-content',
        }}
      >
        {(['monthly', 'quarterly', 'annual'] as TimeRange[]).map(t => (
          <button
            key={t}
            onClick={() => setTimeRange(t)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${timeRange === t ? 'text-white' : 'text-white/50'}`}
            style={timeRange === t ? { 
              background: 'rgba(139, 92, 246, 0.3)',
            } : {}}
          >
            {t === 'monthly' ? 'Mensal' : t === 'quarterly' ? 'Trimestral' : 'Anual'}
          </button>
        ))}
      </div>

      {/* Report content */}
      <div className="rounded-lg overflow-hidden bg-ds-bg-secondary border-thin border-ds-border relative min-h-[400px]">
        {/* Background loading indicator */}
        {isLoadingReports && (
          <div className="absolute top-4 right-4 z-50 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ds-bg-primary/80 border-thin border-ds-border backdrop-blur-md shadow-sm">
              <Loader2 size={12} className="animate-spin text-fn-balance" />
              <span className="text-[10px] font-medium text-ds-text-secondary">Atualizando...</span>
            </div>
          </div>
        )}

        {!isCheckingAuth && transactions.length === 0 && isLoadingReports ? (
          <div className="py-24 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-fn-balance" />
            <p className="text-[14px] text-ds-text-secondary">Carregando dados financeiros...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[14px] text-ds-text-secondary">Nenhuma transação encontrada para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="p-3 sm:p-6">
            <AnimatePresence>
              <motion.div
                key={activeReport}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
            {/* ── Overview ─────────────────────────────── */}
            {activeReport === "overview" && (
              <div className="space-y-8">
                <h2 className="text-[18px] font-medium border-b-thin border-ds-border pb-2 text-ds-text-primary text-center">Visão Geral</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Pie: category distribution */}
                  <div className="flex flex-col items-center">
                    <p className="text-[14px] mb-4 font-medium text-center w-full text-ds-text-secondary">Distribuição por Categoria</p>
                    <div className="w-full h-[280px] min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            dataKey="total"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius="70%"
                            innerRadius="45%"
                            paddingAngle={2}
                            label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                            style={{ fontSize: "10px" }}
                          >
                            {categoryData.map((entry, i) => (
                              <Cell key={entry.name} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                          <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {/* Bar: inflow vs outflow by month */}
                  <div className="flex flex-col items-center">
                    <p className="text-[14px] mb-4 font-medium text-center w-full text-ds-text-secondary">Entradas vs Saídas (Mensal)</p>
                    <div className="w-full h-[280px] min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} axisLine={false} tickLine={false} width={35} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                          <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} />
                          <Bar dataKey="inflow" name="Entradas" fill="#10B981" radius={[4, 4, 0, 0]} barSize={20} />
                          <Bar dataKey="outflow" name="Saídas" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                {/* Line: balance over time */}
                <div className="pt-4">
                  <p className="text-[14px] mb-4 font-medium text-ds-text-secondary">Evolução do Saldo Mensal</p>
                  <div className="w-full h-[220px] min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} axisLine={false} tickLine={false} width={35} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                        <Line type="monotone" dataKey="balance" name="Saldo" stroke="#3B82F6" strokeWidth={2} dot={{ fill: "#3B82F6", r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* ── Category ─────────────────────────────── */}
            {activeReport === "category" && (
              <div className="space-y-6">
                <h2 className="text-[18px] font-medium text-ds-text-primary text-center">Relatório por Categoria</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="min-w-0">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={categoryData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius="70%" innerRadius="40%" paddingAngle={2} label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""} style={{ fontSize: "11px" }}>
                          {categoryData.map((entry, i) => (
                            <Cell key={entry.name} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                        <Legend wrapperStyle={{ fontSize: "10px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={categoryData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} width={90} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                        <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]}>
                          {categoryData.map((entry, i) => (
                            <Cell key={entry.name} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {/* Category table */}
                <div className="overflow-x-auto no-scrollbar -mx-3 sm:mx-0 px-3 sm:px-0">
                  <table className="w-full border-collapse min-w-[600px]">
                    <thead>
                      <tr>
                        {["Categoria", "Entradas", "Saídas", "Total", "Qtd", "%"].map(h => (
                          <th key={h} className="text-[12px] text-left px-3 py-2 font-medium text-ds-text-secondary border-b-thin border-ds-border">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {categoryData.map(c => {
                        const grandTotal = categoryData.reduce((a, x) => a + x.total, 0) || 1;
                        return (
                          <tr key={c.name}>
                            <td className="px-3 py-2 text-[14px] text-ds-text-primary border-b-thin border-ds-border">
                              <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: c.color }} />
                              {c.name}
                            </td>
                            <td className="px-3 py-2 text-[14px] tabular-nums font-medium text-fn-income border-b-thin border-ds-border">{fmtMoney(c.inflow)}</td>
                            <td className="px-3 py-2 text-[14px] tabular-nums font-medium text-fn-expense border-b-thin border-ds-border">{fmtMoney(c.outflow)}</td>
                            <td className="px-3 py-2 text-[14px] tabular-nums font-medium text-ds-text-primary border-b-thin border-ds-border">{fmtMoney(c.total)}</td>
                            <td className="px-3 py-2 text-[14px] text-ds-text-secondary border-b-thin border-ds-border">{c.count}</td>
                            <td className="px-3 py-2 text-[14px] text-ds-text-secondary border-b-thin border-ds-border">{((c.total / grandTotal) * 100).toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Monthly ──────────────────────────────── */}
            {activeReport === "monthly" && (
              <div className="space-y-6">
                <h2 className="text-[18px] font-medium text-ds-text-primary text-center">Relatório Mensal</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="inflow" name="Entradas" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outflow" name="Saídas" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                    <Line type="monotone" dataKey="balance" name="Saldo" stroke="#3B82F6" strokeWidth={2} dot={{ fill: "#3B82F6", r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
                {/* Monthly table */}
                <div className="overflow-x-auto no-scrollbar -mx-3 sm:mx-0 px-3 sm:px-0">
                  <table className="w-full border-collapse min-w-[500px]">
                    <thead>
                      <tr>
                        {["Mês", "Entradas", "Saídas", "Saldo", "Transações"].map(h => (
                          <th key={h} className="text-[12px] text-left px-3 py-2 font-medium text-ds-text-secondary border-b-thin border-ds-border">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map(m => (
                        <tr key={m.month}>
                          <td className="px-3 py-2 text-[14px] capitalize text-ds-text-primary border-b-thin border-ds-border">{m.label}</td>
                          <td className="px-3 py-2 text-[14px] tabular-nums font-medium text-fn-income border-b-thin border-ds-border">{fmtMoney(m.inflow)}</td>
                          <td className="px-3 py-2 text-[14px] tabular-nums font-medium text-fn-expense border-b-thin border-ds-border">{fmtMoney(m.outflow)}</td>
                          <td className={`px-3 py-2 text-[14px] tabular-nums font-medium border-b-thin border-ds-border ${m.balance >= 0 ? 'text-fn-income' : 'text-fn-expense'}`}>{fmtMoney(m.balance)}</td>
                          <td className="px-3 py-2 text-[14px] text-ds-text-secondary border-b-thin border-ds-border">{m.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Payment Method ───────────────────────── */}
            {activeReport === "payment" && (
              <div className="space-y-6">
                <h2 className="text-[18px] font-medium text-ds-text-primary text-center">Relatório por Método de Pagamento</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="min-w-0">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={paymentData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius="70%" innerRadius="40%" paddingAngle={2} label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""} style={{ fontSize: "11px" }}>
                          {paymentData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                        <Legend wrapperStyle={{ fontSize: "10px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto no-scrollbar -mx-3 sm:mx-0 px-3 sm:px-0">
                    <table className="w-full border-collapse min-w-[400px]">
                      <thead>
                        <tr>
                          {["Método", "Total", "Qtd", "%"].map(h => (
                            <th key={h} className="text-[12px] text-left px-3 py-2 font-medium text-ds-text-secondary border-b-thin border-ds-border">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paymentData.map((p, i) => {
                          const grandTotal = paymentData.reduce((a, x) => a + x.total, 0) || 1;
                          return (
                            <tr key={p.name}>
                              <td className="px-3 py-2 text-[14px] text-ds-text-primary border-b-thin border-ds-border">
                                <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                {p.name}
                              </td>
                              <td className="px-3 py-2 text-[14px] tabular-nums font-medium text-ds-text-primary border-b-thin border-ds-border">{fmtMoney(p.total)}</td>
                              <td className="px-3 py-2 text-[14px] text-ds-text-secondary border-b-thin border-ds-border">{p.count}</td>
                              <td className="px-3 py-2 text-[14px] text-ds-text-secondary border-b-thin border-ds-border">{((p.total / grandTotal) * 100).toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Institution ──────────────────────────── */}
            {activeReport === "institution" && (
              <div className="space-y-6">
                <h2 className="text-[18px] font-medium text-ds-text-primary text-center">Relatório por Instituição</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="min-w-0">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={institutionData.slice(0, 10)} layout="vertical" margin={{ left: -10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} width={90} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                        <Bar dataKey="total" name="Total" fill="#8B5CF6" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto no-scrollbar -mx-3 sm:mx-0 px-3 sm:px-0">
                    <table className="w-full border-collapse min-w-[400px]">
                      <thead>
                        <tr>
                          {["Instituição", "Total", "Qtd", "%"].map(h => (
                            <th key={h} className="text-[12px] text-left px-3 py-2 font-medium text-ds-text-secondary border-b-thin border-ds-border">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {institutionData.map((inst, i) => {
                          const grandTotal = institutionData.reduce((a, x) => a + x.total, 0) || 1;
                          return (
                            <tr key={inst.name}>
                              <td className="px-3 py-2 text-[14px] text-ds-text-primary border-b-thin border-ds-border">
                                <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                {inst.name}
                              </td>
                              <td className="px-3 py-2 text-[14px] tabular-nums font-medium text-ds-text-primary border-b-thin border-ds-border">{fmtMoney(inst.total)}</td>
                              <td className="px-3 py-2 text-[14px] text-ds-text-secondary border-b-thin border-ds-border">{inst.count}</td>
                              <td className="px-3 py-2 text-[14px] text-ds-text-secondary border-b-thin border-ds-border">{((inst.total / grandTotal) * 100).toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            </motion.div>
          </AnimatePresence>
          </div>
        )}
      </div>
    <GlassFAB icon={<Download size={18} />} onClick={() => handleExport("pdf")} />
    </div>
  );
}
