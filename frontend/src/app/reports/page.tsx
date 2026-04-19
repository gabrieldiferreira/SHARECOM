"use client";

import { useState, useEffect, useMemo } from "react";
import {
  PieChart, Pie, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  FileText, FileSpreadsheet, Download, TrendingUp, TrendingDown,
  DollarSign, Layers, Calendar, CreditCard, Building2, Filter,
  ChevronDown, Loader2, Info,
} from "lucide-react";
import { useTransactionStore } from "../../store/useTransactionStore";
import { getApiUrl } from "../../lib/api";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

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
const PIE_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6", "#F97316", "#EF4444", "#6366F1", "#6B7280"];

type ReportType = "overview" | "category" | "monthly" | "payment" | "institution";

interface DateRange { start: string; end: string }

export default function ReportsPage() {
  const { transactions, fetchTransactions } = useTransactionStore();
  const [mounted, setMounted] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportType>("overview");
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: "", end: "" });
  const [typeFilter, setTypeFilter] = useState<"all" | "Inflow" | "Outflow">("all");
  const [customerName, setCustomerName] = useState("");

  useEffect(() => {
    setMounted(true);
    fetchTransactions();
  }, [fetchTransactions]);

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
    } catch (err) {
      console.error("Export error:", err);
      alert("Erro ao exportar. Verifique se o servidor backend está rodando.");
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
    <div className="p-4 md:p-6 space-y-5 font-sans overflow-x-hidden" style={{ maxWidth: "100vw" }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium" style={{ color: "var(--text-primary)" }}>Relatórios Avançados</h1>
          <p className="text-label mt-1" style={{ color: "var(--text-secondary)" }}>
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
              className="py-2 text-sm font-medium w-full"
              style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "0.5px solid var(--ds-border)", borderRadius: "6px", outline: "none", minWidth: "180px", paddingLeft: "12px", paddingRight: "32px" }}
            />
            <div className="group" style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <Info size={16} style={{ color: "var(--text-tertiary)" }} />
              <span
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "0.5px solid var(--ds-border)", borderRadius: "6px", zIndex: 50 }}
              >
                Insira seu nome
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport("pdf")}
              disabled={exporting !== null || filtered.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all disabled:opacity-40"
              style={{ backgroundColor: "#EF4444", color: "#FFFFFF", borderRadius: "6px" }}
            >
              {exporting === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              <span className="hidden xs:inline">PDF</span><span className="inline xs:hidden">PDF</span>
            </button>
            <button
              onClick={() => handleExport("excel")}
              disabled={exporting !== null || filtered.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all disabled:opacity-40"
              style={{ backgroundColor: "#10B981", color: "#FFFFFF", borderRadius: "6px" }}
            >
              {exporting === "excel" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              <span className="hidden xs:inline">Excel</span><span className="inline xs:hidden">Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="p-3 rounded-lg flex flex-col lg:flex-row gap-3 lg:items-center" style={{ backgroundColor: "var(--bg-secondary)", border: "0.5px solid var(--ds-border)", borderRadius: "8px" }}>
        <div className="flex items-center gap-2 shrink-0">
          <Filter size={14} style={{ color: "var(--text-tertiary)" }} />
          <span className="text-label font-medium" style={{ color: "var(--text-secondary)" }}>Filtros:</span>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as "all" | "Inflow" | "Outflow")}
            className="py-1.5 px-3 text-sm focus:outline-none w-full sm:w-auto"
            style={{ backgroundColor: "var(--bg-primary)", border: "0.5px solid var(--ds-border)", borderRadius: "6px", color: "var(--text-primary)" }}
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
              className="py-1.5 px-3 text-sm focus:outline-none flex-1 sm:w-32"
              style={{ backgroundColor: "var(--bg-primary)", border: "0.5px solid var(--ds-border)", borderRadius: "6px", color: "var(--text-primary)" }}
            />
            <span className="text-label shrink-0" style={{ color: "var(--text-tertiary)" }}>até</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="py-1.5 px-3 text-sm focus:outline-none flex-1 sm:w-32"
              style={{ backgroundColor: "var(--bg-primary)", border: "0.5px solid var(--ds-border)", borderRadius: "6px", color: "var(--text-primary)" }}
            />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Entradas", value: fmtMoney(inflowTotal), color: "#10B981", icon: <TrendingUp size={18} /> },
          { label: "Saídas", value: fmtMoney(outflowTotal), color: "#EF4444", icon: <TrendingDown size={18} /> },
          { label: "Saldo", value: fmtMoney(balance), color: balance >= 0 ? "#10B981" : "#EF4444", icon: <DollarSign size={18} /> },
          { label: "Transações", value: String(filtered.length), color: "#3B82F6", icon: <Layers size={18} /> },
        ].map(c => (
          <div key={c.label} className="p-3 rounded-lg flex items-center gap-2 sm:gap-3" style={{ backgroundColor: "var(--bg-secondary)", borderRadius: "8px" }}>
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.color}15`, color: c.color }}>
              {c.icon}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold opacity-70" style={{ color: "var(--text-secondary)" }}>{c.label}</p>
              <p className="valor-financeiro text-sm sm:text-lg truncate" style={{ color: c.color }}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Report tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {reports.map(r => (
          <button
            key={r.id}
            onClick={() => setActiveReport(r.id)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap transition-all"
            style={{
              backgroundColor: activeReport === r.id ? "#3B82F6" : "transparent",
              color: activeReport === r.id ? "#FFFFFF" : "var(--text-secondary)",
              border: activeReport === r.id ? "none" : "0.5px solid var(--ds-border)",
              borderRadius: "6px",
            }}
          >
            {r.icon}
            {r.label}
          </button>
        ))}
      </div>

      {/* Report content */}
      <div className="rounded-lg overflow-hidden" style={{ backgroundColor: "var(--bg-secondary)", border: "0.5px solid var(--ds-border)", borderRadius: "8px" }}>
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Nenhuma transação encontrada com os filtros selecionados.</p>
          </div>
        ) : (
          <div className="p-3 sm:p-6">
            {/* ── Overview ─────────────────────────────── */}
            {activeReport === "overview" && (
              <div className="space-y-8">
                <h2 className="text-lg font-medium border-b pb-2" style={{ color: "var(--text-primary)", borderColor: "var(--ds-border)" }}>Visão Geral</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Pie: category distribution */}
                  <div className="flex flex-col items-center">
                    <p className="text-sm mb-4 font-semibold text-center w-full" style={{ color: "var(--text-secondary)" }}>Distribuição por Categoria</p>
                    <div className="w-full h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            dataKey="total"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius="80%"
                            innerRadius="50%"
                            paddingAngle={2}
                            label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                            style={{ fontSize: "10px" }}
                          >
                            {categoryData.map((entry, i) => (
                              <Cell key={entry.name} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {/* Bar: inflow vs outflow by month */}
                  <div className="flex flex-col items-center">
                    <p className="text-sm mb-4 font-semibold text-center w-full" style={{ color: "var(--text-secondary)" }}>Entradas vs Saídas (Mensal)</p>
                    <div className="w-full h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
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
                  <p className="text-sm mb-4 font-semibold" style={{ color: "var(--text-secondary)" }}>Evolução do Saldo Mensal</p>
                  <div className="w-full h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
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
                <h2 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>Relatório por Categoria</h2>
                <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "20px" }}>
                  <div>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={categoryData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={120} innerRadius={60} paddingAngle={2} label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} style={{ fontSize: "11px" }}>
                          {categoryData.map((entry, i) => (
                            <Cell key={entry.name} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
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
                <div className="overflow-x-auto">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Categoria", "Entradas", "Saídas", "Total", "Qtd", "% do Total"].map(h => (
                          <th key={h} className="text-label text-left px-3 py-2 font-medium" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--ds-border)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {categoryData.map(c => {
                        const grandTotal = categoryData.reduce((a, x) => a + x.total, 0) || 1;
                        return (
                          <tr key={c.name}>
                            <td className="px-3 py-2 text-sm" style={{ color: "var(--text-primary)", borderBottom: "0.5px solid var(--ds-border)" }}>
                              <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: c.color }} />
                              {c.name}
                            </td>
                            <td className="px-3 py-2 text-sm" style={{ color: "#10B981", borderBottom: "0.5px solid var(--ds-border)" }}>{fmtMoney(c.inflow)}</td>
                            <td className="px-3 py-2 text-sm" style={{ color: "#EF4444", borderBottom: "0.5px solid var(--ds-border)" }}>{fmtMoney(c.outflow)}</td>
                            <td className="px-3 py-2 text-sm font-medium" style={{ color: "var(--text-primary)", borderBottom: "0.5px solid var(--ds-border)" }}>{fmtMoney(c.total)}</td>
                            <td className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)", borderBottom: "0.5px solid var(--ds-border)" }}>{c.count}</td>
                            <td className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)", borderBottom: "0.5px solid var(--ds-border)" }}>{((c.total / grandTotal) * 100).toFixed(1)}%</td>
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
                <h2 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>Relatório Mensal</h2>
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
                <div className="overflow-x-auto">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Mês", "Entradas", "Saídas", "Saldo", "Transações"].map(h => (
                          <th key={h} className="text-label text-left px-3 py-2 font-medium" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--ds-border)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map(m => (
                        <tr key={m.month}>
                          <td className="px-3 py-2 text-sm capitalize" style={{ color: "var(--text-primary)", borderBottom: "0.5px solid var(--ds-border)" }}>{m.label}</td>
                          <td className="px-3 py-2 text-sm" style={{ color: "#10B981", borderBottom: "0.5px solid var(--ds-border)" }}>{fmtMoney(m.inflow)}</td>
                          <td className="px-3 py-2 text-sm" style={{ color: "#EF4444", borderBottom: "0.5px solid var(--ds-border)" }}>{fmtMoney(m.outflow)}</td>
                          <td className="px-3 py-2 text-sm font-medium" style={{ color: m.balance >= 0 ? "#10B981" : "#EF4444", borderBottom: "0.5px solid var(--ds-border)" }}>{fmtMoney(m.balance)}</td>
                          <td className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)", borderBottom: "0.5px solid var(--ds-border)" }}>{m.count}</td>
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
                <h2 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>Relatório por Método de Pagamento</h2>
                <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "20px" }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={paymentData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={50} paddingAngle={2} label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} style={{ fontSize: "11px" }}>
                        {paymentData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto">
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["Método", "Total", "Qtd", "%"].map(h => (
                            <th key={h} className="text-label text-left px-3 py-2 font-medium" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--ds-border)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paymentData.map((p, i) => {
                          const grandTotal = paymentData.reduce((a, x) => a + x.total, 0) || 1;
                          return (
                            <tr key={p.name}>
                              <td className="px-3 py-2 text-sm" style={{ color: "var(--text-primary)", borderBottom: "0.5px solid var(--ds-border)" }}>
                                <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                {p.name}
                              </td>
                              <td className="px-3 py-2 text-sm font-medium" style={{ color: "var(--text-primary)", borderBottom: "0.5px solid var(--ds-border)" }}>{fmtMoney(p.total)}</td>
                              <td className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)", borderBottom: "0.5px solid var(--ds-border)" }}>{p.count}</td>
                              <td className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)", borderBottom: "0.5px solid var(--ds-border)" }}>{((p.total / grandTotal) * 100).toFixed(1)}%</td>
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
                <h2 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>Relatório por Instituição</h2>
                <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "20px" }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={institutionData.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} width={120} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => fmtMoney(Number(value))} />
                      <Bar dataKey="total" name="Total" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto">
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["Instituição", "Total", "Qtd", "%"].map(h => (
                            <th key={h} className="text-label text-left px-3 py-2 font-medium" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--ds-border)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {institutionData.map((inst, i) => {
                          const grandTotal = institutionData.reduce((a, x) => a + x.total, 0) || 1;
                          return (
                            <tr key={inst.name}>
                              <td className="px-3 py-2 text-sm" style={{ color: "var(--text-primary)", borderBottom: "0.5px solid var(--ds-border)" }}>
                                <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                {inst.name}
                              </td>
                              <td className="px-3 py-2 text-sm font-medium" style={{ color: "var(--text-primary)", borderBottom: "0.5px solid var(--ds-border)" }}>{fmtMoney(inst.total)}</td>
                              <td className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)", borderBottom: "0.5px solid var(--ds-border)" }}>{inst.count}</td>
                              <td className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)", borderBottom: "0.5px solid var(--ds-border)" }}>{((inst.total / grandTotal) * 100).toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
