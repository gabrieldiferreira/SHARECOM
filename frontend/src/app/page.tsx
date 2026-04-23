"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, Suspense, useMemo, useRef, useCallback } from "react";
import NextDynamic from "next/dynamic";
import { 
  Receipt, Coffee, ShoppingBag, Car, Home as HomeIcon, X, BarChart3, Plus, Loader2, CheckCircle2, 
  TrendingUp, TrendingDown, Landmark, Clock, Award, MessageSquare, Search, Filter, ChevronLeft, 
  ChevronRight, FileText, Info, Trash2, RotateCcw, CreditCard, Banknote, Smartphone, Users, 
  ShieldCheck, Fingerprint, FileSearch, Scale, Zap, Bell, ShieldAlert, Calendar as CalendarIcon, History, Tag, 
  Target, Activity, Layers, Cpu, Database, Settings, PieChart as PieChartIcon, Globe,
  Pencil, Save, Mail, DollarSign
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTransactionStore } from "../store/useTransactionStore";
import { TransactionEntity } from "../lib/db";
import { getApiUrl } from "../lib/api";
import { authenticatedFetch } from "../lib/auth";
import { useDashboardAgent, TemplateSentinel } from "../components/DashboardAgent";
import { useI18n } from "../i18n/client";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useHaptics } from "../hooks/useHaptics";
import { EmptyState } from "../components/EmptyState";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useToast } from "@/components/ui/Toast";


// Lazy load recharts — reduz o bundle inicial em ~200 KB
// Os gráficos só carregam após o conteúdo principal estar visível
const ChartPlaceholder = () => (
  <div className="h-full w-full flex items-center justify-center" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
    <Loader2 size={16} className="animate-spin mr-2" /> Carregando gráfico...
  </div>
);

const BarChart = NextDynamic(() => import('recharts').then(m => m.BarChart), { ssr: false, loading: ChartPlaceholder });
const Bar = NextDynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
const LineChart = NextDynamic(() => import('recharts').then(m => m.LineChart), { ssr: false });
const Line = NextDynamic(() => import('recharts').then(m => m.Line), { ssr: false });
const PieChart = NextDynamic(() => import('recharts').then(m => m.PieChart), { ssr: false });
const Pie = NextDynamic(() => import('recharts').then(m => m.Pie), { ssr: false });
const XAxis = NextDynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = NextDynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const ResponsiveContainer = NextDynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const Cell = NextDynamic(() => import('recharts').then(m => m.Cell), { ssr: false });
const Tooltip = NextDynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const CartesianGrid = NextDynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false });
const AreaChart = NextDynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false, loading: ChartPlaceholder });
const Area = NextDynamic(() => import('recharts').then(m => m.Area), { ssr: false });

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "eatingOut": <Coffee size={20} />,
  "groceries": <ShoppingBag size={20} />,
  "transport": <Car size={20} />,
  "home": <HomeIcon size={20} />,
  "services": <HomeIcon size={20} />,
  "leisure": <ShoppingBag size={20} />,
  "income": <Plus size={20} />,
  "others": <Receipt size={20} />,
  "health": <Receipt size={20} />,
  "education": <Receipt size={20} />,
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

  // i18n — locale-aware translations, currency & date formatting
  const { t, formatCurrency, formatDate: formatDateI18n, locale } = useI18n();

  // PWA Native Haptics
  const haptics = useHaptics();
  const { showToast } = useToast();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "duplicate" | "error">("idle");
  const [showTrash, setShowTrash] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [uploadType, setUploadType] = useState<"Inflow" | "Outflow">("Outflow");
  const [showManualModal, setShowManualModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7days' | 'month' | 'all'>('7days');
  
  type DashboardMode = "cashflow" | "entities" | "payment" | "temporal" | "category" | "forensics" | "tax" | "alerts";
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("cashflow");
  type ActiveTab = "home" | "analytics" | "goals" | "settings";
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); 
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedTxId, setExpandedTxId] = useState<string | number | null>(null);
  const itemsPerPage = 6;

  // ── Firebase user profile ──
  interface FirestoreUser { name: string; email: string; photoURL: string; locale: string; currency: string; createdAt: string; }
  const [fireUser, setFireUser]       = useState<FirestoreUser | null>(null);
  const [fireLoading, setFireLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', locale: 'pt-BR', currency: 'BRL' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [manualTx, setManualTx] = useState({
    merchant_name: "",
    total_amount: "",
    category: "others",
    transaction_type: "Outflow" as "Inflow" | "Outflow",
    payment_method: "pix",
    note: ""
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mock data generator for demo purposes
  const generateMockData = useCallback(async () => {
    const categories = ['Alimentação', 'Transporte', 'Compras', 'Casa', 'Lazer', 'Saúde'];
    const merchants = ['Starbucks', 'Uber', 'iFood', 'Carrefour', 'Netflix', 'Farmacia', 'Posto Shell', 'Restaurante'];
    const paymentMethods = ['PIX', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro'];
    
    const mockTransactions: TransactionEntity[] = [];
    const now = new Date();
    
    // Generate 50 transactions over the last 30 days
    for (let i = 0; i < 50; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const date = new Date(now);
      date.setDate(date.getDate() - daysAgo);
      date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
      
      const isInflow = Math.random() < 0.15; // 15% income
      
      mockTransactions.push({
        id: Date.now() + i,
        merchant_name: isInflow ? 'Salário' : merchants[Math.floor(Math.random() * merchants.length)],
        total_amount: isInflow ? 3000 + Math.random() * 2000 : 10 + Math.random() * 300,
        currency: 'BRL',
        transaction_date: date.toISOString(),
        transaction_type: isInflow ? 'Inflow' : 'Outflow',
        payment_method: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
        category: isInflow ? 'Receita' : categories[Math.floor(Math.random() * categories.length)],
        receipt_hash: `mock_${Date.now()}_${i}`,
        is_synced: false,
      });
    }
    
    // Add to store
    for (const tx of mockTransactions) {
      await addTransaction(tx);
    }
    
    showToast('50 transações de demonstração adicionadas!', 'success');
    await fetchTransactions();
  }, [addTransaction, fetchTransactions, showToast]);

  useEffect(() => {
    setMounted(true);
    const loadData = async () => {
      console.log('🔍 Debug Dashboard - Starting data load');
      console.log('Auth user:', auth?.currentUser?.uid);
      console.log('Date range:', dateRange);
      
      setIsLoadingData(true);
      setDashboardError(null);
      try {
        console.log('📌 Fetching transactions from IndexedDB...');
        await fetchTransactions();
        console.log('✅ Transactions fetched');
        
        console.log('🔄 Syncing with backend...');
        await syncWithBackend();
        console.log('✅ Backend sync complete');
      } catch (error) {
        console.error('💥 ERROR loading dashboard:', error);
        console.error('Error details:', {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        setDashboardError(
          error instanceof Error && error.message === 'AUTH_REQUIRED'
            ? 'Sua sessao ainda esta sendo inicializada. Tente novamente em alguns segundos.'
            : 'Nao foi possivel carregar o dashboard agora.',
        );
      } finally {
        setIsLoadingData(false);
        console.log('🏁 Data load complete');
      }
    };
    loadData();
  }, [fetchTransactions, syncWithBackend]);

  // Load Firebase user profile
  useEffect(() => {
    if (!auth) { setFireLoading(false); return; }
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser || !db) { setFireLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        const data = snap.data() ?? {};
        const merged: FirestoreUser = {
          name:      data.name      || currentUser.displayName || '',
          email:     data.email     || currentUser.email       || '',
          photoURL:  data.photoURL  || currentUser.photoURL   || '',
          locale:    data.locale    || 'pt-BR',
          currency:  data.currency  || 'BRL',
          createdAt: data.createdAt || '',
        };
        setFireUser(merged);
        setProfileForm({ name: merged.name, locale: merged.locale, currency: merged.currency });
      } catch (e) {
        console.error('Erro ao carregar perfil:', e);
      } finally {
        setFireLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const handleSaveProfile = async () => {
    const currentUser = auth?.currentUser;
    if (!currentUser || !db) return;
    setIsSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        name:      profileForm.name,
        locale:    profileForm.locale,
        currency:  profileForm.currency,
        updatedAt: new Date().toISOString(),
      });
      document.cookie = `NEXT_LOCALE=${profileForm.locale}; path=/; max-age=${60*60*24*365}`;
      document.cookie = `CURRENCY=${profileForm.currency}; path=/; max-age=${60*60*24*365}`;
      localStorage.setItem('USER_CURRENCY', profileForm.currency);
      setFireUser(prev => prev ? { ...prev, ...profileForm } : prev);
      setIsEditingProfile(false);
      showToast('Perfil atualizado!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Erro ao salvar perfil.', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Filter transactions by date range
  const getDateFilter = useCallback(() => {
    const now = new Date();
    if (dateRange === '7days') {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);
      return sevenDaysAgo;
    }
    if (dateRange === 'month') {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return new Date(0); // 'all' - beginning of time
  }, [dateRange]);

  const filteredByDate = useMemo(() => {
    const startDate = getDateFilter();
    console.log('📅 Filtering transactions by date:', { dateRange, startDate: startDate.toISOString(), totalTxs: transactions.length });
    const filtered = transactions.filter(tx => {
      const txDate = new Date(tx.transaction_date);
      if (isNaN(txDate.getTime())) return true; // Include invalid dates rather than hiding them
      return txDate >= startDate;
    });
    console.log('📅 Filtered result:', { filtered: filtered.length, outflow: filtered.filter(t => t.transaction_type === 'Outflow').length });
    return filtered;
  }, [transactions, getDateFilter, dateRange]);


  const filteredTransactions = useMemo(() => {
    return filteredByDate.filter(tx => {
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
  }, [filteredByDate, searchQuery, activeFilter]);

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
     haptics.success();
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
    haptics.mediumTap();
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
           showToast("O backend está rodando, mas a GEMINI_API_KEY está ausente ou inválida. Configure o .env", "error");
           setIsUploading(false);
           return;
        }
        if (ai.merchant_name && ai.merchant_name.includes("Limite Gemini atingido")) {
          showToast("Limite de uso da API Gemini atingido. Aguarde o reset da cota ou troque para um plano com mais capacidade.", "error");
          setIsUploading(false);
          return;
        }

        // Parse date safely
        let parsedDate = new Date().toISOString();
        if (ai.transaction_date) {
           const d = new Date(ai.transaction_date);
           if (!isNaN(d.getTime())) parsedDate = d.toISOString();
        }

        // Parse amount safely
        let parsedAmount = 0;
        if (typeof ai.total_amount === 'string') {
           parsedAmount = parseFloat(ai.total_amount.replace(/[^\d.,]/g, '').replace(',', '.'));
        } else if (typeof ai.total_amount === 'number') {
           parsedAmount = ai.total_amount;
        }

        const newTx: TransactionEntity = {
          id: data.database_id, 
          total_amount: isNaN(parsedAmount) ? 0 : parsedAmount,
          merchant_name: ai.merchant_name || 'Desconhecido',
          category: ai.smart_category || 'Outros',
          currency: 'BRL',
          transaction_date: parsedDate,
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
        haptics.success();
        setUploadStatus(result.isDuplicate ? "duplicate" : "success");
        setTimeout(() => setUploadStatus("idle"), 3000);
      } else {
        haptics.error();
        if (response.status === 401) {
          showToast("Sua sessão expirou. Faça login novamente para continuar.", "error");
          return;
        }
        try {
          const errorText = await response.text();
          const errObj = JSON.parse(errorText);
          if (errObj.detail) { showToast(`Falha: ${errObj.detail}`, 'error'); return; }
        } catch (e) {}
        showToast("Falha ao processar o recibo automaticamente.", "error");
      }
    } catch (e) {
      console.error("Upload error:", e);
      if (e instanceof Error && e.message === "AUTH_REQUIRED") {
        showToast("Você precisa estar autenticado para enviar recibos.", "error");
      } else {
        showToast("Erro ao conectar com o servidor. Verifique sua internet.", "error");
      }
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
      setPendingNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Use i18n-aware formatting — locale switches automatically on language change
  const formatDate = (dateStr: string) => formatDateI18n(dateStr, 'PP p');


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
      const isLegal = !!(tx.masked_cpf || tx.merchant_name?.toUpperCase().includes(' LTDA') || tx.merchant_name?.toUpperCase().includes(' S.A'));
      
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
      { label: t('fields.merchant'), value: tx.merchant_name },
      { label: t('fields.category'), value: t(`categories.${tx.category}`).replace('categories.', '') },
      { label: t('fields.amount'), value: formatCurrency(tx.total_amount) },
      { label: t('fields.date'), value: formatDate(tx.transaction_date) },
      { label: t('fields.type'), value: tx.transaction_type === 'Inflow' ? t('fields.inflow') : t('fields.outflow') },
      { label: t('fields.payment'), value: tx.payment_method },
      { label: t('fields.institution'), value: tx.destination_institution },
      { label: t('fields.transactionId'), value: tx.transaction_id },
      { label: t('fields.maskedCpf'), value: tx.masked_cpf },
      { label: t('fields.description'), value: tx.description },
      { label: t('fields.note'), value: tx.note },
      { label: t('fields.hash'), value: tx.receipt_hash },
      { label: t('fields.sync'), value: tx.is_synced ? t('fields.synced') : t('fields.pending') },
      { label: t('fields.review'), value: tx.needs_manual_review ? t('fields.needed') : undefined },
    ];

    return fields.filter((field) => field.value !== undefined && field.value !== null && String(field.value).trim() !== '');
  };

  const categoriesData = useMemo(() => {
    console.log('📊 Calculating categoriesData from', filteredByDate.length, 'transactions');
    const map: Record<string, number> = {};
    filteredByDate.forEach(tx => {
        if(tx.transaction_type === 'Outflow' && tx.total_amount) {
            map[tx.category] = (map[tx.category] || 0) + (Number(tx.total_amount) || 0);
        }
    });
    const result = Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value);
    console.log('📊 Categories calculated:', result.length, 'categories');
    return result;
  }, [filteredByDate]);

  const growthData = useMemo(() => {
     let current = 0;
     const sorted = [...filteredByDate]
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
  }, [filteredByDate]);

  const dailyInsights = useMemo(() => {
    const today = new Date().toLocaleDateString('sv-SE');
    const todayTxs = filteredByDate.filter(tx => tx.transaction_date && new Date(tx.transaction_date).toLocaleDateString('sv-SE') === today);
    const todayInflow = todayTxs.reduce((acc, tx) => tx.transaction_type === "Inflow" ? acc + tx.total_amount : acc, 0);
    const todayOutflow = todayTxs.reduce((acc, tx) => tx.transaction_type === "Outflow" ? acc + tx.total_amount : acc, 0);
    const delta = todayInflow - todayOutflow;
    return {
      delta, absDelta: Math.abs(delta),
      message: delta > 0 ? t('dashboard.richer') : (delta < 0 ? t('dashboard.poorer') : t('dashboard.stable')),
      isPositive: delta >= 0
    };
  }, [filteredByDate, t]);

  const weekdayIntensity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2023, 0, 1 + i); // Jan 1, 2023 was a Sunday
      return formatDateI18n(d, 'EEEEEE');
    });
    const intensity = [0, 0, 0, 0, 0, 0, 0];
    filteredByDate.forEach(tx => {
      const date = new Date(tx.transaction_date);
      if (!isNaN(date.getTime())) intensity[date.getDay()] += tx.total_amount;
    });
    return days.map((day, i) => ({ day, val: intensity[i] }));
  }, [filteredByDate, formatDateI18n]);

  const paymentMethodsData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredByDate.forEach(tx => {
      if (tx.transaction_type === 'Outflow') {
        const method = tx.payment_method || 'Outros';
        map[method] = (map[method] || 0) + tx.total_amount;
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredByDate]);

  const inflowCount = useMemo(() => filteredByDate.filter(t => t.transaction_type === 'Inflow').length, [filteredByDate]);
  const outflowCount = useMemo(() => filteredByDate.filter(t => t.transaction_type === 'Outflow').length, [filteredByDate]);
  const totalInflowFiltered = useMemo(() => filteredByDate.reduce((acc, tx) => {
    const type = (tx.transaction_type || '').toLowerCase();
    const isInflow = type === 'inflow' || type === 'entrada' || tx.category === 'Receita';
    return isInflow ? acc + Number(tx.total_amount || 0) : acc;
  }, 0), [filteredByDate]);
  
  const totalOutflowFiltered = useMemo(() => filteredByDate.reduce((acc, tx) => {
    const type = (tx.transaction_type || '').toLowerCase();
    const isInflow = type === 'inflow' || type === 'entrada' || tx.category === 'Receita';
    return !isInflow ? acc + Number(tx.total_amount || 0) : acc;
  }, 0), [filteredByDate]);
  const avgOutflow = outflowCount > 0 ? totalOutflowFiltered / outflowCount : 0;
  const avgInflow = inflowCount > 0 ? totalInflowFiltered / inflowCount : 0;
  const balanceFiltered = totalInflowFiltered - totalOutflowFiltered;

  const temporalData = useMemo(() => {
    console.log('🕒 Calculating temporalData from', filteredByDate.length, 'transactions');
    const hourlyMap = Array(24).fill(0);
    const dayOfMonthMap: Record<number, number> = {};
    const monthlyMap: Record<string, number> = {};
    
    let outflowCount = 0;
    filteredByDate.forEach(tx => {
      if (tx.transaction_type !== 'Outflow') return;
      outflowCount++;
      const date = new Date(tx.transaction_date);
      if (isNaN(date.getTime())) return;
      
      const hour = date.getHours();
      hourlyMap[hour] += tx.total_amount;
      
      const dom = date.getDate();
      dayOfMonthMap[dom] = (dayOfMonthMap[dom] || 0) + tx.total_amount;

      const month = date.toLocaleString('pt-BR', { month: 'short' });
      monthlyMap[month] = (monthlyMap[month] || 0) + tx.total_amount;
    });

    const result = {
      hourly: hourlyMap.map((val, hour) => ({ hour: `${hour}h`, val })),
      daily: Object.entries(dayOfMonthMap).map(([day, val]) => ({ day: parseInt(day), val })).sort((a,b) => a.day - b.day),
      seasonal: Object.entries(monthlyMap).map(([month, val]) => ({ month, val }))
    };
    console.log('🕒 Temporal data calculated:', { outflowTxs: outflowCount, hourlyNonZero: result.hourly.filter(h => h.val > 0).length });
    return result;
  }, [filteredByDate]);

  const forensicsData = useMemo(() => {
    const duplicates = transactions.filter((tx, idx) => 
      transactions.findIndex(t => t.merchant_name === tx.merchant_name && t.total_amount === tx.total_amount && t.transaction_date.split('T')[0] === tx.transaction_date.split('T')[0]) !== idx
    );

    const highReliability = transactions.filter(t => t.is_synced && !t.needs_manual_review).length;
    const lowReliability = transactions.filter(t => t.needs_manual_review).length;

    return {
      duplicates,
      reliabilityScore: transactions.length > 0 ? (highReliability / transactions.length) * 100 : 0,
      totalReviewPending: lowReliability,
      authCodes: transactions.filter(t => t.transaction_id).map(t => ({ id: t.id, code: t.transaction_id, merchant: t.merchant_name }))
    };
  }, [transactions]);

  const taxData = useMemo(() => {
    const map: Record<string, { total: number; count: number; name: string }> = {};
    transactions.forEach(tx => {
      const key = tx.masked_cpf || "N/A";
      if (!map[key]) map[key] = { total: 0, count: 0, name: tx.merchant_name || 'N/A' };
      map[key].total += tx.total_amount;
      map[key].count += 1;
    });
    
    const deductibleKeywords = ['SAUDE', 'MEDICO', 'CLINICA', 'DENTISTA', 'HOSPITAL', 'EDUCACAO', 'ESCOLA', 'FACULDADE', 'LIVRARIA'];
    const deductibleCandidates = transactions.filter(tx => 
      deductibleKeywords.some(k => (tx.merchant_name || '').toUpperCase().includes(k)) || 
      ['health', 'education'].includes(tx.category)
    );

    return {
      byEntity: Object.entries(map).map(([id, data]) => ({ id, ...data })).sort((a,b) => b.total - a.total),
      deductibleTotal: deductibleCandidates.reduce((acc, tx) => acc + tx.total_amount, 0),
      deductibleCandidates
    };
  }, [transactions]);

  const smartAlerts = useMemo(() => {
    const list: {id:string; type:'warning'|'info'|'critical'; title:string; message:string; icon:React.ReactNode}[] = [];
    
    // Anomaly Detection: Unusual high amount (> 3x average)
    const avg = totalOutflow / (outflowCount || 1);
    transactions.forEach(tx => {
      if (tx.transaction_type === 'Outflow' && tx.total_amount > avg * 3 && tx.total_amount > 500) {
        list.push({
          id: `anomaly-${tx.id}`,
          type: 'warning',
          title: 'Valor Incomum Detectado',
          message: `${tx.merchant_name}: R$ ${tx.total_amount.toLocaleString('pt-BR')} (3x acima da sua média).`,
          icon: <ShieldAlert className="text-amber-500" />
        });
      }
    });

    // First time recipient
    const counts: Record<string, number> = {};
    transactions.forEach(tx => { counts[tx.merchant_name] = (counts[tx.merchant_name] || 0) + 1; });
    const newest = mostRecentReceipt;
    if (newest && counts[newest.merchant_name] === 1) {
      list.push({
        id: 'new-recipient',
        type: 'info',
        title: 'Novo Destinatário',
        message: `Esta é sua primeira transação com ${newest.merchant_name}.`,
        icon: <Zap className="text-blue-500" />
      });
    }

    // High Frequency Detector (e.g., > 2 tx to same merchant in last 48h)
    const merchantActivity: Record<string, number> = {};
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    transactions.forEach(tx => {
      if (new Date(tx.transaction_date) > twoDaysAgo) {
        merchantActivity[tx.merchant_name] = (merchantActivity[tx.merchant_name] || 0) + 1;
      }
    });

    Object.entries(merchantActivity).forEach(([merchant, count]) => {
      if (count > 2) {
        list.push({
          id: `freq-${merchant}`,
          type: 'warning',
          title: 'Alta Frequência Detectada',
          message: `Detectamos ${count} transações para ${merchant} em menos de 48h.`,
          icon: <Activity className="text-amber-500" />
        });
      }
    });

    // Recurring Transaction Detector
    const recurringMap: Record<string, number[]> = {};
    transactions.forEach(tx => {
      if (tx.transaction_type === 'Outflow') {
        if (!recurringMap[tx.merchant_name]) recurringMap[tx.merchant_name] = [];
        recurringMap[tx.merchant_name].push(tx.total_amount);
      }
    });

    Object.entries(recurringMap).forEach(([merchant, amounts]) => {
      if (amounts.length >= 2) {
        const first = amounts[0];
        const allSame = amounts.every(a => Math.abs(a - first) < 2); // Within R$ 2 margin
        if (allSame) {
          list.push({
            id: `recur-${merchant}`,
            type: 'info',
            title: 'Assinatura/Recorrência',
            message: `Identificamos padrão de recorrência para ${merchant}.`,
            icon: <History className="text-blue-500" />
          });
        }
      }
    });

    // Balance threshold
    if (balance < 500 && balance > 0) {
      list.push({
        id: 'low-balance',
        type: 'critical',
        title: 'Saldo em Alerta',
        message: 'Seu saldo atual está abaixo de R$ 500,00.',
        icon: <Bell className="text-red-500" />
      });
    }

    return list;
  }, [transactions, totalOutflow, outflowCount, balance, mostRecentReceipt]);

  const alerts = smartAlerts; // Refactor the old alerts to use smartAlerts logic

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
              haptics.swipe();
              moveToTrash(tx.id);
            }
          }}
          onClick={() => {
            haptics.lightTap();
            setExpandedTxId(isExpanded ? null : (tx.id || null));
          }}
          className={`relative z-10 rounded-xl border-thin border-ds-border bg-ds-bg-secondary p-4 space-y-4 cursor-pointer transition-all hover:border-fn-balance/30 ${isExpanded ? 'ring-1 ring-fn-balance/20' : ''}`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-ds-bg-primary border-thin border-ds-border flex items-center justify-center text-ds-text-tertiary shrink-0">
                  {CATEGORY_ICONS[tx.category] || <Receipt size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-ds-text-tertiary uppercase tracking-widest font-bold mb-0.5">Destinatário</p>
                  <p className="text-[16px] font-semibold text-ds-text-primary truncate leading-tight">{tx.merchant_name || 'Desconhecido'}</p>
                  <p className="text-[12px] text-ds-text-tertiary mt-0.5 truncate">{formatDate(tx.transaction_date)}</p>
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
                <p className="italic">Arraste para a esquerda para apagar</p>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tx.id) moveToTrash(tx.id);
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

  if (!mounted || isLoadingData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4 bg-ds-bg-primary">
        <Loader2 size={40} className="animate-spin text-fn-balance" />
        <p className="text-[14px] font-medium text-ds-text-secondary animate-pulse">{t('common.syncingData')}</p>
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ds-bg-primary px-6">
        <div className="max-w-md rounded-2xl border-thin border-ds-border bg-ds-bg-secondary p-6 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-fn-expense">
            <Info size={20} />
          </div>
          <div className="space-y-2">
            <h1 className="text-lg font-semibold text-ds-text-primary">Erro ao carregar dashboard</h1>
            <p className="text-sm text-ds-text-secondary">{dashboardError}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-xl bg-fn-balance px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{
      paddingTop: 'max(1rem, env(safe-area-inset-top))',
      paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom)))',
      paddingLeft: 'max(1rem, env(safe-area-inset-left))',
      paddingRight: 'max(1rem, env(safe-area-inset-right))',
    }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-[1920px]">
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelection} className="hidden" />
      
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
        <div className="space-y-4 sm:space-y-6">
          {/* Header Section - Responsive */}
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              
              {/* TOP ROW: Title + Mobile Avatar */}
              <div className="flex items-start justify-between w-full lg:w-auto">
                <div className="space-y-1">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-medium text-ds-text-primary">{t('dashboard.title')}</h1>
                    <p className="text-[10px] sm:text-[11px] lg:text-[12px] text-ds-text-secondary uppercase tracking-[0.2em] font-bold">{t('dashboard.subtitle')}</p>
                </div>
                
                {/* Avatar (Mobile only here, top right) */}
                <div className="flex lg:hidden items-center ml-4">
                  {fireUser?.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fireUser.photoURL}
                      alt="Perfil"
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full border border-brand-purple/50 object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-brand-purple flex items-center justify-center text-white text-[14px] font-bold flex-shrink-0">
                      {fireUser?.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>
              </div>

              {/* BOTTOM ROW: Actions + Greeting/Avatar */}
              <div className="flex items-center justify-between lg:justify-end gap-2 sm:gap-3 w-full lg:w-auto">
                  
                  {/* Left side on mobile (Trash + Novo Comprovante) */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button 
                      onClick={() => setShowTrash(true)}
                      className="relative p-2 sm:p-2.5 rounded-xl bg-ds-bg-secondary border-thin border-ds-border text-ds-text-secondary hover:text-fn-expense transition-all hover:bg-ds-bg-primary touch-manipulation"
                    >
                      <Trash2 size={18} className="sm:w-5 sm:h-5" />
                      {trashTransactions.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 text-white text-[9px] sm:text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-ds-bg-primary shadow-lg">
                          {trashTransactions.length}
                        </span>
                      )}
                    </button>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-fn-balance text-white rounded-xl font-bold text-[11px] sm:text-[13px] shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all touch-manipulation"
                    >
                      <Plus size={16} className="sm:w-[18px] sm:h-[18px]" />
                      <span className="inline">NOVO</span>
                      <span className="hidden sm:inline">COMPROVANTE</span>
                    </button>
                  </div>
                  
                  {/* Right side on mobile (Greeting) / Right side on desktop (Avatar) */}
                  <div className="flex items-center gap-2 pl-3 lg:ml-2 lg:border-l border-ds-border text-right">
                    
                    {/* Greeting (Mobile only) */}
                    <div className="lg:hidden flex flex-col justify-center leading-tight">
                      <p className="text-[10px] text-text-tertiary">
                        {(() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })()},
                      </p>
                      <p className="text-[12px] font-semibold text-text-primary max-w-[120px] truncate">
                        {fireUser?.name ? fireUser.name.split(' ').slice(0, 2).join(' ') : ''}
                      </p>
                    </div>

                    {/* Avatar (Desktop only) */}
                    <div className="hidden lg:flex items-center">
                      {fireUser?.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={fireUser.photoURL}
                          alt="Perfil"
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full border border-brand-purple/50 object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-brand-purple flex items-center justify-center text-white text-[14px] font-bold flex-shrink-0">
                          {fireUser?.name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                    </div>
                  </div>

              </div>
            </div>

            {/* DESKTOP TOP NAVIGATION BAR */}
            <div className="hidden lg:flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <Cpu size={14} className="text-brand-cyan" />
                <span className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.3em]">Navigation</span>
              </div>
              <div className="flex items-center gap-2 bg-glass-card p-1.5 rounded-2xl border-thin border-glass-border overflow-x-auto no-scrollbar">
                {[
                  { id: "home", label: t('nav.home'), icon: <HomeIcon size={14} /> },
                  { id: "analytics", label: t('nav.analytics'), icon: <PieChartIcon size={14} /> },
                  { id: "goals", label: t('nav.goals'), icon: <Target size={14} /> },
                  { id: "settings", label: t('nav.settings'), icon: <Settings size={14} /> }
                ].map((tab) => (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as ActiveTab)} 
                    className={`flex items-center gap-2 px-3 xl:px-4 py-2.5 text-[11px] xl:text-[12px] font-bold rounded-xl transition-all whitespace-nowrap touch-manipulation ${activeTab === tab.id ? "bg-glass-highlight text-text-primary shadow-glow ring-1 ring-white/10" : "text-text-secondary hover:text-text-primary hover:bg-white/5"}`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
                {/* Compact controls: language */}
                <div className="ml-auto pl-2 border-l border-glass-border flex items-center gap-1.5">
                  <LanguageSwitcher compact />
                </div>
              </div>
            </div>
          </div>


          {/* TAB 1: HOME */}
          {activeTab === "home" && (
            <div className="@container space-y-4 sm:space-y-6 stagger-children">
              
              {/* DATE RANGE FILTER TABS + USER GREETING */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
                <button
                  onClick={() => setDateRange('7days')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                    dateRange === '7days'
                      ? 'bg-accent-purple text-white shadow-lg'
                      : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary border border-border'
                  }`}
                >
                  Últimos 7 dias
                </button>
                <button
                  onClick={() => setDateRange('month')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                    dateRange === 'month'
                      ? 'bg-accent-purple text-white shadow-lg'
                      : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary border border-border'
                  }`}
                >
                  Este mês
                </button>
                <button
                  onClick={() => setDateRange('all')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                    dateRange === 'all'
                      ? 'bg-accent-purple text-white shadow-lg'
                      : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary border border-border'
                  }`}
                >
                  Todos
                </button>

                {/* Transaction count indicator */}
                <div className="ml-4 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border text-xs text-text-tertiary whitespace-nowrap">
                  {transactions.length} total | {filteredByDate.length} filtradas
                </div>
                
                {/* Mock data button (only show if no transactions) */}
                {transactions.length === 0 && (
                  <button
                    onClick={generateMockData}
                    className="ml-2 px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs font-semibold hover:bg-purple-500/30 transition-colors whitespace-nowrap"
                  >
                    🎲 Gerar Dados Demo
                  </button>
                )}

                {/* Greeting text only (Desktop only) */}
                <div className="ml-auto hidden lg:flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap">
                  <span className="text-[14px] text-text-secondary">
                    {(() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })()},{' '}
                    <span className="font-semibold text-text-primary">{fireUser?.name ?? ''}</span>
                  </span>
                </div>
              </div>

              {/* (1) HERO BALANCE CARD - Responsive */}
              <div className="relative overflow-hidden rounded-2xl sm:rounded-[20px] p-4 sm:p-6 lg:p-8 text-white shadow-glass-lg bg-brand-bg border-thin border-glass-border">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-purple/40 via-brand-pink/15 to-transparent pointer-events-none"></div>
                <div className="absolute -top-20 -right-20 w-40 sm:w-60 h-40 sm:h-60 rounded-full bg-brand-purple/10 blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-10 -left-10 w-32 sm:w-40 h-32 sm:h-40 rounded-full bg-brand-pink/10 blur-3xl pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col items-center py-3 sm:py-4 lg:py-8 text-center">
                  <span className="text-[10px] sm:text-[11px] lg:text-[12px] font-semibold text-text-tertiary mb-2 sm:mb-3 uppercase tracking-[0.2em] sm:tracking-[0.3em]">{t('dashboard.totalBalance')}</span>
                  <div className="text-[32px] sm:text-[40px] lg:text-hero font-black tracking-tight leading-none text-shadow-glow tabular-nums">
                    <span className="text-text-primary">R$ {Math.floor(balanceFiltered).toLocaleString('pt-BR')}</span>
                    <span className="text-text-tertiary">,{(balanceFiltered % 1).toFixed(2).substring(2)}</span>
                  </div>
                  <div className={`mt-3 sm:mt-5 inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-glass-highlight border-thin border-glass-border text-[11px] sm:text-[12px] font-semibold backdrop-blur-md ${dailyInsights.isPositive ? 'text-brand-green' : 'text-brand-red'}`}>
                    {dailyInsights.isPositive ? <TrendingUp size={12} className="sm:w-[14px] sm:h-[14px]" /> : <TrendingDown size={12} className="sm:w-[14px] sm:h-[14px]" />}
                    <span>{dailyInsights.isPositive ? '+' : '-'}R$ {dailyInsights.absDelta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {t('common.today').toLowerCase()}</span>
                  </div>
                </div>

                {/* Mini Accounts Carousel - Horizontal Scroll with Snap */}
                <div className="relative z-10 mt-4 sm:mt-6 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 overflow-x-auto no-scrollbar snap-x snap-mandatory flex gap-2 sm:gap-3 pb-2" style={{ scrollSnapType: 'x mandatory' }}>
                  {[
                    { name: 'Nubank', balance: totalInflowFiltered * 0.6, mask: '•••• 1234', color: '#8B5CF6' },
                    { name: 'Itaú', balance: totalInflowFiltered * 0.3, mask: '•••• 8876', color: '#FB923C' },
                    { name: 'Inter', balance: totalInflowFiltered * 0.1, mask: '•••• 0092', color: '#06B6D4' }
                  ].map((acc, i) => (
                    <div key={i} className="snap-center shrink-0 w-[140px] sm:w-[160px] p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-glass-card border-thin border-glass-border backdrop-blur-md flex flex-col hover:-translate-y-1 transition-transform cursor-pointer group touch-manipulation">
                      <div className="flex justify-between items-start mb-1.5 sm:mb-2">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full" style={{ backgroundColor: acc.color }}></div>
                          <span className="text-[11px] sm:text-[12px] font-bold text-text-secondary">{acc.name}</span>
                        </div>
                        <Settings size={9} className="sm:w-[10px] sm:h-[10px] text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <span className="text-[14px] sm:text-[16px] font-bold text-text-primary tabular-nums">R$ {acc.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <span className="text-[9px] sm:text-[10px] text-text-tertiary font-mono mt-0.5 sm:mt-1">{acc.mask}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* (2) METRIC GRID - Responsive 2x2 mobile, 2x2 tablet, 4x1 desktop */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                {[
                  { label: t('common.income'), value: totalInflowFiltered, trend: inflowCount > 0 ? `${inflowCount} tx` : "0", icon: <TrendingUp size={11} className="sm:w-3 sm:h-3" />, color: "#10B981" },
                  { label: t('common.expense'), value: totalOutflowFiltered, trend: outflowCount > 0 ? `${outflowCount} tx` : "0", icon: <TrendingDown size={11} className="sm:w-3 sm:h-3" />, color: "#EF4444" },
                  { label: t('dashboard.avgTicket'), value: avgOutflow, trend: t('dashboard.perTx'), icon: <BarChart3 size={11} className="sm:w-3 sm:h-3" />, color: "#8B5CF6" },
                  { label: t('dashboard.netFlow'), value: Math.abs(balanceFiltered), trend: balanceFiltered >= 0 ? t('dashboard.positive') : t('dashboard.negative'), icon: balanceFiltered >= 0 ? <TrendingUp size={11} className="sm:w-3 sm:h-3" /> : <TrendingDown size={11} className="sm:w-3 sm:h-3" />, color: balanceFiltered >= 0 ? "#10B981" : "#EF4444" }
                ].map((metric, i) => (
                  <div key={i} className="glass-card p-3 sm:p-4 lg:p-5 flex flex-col justify-between group @container">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[11px] sm:text-[12px] lg:text-[14px] font-medium text-text-secondary leading-tight">{metric.label}</span>
                      <div className="flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] font-bold shrink-0" style={{ color: metric.color }}>
                        {metric.icon} <span className="hidden @[120px]:inline">{metric.trend}</span>
                      </div>
                    </div>
                    <div className="mt-2 sm:mt-3 mb-1">
                      <span className="text-[16px] sm:text-[20px] lg:text-val-xl font-semibold text-text-primary leading-none tabular-nums block truncate">R$ {metric.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="h-[40px] sm:h-[50px] lg:h-[60px] w-full mt-1 sm:mt-2 opacity-40 group-hover:opacity-100 transition-opacity">
                      {/* @ts-expect-error - Dynamically imported Recharts components */}
                      <ResponsiveContainer width="100%" height="100%">
                        {/* @ts-expect-error - Dynamically imported Recharts components */}
                        <AreaChart data={growthData.slice(-10)}>
                          <defs>
                            <linearGradient id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={metric.color} stopOpacity={0.5}/>
                              <stop offset="95%" stopColor={metric.color} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          {/* @ts-expect-error - Dynamically imported Recharts components */}
                          <Area type="monotone" dataKey="capital" stroke={metric.color} strokeWidth={2} fillOpacity={1} fill={`url(#grad${i})`} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>

              {/* (5) TRANSACTIONS TABLE - Responsive */}
              <div className="glass-card-static overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-glass-border flex flex-col xs:flex-row justify-between items-start xs:items-center gap-2">
                  <h3 className="text-[14px] sm:text-[16px] font-semibold text-text-primary">{t('dashboard.recentTransactions')}</h3>
                  <button onClick={() => setActiveTab("analytics")} className="text-[11px] sm:text-[12px] font-medium text-brand-cyan hover:underline touch-manipulation" aria-label="View all transactions">{t('common.viewAll')}</button>
                </div>
                <div className="divide-y divide-[rgba(255,255,255,0.05)] stagger-children">
                  {filteredByDate.slice(0, 6).map(tx => (
                    <div key={tx.id} className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:bg-glass-highlight transition-colors cursor-pointer group touch-manipulation">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-glass-card border-thin border-glass-border flex items-center justify-center text-text-primary shrink-0 group-hover:scale-110 transition-transform">
                         {CATEGORY_ICONS[tx.category] || <ShoppingBag size={14} className="sm:w-4 sm:h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] sm:text-[14px] font-medium text-text-primary truncate">{tx.merchant_name}</p>
                        <p className="text-[11px] sm:text-[12px] text-text-tertiary mt-0.5 truncate">{formatDate(tx.transaction_date)}</p>
                      </div>
                      <div className="hidden sm:block shrink-0">
                        <span className="text-[10px] sm:text-[11px] text-text-tertiary">{t(`categories.${tx.category}`).replace('categories.', '')}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-[14px] sm:text-[16px] font-semibold tabular-nums ${tx.transaction_type === 'Inflow' ? 'text-brand-green' : 'text-text-primary'}`}>
                          {tx.transaction_type === 'Inflow' ? '+' : '-'}R$ {tx.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ANALYTICS */}
          {activeTab === "analytics" && (
            <div className="@container space-y-6 stagger-children">
              {/* (3) SPENDING CHART */}
              <div className="glass-card-static p-5 md:p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-[16px] font-semibold text-text-primary">{t('dashboard.spendingOverview')}</h2>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setDateRange('7days')}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold flex items-center gap-1.5 transition-colors ${
                        dateRange === '7days' 
                          ? 'bg-brand-purple/20 text-brand-purple border border-brand-purple/30' 
                          : 'bg-bg-tertiary text-text-tertiary hover:bg-bg-secondary border border-border'
                      }`}
                    >
                      <CalendarIcon size={12} />
                      <span>7 dias</span>
                    </button>
                    <button 
                      onClick={() => setDateRange('month')}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold flex items-center gap-1.5 transition-colors ${
                        dateRange === 'month' 
                          ? 'bg-brand-orange/20 text-brand-orange border border-brand-orange/30' 
                          : 'bg-bg-tertiary text-text-tertiary hover:bg-bg-secondary border border-border'
                      }`}
                    >
                      <CalendarIcon size={12} />
                      <span>Este mês</span>
                    </button>
                    <button 
                      onClick={() => setDateRange('all')}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold flex items-center gap-1.5 transition-colors ${
                        dateRange === 'all' 
                          ? 'bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30' 
                          : 'bg-bg-tertiary text-text-tertiary hover:bg-bg-secondary border border-border'
                      }`}
                    >
                      <CalendarIcon size={12} />
                      <span>Todos</span>
                    </button>
                  </div>
                </div>
                <div className="h-[200px] md:h-[300px] xl:h-[400px] w-full min-w-0">
                  {temporalData.hourly.every(d => d.val === 0) ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                      <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
                        <BarChart3 size={32} className="text-purple-400" />
                      </div>
                      <p className="text-text-secondary text-sm font-medium mb-2">
                        {t('dashboard.noSpendingData')}
                      </p>
                      <p className="text-text-tertiary text-xs">
                        {t('dashboard.addTransactionsToSeeChart')}
                      </p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      {/* @ts-expect-error - Dynamically imported Recharts components */}
                      <BarChart data={temporalData.hourly} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        {/* @ts-expect-error - Dynamically imported Recharts components */}
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        {/* @ts-expect-error - Dynamically imported Recharts components */}
                        <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} />
                        {/* @ts-expect-error - Dynamically imported Recharts components */}
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                        {/* @ts-expect-error - Dynamically imported Recharts components */}
                        <Tooltip contentStyle={{ backgroundColor: '#0D0D12', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '12px', color: '#fff' }} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
                        {/* @ts-expect-error - Dynamically imported Recharts components */}
                        <Bar dataKey="val" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* (4) CATEGORY BREAKDOWN & (8) STATISTICS (Donut) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Categories */}
                 <div className="glass-card-static p-5 md:p-6">
                    <h2 className="text-[16px] font-semibold text-text-primary mb-5">{t('dashboard.topCategories')}</h2>
                    {categoriesData.length === 0 ? (
                      <div className="h-[280px] flex flex-col items-center justify-center text-center px-4">
                        <div className="w-14 h-14 rounded-2xl bg-pink-500/10 flex items-center justify-center mb-3">
                          <PieChartIcon size={28} className="text-pink-400" />
                        </div>
                        <p className="text-text-secondary text-sm font-medium mb-1">
                          {t('dashboard.noCategoryData')}
                        </p>
                        <p className="text-text-tertiary text-xs">
                          {t('dashboard.categoriesWillAppearHere')}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 stagger-children">
                        {categoriesData.slice(0, 5).map((cat, i) => {
                         const pct = totalOutflow > 0 ? (cat.value / totalOutflow) * 100 : 0;
                         return (
                            <div key={i} className="p-4 rounded-[16px] bg-glass-highlight border-thin border-glass-border hover:border-brand-purple/30 hover:shadow-glow transition-all cursor-pointer flex items-center justify-between group">
                               <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}>
                                     {CATEGORY_ICONS[cat.name] || <Tag size={16} />}
                                  </div>
                                  <div>
                                     <p className="text-[14px] font-semibold text-text-primary">{t(`categories.${cat.name}`).replace('categories.', '')}</p>
                                     <p className="text-[12px] text-text-tertiary mt-0.5">R$ {cat.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                  </div>
                               </div>
                               <div className="text-right">
                                  <p className="text-[18px] font-bold text-text-primary tabular-nums">{pct.toFixed(0)}%</p>
                                  {/* Mini progress bar */}
                                  <div className="w-16 h-1.5 bg-brand-bg rounded-full overflow-hidden mt-1.5">
                                    <div className="h-full rounded-full animate-fill-progress" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></div>
                                  </div>
                               </div>
                            </div>
                         );
                      })}
                    </div>
                    )}
                 </div>

                 {/* Donut Chart */}
                 <div className="glass-card-static p-5 md:p-6 flex flex-col justify-between">
                    <h2 className="text-[16px] font-semibold text-text-primary mb-4">{t('dashboard.distribution')}</h2>
                    <div className="h-[220px] md:h-[250px] w-full relative">
                       {/* @ts-expect-error - Dynamically imported Recharts components */}
                       <ResponsiveContainer width="100%" height="100%">
                         {/* @ts-expect-error - Dynamically imported Recharts components */}
                         <PieChart>
                           {/* @ts-expect-error - Dynamically imported Recharts components */}
                           <Pie data={categoriesData} innerRadius="55%" outerRadius="80%" paddingAngle={4} dataKey="value" stroke="none">
                             {/* @ts-expect-error - Dynamically imported Recharts components */}
                             {categoriesData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                           </Pie>
                           {/* @ts-expect-error - Dynamically imported Recharts components */}
                           <Tooltip contentStyle={{ backgroundColor: '#0D0D12', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '12px', color: '#fff' }} />
                         </PieChart>
                       </ResponsiveContainer>
                       {/* Center Text */}
                       <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-[11px] text-text-tertiary uppercase tracking-wider">Total</span>
                          <span className="text-[22px] font-bold text-text-primary tabular-nums">R$ {totalOutflow.toLocaleString('pt-BR')}</span>
                       </div>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 justify-center">
                       {categoriesData.slice(0, 5).map((cat, i) => (
                          <div key={cat.name} className="flex items-center gap-1.5">
                             <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></div>
                             <span className="text-[11px] text-text-secondary">{t(`categories.${cat.name}`).replace('categories.', '')}</span>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>

              {/* WEEKDAY INTENSITY + PAYMENT METHODS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Weekday Chart */}
                <div className="glass-card-static p-5 md:p-6">
                  <h2 className="text-[16px] font-semibold text-text-primary mb-5">{t('dashboard.weekdayActivity')}</h2>
                  <div className="h-[200px] w-full">
                    {/* @ts-expect-error - Dynamically imported Recharts components */}
                    <ResponsiveContainer width="100%" height="100%">
                      {/* @ts-expect-error - Dynamically imported Recharts components */}
                      <BarChart data={weekdayIntensity} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        {/* @ts-expect-error - Dynamically imported Recharts components */}
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        {/* @ts-expect-error - Dynamically imported Recharts components */}
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} />
                        {/* @ts-expect-error - Dynamically imported Recharts components */}
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                        {/* @ts-expect-error - Dynamically imported Recharts components */}
                        <Tooltip contentStyle={{ backgroundColor: '#0D0D12', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '12px', color: '#fff' }} />
                        {/* @ts-expect-error - Dynamically imported Recharts components */}
                        <Bar dataKey="val" fill="#06B6D4" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Payment Methods */}
                <div className="glass-card-static p-5 md:p-6">
                  <h2 className="text-[16px] font-semibold text-text-primary mb-5">{t('dashboard.paymentMethods')}</h2>
                  <div className="space-y-3 stagger-children">
                    {paymentMethodsData.slice(0, 4).map((pm, i) => {
                      const pct = totalOutflow > 0 ? (pm.value / totalOutflow) * 100 : 0;
                      const colors = ['#8B5CF6', '#EC4899', '#FB923C', '#06B6D4'];
                      const icons = [<Smartphone key="s" size={16} />, <CreditCard key="c" size={16} />, <Banknote key="b" size={16} />, <Layers key="l" size={16} />];
                      return (
                        <div key={pm.name} className="flex items-center gap-4 p-3 rounded-[12px] bg-glass-highlight border-thin border-glass-border hover:border-white/10 transition-all">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0" style={{ backgroundColor: colors[i % colors.length] }}>
                            {icons[i % icons.length]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-text-primary">{pm.name}</p>
                            <div className="w-full h-1.5 bg-brand-bg rounded-full overflow-hidden mt-1.5">
                              <div className="h-full rounded-full animate-fill-progress" style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length] }}></div>
                            </div>
                          </div>
                          <span className="text-[14px] font-bold text-text-primary tabular-nums">{pct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* SMART ALERTS SECTION */}
              {alerts.length > 0 && (
                <div className="glass-card-static p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <Bell size={16} className="text-brand-orange" />
                    <h2 className="text-[16px] font-semibold text-text-primary">Smart Alerts</h2>
                    <span className="ml-auto px-2.5 py-0.5 rounded-full bg-brand-orange/20 text-brand-orange text-[11px] font-bold">{alerts.length}</span>
                  </div>
                  <div className="space-y-3 stagger-children">
                    {alerts.slice(0, 5).map(alert => (
                      <div key={alert.id} className={`p-4 rounded-[12px] border-thin flex items-start gap-3 transition-all ${
                        alert.type === 'critical' ? 'bg-brand-red/10 border-brand-red/20' :
                        alert.type === 'warning' ? 'bg-brand-orange/10 border-brand-orange/20' :
                        'bg-brand-cyan/10 border-brand-cyan/20'
                      }`}>
                        <div className="shrink-0 mt-0.5">{alert.icon}</div>
                        <div>
                          <p className="text-[13px] font-semibold text-text-primary">{alert.title}</p>
                          <p className="text-[12px] text-text-secondary mt-0.5">{alert.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GOALS */}
          {activeTab === "goals" && (
             <div className="@container space-y-6 stagger-children">
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 {/* Left Sidebar - Goal Cards */}
                 <div className="lg:col-span-1 space-y-4">
                    <div className="glass-card p-5 cursor-pointer border-brand-cyan/30 shadow-glow-cyan">
                       <div className="flex items-center justify-between mb-3">
                         <h3 className="text-[14px] font-semibold text-text-primary">MacBook Pro M3</h3>
                         <span className="text-[11px] font-bold text-brand-cyan tabular-nums">45%</span>
                       </div>
                       <p className="text-[12px] text-text-tertiary mb-4">Target: R$ 18.000</p>
                       <div className="w-full h-2.5 bg-brand-bg rounded-full overflow-hidden mb-2">
                          <div className="h-full bg-gradient-to-r from-brand-cyan to-brand-purple rounded-full animate-fill-progress" style={{ width: '45%' }}></div>
                       </div>
                       <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-text-primary tabular-nums">R$ 8.100 saved</span>
                          <span className="text-text-tertiary">Due Dec 2026</span>
                       </div>
                    </div>
                    <div className="glass-card p-5 cursor-pointer opacity-60 hover:opacity-100 transition-opacity">
                       <div className="flex items-center justify-between mb-3">
                         <h3 className="text-[14px] font-semibold text-text-primary">Emergency Fund</h3>
                         <span className="text-[11px] font-bold text-brand-purple tabular-nums">12%</span>
                       </div>
                       <p className="text-[12px] text-text-tertiary mb-4">Target: R$ 50.000</p>
                       <div className="w-full h-2.5 bg-brand-bg rounded-full overflow-hidden mb-2">
                          <div className="h-full bg-gradient-to-r from-brand-purple to-brand-pink rounded-full animate-fill-progress" style={{ width: '12%' }}></div>
                       </div>
                       <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-text-primary tabular-nums">R$ 6.000 saved</span>
                          <span className="text-text-tertiary">No deadline</span>
                       </div>
                    </div>
                    <div className="glass-card p-5 cursor-pointer opacity-60 hover:opacity-100 transition-opacity">
                       <div className="flex items-center justify-between mb-3">
                         <h3 className="text-[14px] font-semibold text-text-primary">Vacation Trip</h3>
                         <span className="text-[11px] font-bold text-brand-pink tabular-nums">68%</span>
                       </div>
                       <p className="text-[12px] text-text-tertiary mb-4">Target: R$ 8.000</p>
                       <div className="w-full h-2.5 bg-brand-bg rounded-full overflow-hidden mb-2">
                          <div className="h-full bg-gradient-to-r from-brand-pink to-brand-orange rounded-full animate-fill-progress" style={{ width: '68%' }}></div>
                       </div>
                       <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-text-primary tabular-nums">R$ 5.440 saved</span>
                          <span className="text-text-tertiary">Due Jul 2026</span>
                       </div>
                    </div>
                    <button className="w-full p-4 rounded-[16px] border-thin border-dashed border-text-tertiary text-text-secondary font-medium text-[13px] hover:text-text-primary hover:border-text-secondary hover:bg-glass-highlight transition-all flex items-center justify-center gap-2" aria-label="Create new goal">
                       <Plus size={16} /> Create New Goal
                    </button>
                 </div>
                 
                 {/* Right Form */}
                 <div className="lg:col-span-2 glass-card-static p-6 md:p-8">
                    <h2 className="text-[20px] font-bold text-text-primary mb-6">Edit Goal</h2>
                    <form className="space-y-5" onSubmit={e => e.preventDefault()}>
                       <div>
                          <label className="block text-[12px] text-text-tertiary mb-2 font-medium">Goal Name</label>
                          <input type="text" defaultValue="MacBook Pro M3" className="glass-input w-full" />
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <label className="block text-[12px] text-text-tertiary mb-2 font-medium">Target Amount (R$)</label>
                             <input type="text" defaultValue="18000" className="glass-input w-full" />
                          </div>
                          <div>
                             <label className="block text-[12px] text-text-tertiary mb-2 font-medium">Deadline</label>
                             <input type="date" defaultValue="2026-12-31" className="glass-input w-full [color-scheme:dark]" />
                          </div>
                       </div>
                       <div className="pt-4 border-t border-glass-border mt-6">
                          <h3 className="text-[14px] font-semibold text-text-primary mb-4">Saving Rules</h3>
                          <div className="flex items-center justify-between p-4 bg-glass-highlight rounded-[12px] mb-3 hover:bg-white/[0.07] transition-colors">
                             <div>
                                <p className="text-[13px] font-medium text-text-primary">Round-up Change</p>
                                <p className="text-[11px] text-text-tertiary mt-0.5">Save spare change to the nearest R$ 10</p>
                             </div>
                             <div className="w-10 h-6 bg-brand-purple rounded-full relative cursor-pointer transition-colors"><div className="w-4 h-4 bg-white rounded-full absolute right-1 top-1 shadow-sm"></div></div>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-glass-highlight rounded-[12px] hover:bg-white/[0.07] transition-colors">
                             <div>
                                <p className="text-[13px] font-medium text-text-primary">Monthly Auto-Transfer</p>
                                <p className="text-[11px] text-text-tertiary mt-0.5">Transfer R$ 500 on the 5th of every month</p>
                             </div>
                             <div className="w-10 h-6 bg-glass-border rounded-full relative cursor-pointer transition-colors"><div className="w-4 h-4 bg-text-tertiary rounded-full absolute left-1 top-1"></div></div>
                          </div>
                       </div>
                       <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 mt-2">
                          <button className="px-5 py-2.5 rounded-[12px] text-[13px] font-bold text-brand-red border-thin border-brand-red/30 hover:bg-brand-red/10 transition-colors glass-btn">Delete</button>
                          <button className="px-5 py-2.5 rounded-[12px] text-[13px] font-bold text-text-primary border-thin border-glass-border hover:bg-glass-highlight transition-colors glass-btn">Duplicate</button>
                          <button className="btn-primary">Save Goal</button>
                       </div>
                    </form>
                 </div>
               </div>
             </div>
          )}

          {/* TAB 4: SETTINGS */}
          {activeTab === "settings" && (
             <div className="@container max-w-2xl mx-auto space-y-6 stagger-children">

               {/* ── Profile card with Firestore data ── */}
               <div className="glass-card-static p-6">
                 <div className="flex items-center justify-between mb-5">
                   <h3 className="text-[16px] font-semibold text-text-primary">Meu Perfil</h3>
                   <button
                     onClick={() => {
                       if (isEditingProfile) {
                         setProfileForm({ name: fireUser?.name ?? '', locale: fireUser?.locale ?? 'pt-BR', currency: fireUser?.currency ?? 'BRL' });
                       }
                       setIsEditingProfile(!isEditingProfile);
                     }}
                     className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-purple text-white text-[12px] font-medium hover:bg-purple-700 transition-colors"
                   >
                     {isEditingProfile ? <><X size={12} /> Cancelar</> : <><Pencil size={12} /> Editar Perfil</>}
                   </button>
                 </div>

                 {fireLoading ? (
                   <div className="space-y-4">
                     <div className="flex items-center gap-4">
                       <div className="w-16 h-16 rounded-full bg-glass-highlight animate-pulse flex-shrink-0" />
                       <div className="space-y-2 flex-1"><div className="h-4 w-32 bg-glass-highlight rounded animate-pulse" /><div className="h-3 w-48 bg-glass-highlight rounded animate-pulse" /></div>
                     </div>
                   </div>
                 ) : (
                   <>
                     {/* Avatar + name + email */}
                     <div className="flex items-center gap-4 mb-5">
                       {fireUser?.photoURL ? (
                         // eslint-disable-next-line @next/next/no-img-element
                         <img src={fireUser.photoURL} alt="Foto" referrerPolicy="no-referrer"
                           className="w-16 h-16 rounded-full border-2 border-brand-purple object-cover flex-shrink-0" />
                       ) : (
                         <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-purple to-brand-pink flex items-center justify-center text-white text-[22px] font-bold flex-shrink-0">
                           {fireUser?.name?.[0]?.toUpperCase() ?? '?'}
                         </div>
                       )}
                       <div className="overflow-hidden">
                         <h2 className="text-[18px] font-bold text-text-primary truncate">{fireUser?.name || '—'}</h2>
                         <p className="text-[13px] text-text-tertiary truncate flex items-center gap-1">
                           <Mail size={11} className="flex-shrink-0" />{fireUser?.email || '—'}
                         </p>
                       </div>
                     </div>

                     {/* View mode fields */}
                     {!isEditingProfile && (
                       <div className="space-y-0 border-t border-glass-border">
                         <div className="flex justify-between items-center py-3 border-b border-glass-border">
                           <span className="text-[13px] text-text-secondary flex items-center gap-1.5"><Globe size={13} /> Idioma</span>
                           <span className="text-[13px] text-text-primary font-medium">
                             {fireUser?.locale === 'pt-BR' ? 'Português (BR)' : fireUser?.locale === 'en' ? 'English' : fireUser?.locale === 'es' ? 'Español' : fireUser?.locale ?? '—'}
                           </span>
                         </div>
                         <div className="flex justify-between items-center py-3 border-b border-glass-border">
                           <span className="text-[13px] text-text-secondary flex items-center gap-1.5"><DollarSign size={13} /> Moeda</span>
                           <span className="text-[13px] text-text-primary font-bold">{fireUser?.currency ?? '—'}</span>
                         </div>
                         <div className="flex justify-between items-center py-3 border-b border-glass-border">
                           <span className="text-[13px] text-text-secondary">{t('common.transactions', { count: transactions.length })}</span>
                           <span className="text-[13px] text-text-primary font-bold tabular-nums">{transactions.length}</span>
                         </div>
                         {fireUser?.createdAt && (
                           <div className="flex justify-between items-center py-3">
                             <span className="text-[13px] text-text-secondary flex items-center gap-1.5"><CalendarIcon size={13} /> {t('settings.memberSince')}</span>
                             <span className="text-[13px] text-text-primary font-medium">
                               {new Date(fireUser.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                             </span>
                           </div>
                         )}
                       </div>
                     )}

                     {/* Edit form */}
                     {isEditingProfile && (
                       <div className="space-y-3 border-t border-glass-border pt-4">
                         <div>
                           <label className="text-[11px] text-text-tertiary uppercase tracking-wide mb-1 block">Nome</label>
                           <input
                             value={profileForm.name}
                             onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                             placeholder="Seu nome"
                             className="w-full p-3 rounded-[10px] bg-glass-highlight border-thin border-glass-border text-text-primary text-[13px] outline-none focus:border-brand-purple transition-colors"
                           />
                         </div>
                         <div>
                           <label className="text-[11px] text-text-tertiary uppercase tracking-wide mb-1 block">Idioma</label>
                           <select
                             value={profileForm.locale}
                             onChange={e => setProfileForm({ ...profileForm, locale: e.target.value })}
                             className="w-full p-3 rounded-[10px] bg-glass-highlight border-thin border-glass-border text-text-primary text-[13px] outline-none focus:border-brand-purple transition-colors"
                           >
                             <option value="pt-BR">Português (BR)</option>
                             <option value="en">English</option>
                             <option value="es">Español</option>
                           </select>
                         </div>
                         <div>
                           <label className="text-[11px] text-text-tertiary uppercase tracking-wide mb-1 block">Moeda</label>
                           <select
                             value={profileForm.currency}
                             onChange={e => setProfileForm({ ...profileForm, currency: e.target.value })}
                             className="w-full p-3 rounded-[10px] bg-glass-highlight border-thin border-glass-border text-text-primary text-[13px] outline-none focus:border-brand-purple transition-colors"
                           >
                             <option value="BRL">Real (R$)</option>
                             <option value="USD">Dólar ($)</option>
                             <option value="EUR">Euro (€)</option>
                           </select>
                         </div>
                         <button
                           onClick={handleSaveProfile}
                           disabled={isSavingProfile}
                           className="w-full flex items-center justify-center gap-2 py-3 rounded-[10px] bg-brand-purple text-white font-bold text-[13px] hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95"
                         >
                           <Save size={15} />
                           {isSavingProfile ? 'Salvando...' : 'Salvar Alterações'}
                         </button>
                       </div>
                     )}
                   </>
                 )}
               </div>

               {/* Language */}
               <div className="glass-card-static p-6">
                 <div className="flex items-center gap-2 mb-5">
                   <Globe size={16} className="text-brand-purple" />
                   <h3 className="text-[16px] font-semibold text-text-primary">{t('common.language')}</h3>
                 </div>
                 <LanguageSwitcher />
               </div>

               {/* Preferences */}
               <div className="glass-card-static p-6">
                 <h3 className="text-[16px] font-semibold text-text-primary mb-5">{t('settings.preferences')}</h3>
                 <div className="space-y-4">
                   <div className="flex items-center justify-between">
                     <div>
                       <p className="text-[13px] font-medium text-text-primary">{t('settings.aiCategorization')}</p>
                       <p className="text-[11px] text-text-tertiary mt-0.5">{t('settings.aiCategorizationDesc')}</p>
                     </div>
                     <div className="w-10 h-6 bg-brand-purple rounded-full relative cursor-pointer"><div className="w-4 h-4 bg-white rounded-full absolute right-1 top-1 shadow-sm"></div></div>
                   </div>
                   <div className="flex items-center justify-between">
                     <div>
                       <p className="text-[13px] font-medium text-text-primary">{t('settings.smartAlertsToggle')}</p>
                       <p className="text-[11px] text-text-tertiary mt-0.5">{t('settings.smartAlertsDesc')}</p>
                     </div>
                     <div className="w-10 h-6 bg-brand-purple rounded-full relative cursor-pointer"><div className="w-4 h-4 bg-white rounded-full absolute right-1 top-1 shadow-sm"></div></div>
                   </div>
                   <div className="flex items-center justify-between">
                     <div>
                       <p className="text-[13px] font-medium text-text-primary">{t('settings.currency')}</p>
                       <p className="text-[11px] text-text-tertiary mt-0.5">{fireUser?.currency ?? locale}</p>
                     </div>
                     <span className="px-3 py-1.5 rounded-lg bg-glass-highlight border-thin border-glass-border text-[12px] font-bold text-text-primary">{fireUser?.currency === 'BRL' ? 'BRL (R$)' : fireUser?.currency === 'USD' ? 'USD ($)' : fireUser?.currency ?? 'BRL (R$)'}</span>
                   </div>
                 </div>
               </div>

               {/* Data Management */}
               <div className="glass-card-static p-6">
                 <h3 className="text-[16px] font-semibold text-text-primary mb-5">{t('settings.dataManagement')}</h3>
                 <div className="space-y-3">
                   <button className="w-full p-4 rounded-[12px] bg-glass-highlight border-thin border-glass-border text-left hover:bg-white/[0.07] transition-colors flex items-center justify-between group">
                     <div className="flex items-center gap-3">
                       <Database size={16} className="text-brand-cyan" />
                       <span className="text-[13px] font-medium text-text-primary">{t('settings.exportData')}</span>
                     </div>
                     <ChevronRight size={14} className="text-text-tertiary group-hover:text-text-primary transition-colors" />
                   </button>
                   <button
                     disabled={isLoadingData}
                     onClick={async () => {
                       setIsLoadingData(true);
                       try { await syncWithBackend(); } finally { setIsLoadingData(false); }
                     }}
                     className="w-full p-4 rounded-[12px] bg-glass-highlight border-thin border-glass-border text-left hover:bg-white/[0.07] transition-colors flex items-center justify-between group disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     <div className="flex items-center gap-3">
                       {isLoadingData ? <Loader2 size={16} className="text-brand-orange animate-spin" /> : <RotateCcw size={16} className="text-brand-orange" />}
                       <span className="text-[13px] font-medium text-text-primary">{t('settings.syncBackend')}</span>
                     </div>
                     <ChevronRight size={14} className="text-text-tertiary group-hover:text-text-primary transition-colors" />
                   </button>
                   <button
                     disabled={isLoadingData}
                     onClick={async () => {
                       if(window.confirm(t('settings.clearDataConfirm'))) {
                         setIsLoadingData(true);
                         try { await clearAllData(); } finally { setIsLoadingData(false); }
                       }
                     }}
                     className="w-full p-4 rounded-[12px] bg-brand-red/5 border-thin border-brand-red/20 text-left hover:bg-brand-red/10 transition-colors flex items-center justify-between group disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     <div className="flex items-center gap-3">
                       <Trash2 size={16} className="text-brand-red" />
                       <span className="text-[13px] font-medium text-brand-red">{t('settings.clearData')}</span>
                     </div>
                     <ChevronRight size={14} className="text-brand-red/50 group-hover:text-brand-red transition-colors" />
                   </button>
                 </div>
               </div>

               <p className="text-center text-[11px] text-text-tertiary py-4">{t('settings.version')} • Built with 🧠 by Neural Analytics</p>
             </div>
          )}
        </div>
      ) : (
        /* EMPTY STATE */
        <EmptyState
          icon={<FileText size={64} />}
          title="Nenhuma transação ainda"
          description="Envie seu primeiro comprovante para começar a usar os dashboards inteligentes do SHARECOM"
          action={
            <div className="flex flex-col items-center gap-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-8 py-4 bg-accent-purple text-white rounded-2xl font-bold shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
              >
                <Plus size={20} />
                ENVIAR PRIMEIRO COMPROVANTE
              </button>
              
              <button 
                onClick={() => setShowManualModal(true)}
                className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Registrar manualmente
              </button>
            </div>
          }
        />
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
                    <h3 className="text-[16px] font-bold text-ds-text-primary">{t('trash.title')}</h3>
                    <p className="text-[11px] text-ds-text-tertiary">{t('trash.subtitle')}</p>
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
                    <p className="text-[13px] text-ds-text-tertiary">{t('trash.empty')}</p>
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
                          onClick={() => {
                            if(tx.id) {
                              haptics.success();
                              restoreFromTrash(tx.id);
                            }
                          }}
                          className="p-2 rounded-lg hover:bg-emerald-500/10 text-emerald-500 transition-colors"
                          title={t('trash.restore')}
                        >
                          <RotateCcw size={18} />
                        </button>
                        <button 
                          onClick={() => {
                            if(tx.id) {
                              haptics.heavyTap();
                              permanentDelete(tx.id);
                            }
                          }}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                          title={t('trash.deletePermanently')}
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
                  <p className="text-[11px] text-ds-text-tertiary">{t('trash.viewTrash', { count: trashTransactions.length })}</p>
                  <button 
                    onClick={() => {
                      haptics.heavyTap();
                      if(window.confirm(t('trash.confirmEmpty'))) emptyTrash();
                    }}
                    className="text-[12px] font-bold text-red-500 hover:underline"
                  >
                    {t('trash.emptyTrash')}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* UPLOAD TYPE MODAL */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-sm bg-ds-bg-primary border-thin border-ds-border rounded-2xl p-6 shadow-2xl">
              <h3 className="text-[18px] font-bold text-ds-text-primary mb-2">{t('upload.processReceipt')}</h3>
              <p className="text-[13px] text-ds-text-secondary mb-6">{t('upload.classifyReceipt')}</p>
              
              <div className="space-y-3 mb-6">
                <button onClick={() => setUploadType("Outflow")} className={`w-full p-4 rounded-xl border-thin flex items-center justify-between transition-all ${uploadType === "Outflow" ? "bg-fn-expense/10 border-fn-expense" : "bg-ds-bg-secondary border-ds-border"}`}>
                  <div className="flex items-center gap-3">
                    <TrendingDown className={uploadType === "Outflow" ? "text-fn-expense" : "text-ds-text-tertiary"} size={20} />
                    <span className={`font-bold ${uploadType === "Outflow" ? "text-fn-expense" : "text-ds-text-primary"}`}>{t('upload.outflow')}</span>
                  </div>
                  {uploadType === "Outflow" && <CheckCircle2 size={18} className="text-fn-expense" />}
                </button>
                <button onClick={() => setUploadType("Inflow")} className={`w-full p-4 rounded-xl border-thin flex items-center justify-between transition-all ${uploadType === "Inflow" ? "bg-fn-income/10 border-fn-income" : "bg-ds-bg-secondary border-ds-border"}`}>
                  <div className="flex items-center gap-3">
                    <TrendingUp className={uploadType === "Inflow" ? "text-fn-income" : "text-ds-text-tertiary"} size={20} />
                    <span className={`font-bold ${uploadType === "Inflow" ? "text-fn-income" : "text-ds-text-primary"}`}>{t('upload.inflow')}</span>
                  </div>
                  {uploadType === "Inflow" && <CheckCircle2 size={18} className="text-fn-income" />}
                </button>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 rounded-xl border-thin border-ds-border text-ds-text-secondary font-bold hover:bg-ds-bg-secondary">{t('common.cancel').toUpperCase()}</button>
                <button onClick={executeUpload} className="flex-1 px-4 py-3 rounded-xl bg-fn-balance text-white font-bold shadow-lg hover:scale-105 transition-all">{t('upload.process')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MANUAL TRANSACTION MODAL */}
      <AnimatePresence>
        {showManualModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="w-full max-w-md bg-ds-bg-primary border-thin border-ds-border rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-ds-border flex items-center justify-between">
                <h3 className="text-[18px] font-bold text-ds-text-primary">{t('manual.title')}</h3>
                <button onClick={() => setShowManualModal(false)} className="p-2 text-ds-text-tertiary hover:text-ds-text-primary"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">{t('manual.merchant')}</label>
                  <input type="text" value={manualTx.merchant_name} onChange={e => setManualTx({...manualTx, merchant_name: e.target.value})} className="w-full p-3 bg-ds-bg-secondary border-thin border-ds-border rounded-xl text-ds-text-primary focus:border-fn-balance outline-none transition-all" placeholder={t('manual.merchantPlaceholder')} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">{t('manual.amount')}</label>
                    <input type="number" value={manualTx.total_amount} onChange={e => setManualTx({...manualTx, total_amount: e.target.value})} className="w-full p-3 bg-ds-bg-secondary border-thin border-ds-border rounded-xl text-ds-text-primary focus:border-fn-balance outline-none transition-all" placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">{t('manual.type')}</label>
                    <select value={manualTx.transaction_type} onChange={e => setManualTx({...manualTx, transaction_type: e.target.value as any})} className="w-full p-3 bg-ds-bg-secondary border-thin border-ds-border rounded-xl text-ds-text-primary focus:border-fn-balance outline-none transition-all">
                      <option value="Outflow">{t('manual.outflow')}</option>
                      <option value="Inflow">{t('manual.inflow')}</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">{t('manual.category')}</label>
                    <select value={manualTx.category} onChange={e => setManualTx({...manualTx, category: e.target.value})} className="w-full p-3 bg-ds-bg-secondary border-thin border-ds-border rounded-xl text-ds-text-primary focus:border-fn-balance outline-none transition-all">
                      {Object.keys(CATEGORY_ICONS).map(cat => <option key={cat} value={cat}>{t(`categories.${cat}`).replace('categories.', '')}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">{t('manual.payment')}</label>
                    <input type="text" value={manualTx.payment_method} onChange={e => setManualTx({...manualTx, payment_method: e.target.value})} className="w-full p-3 bg-ds-bg-secondary border-thin border-ds-border rounded-xl text-ds-text-primary focus:border-fn-balance outline-none transition-all" placeholder={t('manual.paymentPlaceholder')} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">{t('manual.note')}</label>
                  <textarea value={manualTx.note} onChange={e => setManualTx({...manualTx, note: e.target.value})} className="w-full p-3 bg-ds-bg-secondary border-thin border-ds-border rounded-xl text-ds-text-primary focus:border-fn-balance outline-none transition-all h-20 resize-none" placeholder={t('manual.notePlaceholder')} />
                </div>
                <button onClick={handleManualAdd} className="w-full py-4 bg-fn-balance text-white rounded-xl font-bold shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all mt-4">{t('manual.save')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FINWAVE BOTTOM NAVIGATION BAR - Mobile Only */}
      <div className="lg:hidden fixed bottom-0 left-0 w-full glass-card rounded-b-none border-b-0 border-x-0 z-50 flex justify-around shadow-glass backdrop-blur-xl" style={{
        paddingTop: '0.75rem',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}>
        {[
          { id: "home", label: t('nav.home'), icon: <HomeIcon size={22} className="sm:w-6 sm:h-6" /> },
          { id: "analytics", label: t('nav.analytics'), icon: <PieChartIcon size={22} className="sm:w-6 sm:h-6" /> },
          { id: "goals", label: t('nav.goals'), icon: <Target size={22} className="sm:w-6 sm:h-6" /> },
          { id: "settings", label: t('nav.settings'), icon: <Settings size={22} className="sm:w-6 sm:h-6" /> }
        ].map((tab) => (
          <button 
            key={tab.id}
            onClick={() => { 
              haptics.lightTap();
              setActiveTab(tab.id as ActiveTab); 
              setDashboardMode(tab.id as any); 
            }}
            className={`flex flex-col items-center gap-1 min-w-[56px] min-h-[56px] transition-colors touch-manipulation ${activeTab === tab.id ? "text-brand-orange" : "text-text-tertiary hover:text-text-secondary"}`}
          >
            {tab.icon}
            <span className="text-[9px] sm:text-[10px] font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
    </div>
  );
}

export default ExpenseTracker;
