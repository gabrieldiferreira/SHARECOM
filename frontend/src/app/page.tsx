"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, Suspense, useMemo, useRef, useCallback } from "react";
import NextDynamic from "next/dynamic";
import Link from "next/link";
import { 
  Receipt, Coffee, ShoppingBag, Car, Home as HomeIcon, X, BarChart3, Plus, Loader2, CheckCircle2, 
  TrendingUp, TrendingDown, Landmark, Clock, Award, MessageSquare, Search, Filter, ChevronLeft, 
  ChevronRight, FileText, Info, Trash2, RotateCcw, CreditCard, Banknote, Smartphone, Users, 
  ShieldCheck, Fingerprint, FileSearch, Scale, Zap, Bell, ShieldAlert, AlertTriangle, Calendar as CalendarIcon, History, Tag, 
  Target, Activity, Layers, Cpu, Database, Settings, PieChart as PieChartIcon, Globe,
  Pencil, Save, Mail, DollarSign
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTransactionStore } from "../store/useTransactionStore";
import { useGoalStore } from "../store/useGoalStore";
import { TransactionEntity, getDB } from "../lib/db";
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

/* eslint-disable @typescript-eslint/no-explicit-any */
const dyn = (loader: () => Promise<any>): React.ComponentType<any> =>
  NextDynamic(loader as any, { ssr: false } as any);
const dynLoad = (loader: () => Promise<any>, loading: () => React.ReactElement): React.ComponentType<any> =>
  NextDynamic(loader as any, { ssr: false, loading } as any);

const BarChart      = dynLoad(() => import('recharts').then(m => ({ default: m.BarChart })), ChartPlaceholder);
const Bar           = dyn(() => import('recharts').then(m => ({ default: m.Bar })));
const LineChart     = dyn(() => import('recharts').then(m => ({ default: m.LineChart })));
const Line          = dyn(() => import('recharts').then(m => ({ default: m.Line })));
const PieChart      = dyn(() => import('recharts').then(m => ({ default: m.PieChart })));
const Pie           = dyn(() => import('recharts').then(m => ({ default: m.Pie })));
const XAxis         = dyn(() => import('recharts').then(m => ({ default: m.XAxis })));
const YAxis         = dyn(() => import('recharts').then(m => ({ default: m.YAxis })));
const ResponsiveContainer = dyn(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })));
const Cell          = dyn(() => import('recharts').then(m => ({ default: m.Cell })));
const Tooltip       = dyn(() => import('recharts').then(m => ({ default: m.Tooltip })));
const CartesianGrid = dyn(() => import('recharts').then(m => ({ default: m.CartesianGrid })));
const AreaChart     = dynLoad(() => import('recharts').then(m => ({ default: m.AreaChart })), ChartPlaceholder);
const Area          = dyn(() => import('recharts').then(m => ({ default: m.Area })));
/* eslint-enable @typescript-eslint/no-explicit-any */

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

type DuplicateWarningPayload = {
  existing?: Record<string, unknown>;
  times_scanned?: number;
  receipt_hash?: string;
};

const parseScannedAmount = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== 'string') {
    return 0;
  }

  const normalizedAmount = value.trim().replace(/[^\d,.\s-]/g, '');
  const parsedAmount = /\d[\d,.]*\s+\d{2}$/.test(normalizedAmount)
    ? parseFloat(normalizedAmount.replace(/\s+/g, '.'))
    : parseFloat(normalizedAmount.replace(/\./g, '').replace(',', '.'));

  return Number.isFinite(parsedAmount) ? parsedAmount : 0;
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

  const { goals, addGoal, deleteGoal } = useGoalStore();

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
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarningPayload | null>(null);
  const [uploadType, setUploadType] = useState<"Inflow" | "Outflow">("Outflow");
  const [receiptCategory, setReceiptCategory] = useState("");
  const [showManualModal, setShowManualModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7days' | 'month' | 'all'>('month');
  
  type DashboardMode = "cashflow" | "entities" | "payment" | "temporal" | "category" | "forensics" | "tax" | "alerts";
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("cashflow");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); 
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedTxId, setExpandedTxId] = useState<string | number | null>(null);
  const itemsPerPage = 6;

  // ── Firebase user profile ──
  interface FirestoreUser { name: string; email: string; photoURL: string; locale: string; currency: string; createdAt: string; hasUsedDemo: boolean; }
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
    
    // Generate transactions with realistic hourly distribution
    // More transactions during typical spending hours (7-9am, 12-2pm, 6-9pm)
    const hourlyWeights = [
      0.1, 0.1, 0.1, 0.1, 0.2, 0.3, 0.5, // 0-6am: low activity
      1.5, 1.8, 1.2, 0.8, 0.9, // 7-11am: morning peak
      2.0, 1.8, 1.0, 0.7, 0.6, 0.8, // 12-5pm: lunch peak
      1.5, 2.2, 2.0, 1.5, 1.0, 0.8, 0.5 // 6-11pm: evening peak
    ];
    
    // Weekday weights: more activity on weekdays, less on weekends
    const weekdayWeights = [0.7, 1.2, 1.3, 1.2, 1.3, 1.1, 0.8]; // Sun-Sat
    
    // Generate 100 transactions over the last 30 days with weighted hours and weekdays
    for (let i = 0; i < 100; i++) {
      // Select day with weekday weighting
      let daysAgo = Math.floor(Math.random() * 30);
      let date = new Date(now);
      date.setDate(date.getDate() - daysAgo);
      
      // Re-roll if weekday weight doesn't match
      const dayOfWeek = date.getDay();
      if (Math.random() > weekdayWeights[dayOfWeek] / 1.3) {
        daysAgo = Math.floor(Math.random() * 30);
        date = new Date(now);
        date.setDate(date.getDate() - daysAgo);
      }
      
      // Weighted random hour selection
      const totalWeight = hourlyWeights.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;
      let hour = 0;
      for (let h = 0; h < 24; h++) {
        random -= hourlyWeights[h];
        if (random <= 0) {
          hour = h;
          break;
        }
      }
      
      date.setHours(hour, Math.floor(Math.random() * 60));
      
      const isInflow = Math.random() < 0.12; // 12% income
      
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
    
    console.log('🎲 Generated mock data:', {
      total: mockTransactions.length,
      outflow: mockTransactions.filter(t => t.transaction_type === 'Outflow').length,
      inflow: mockTransactions.filter(t => t.transaction_type === 'Inflow').length,
      hourDistribution: mockTransactions.reduce((acc, tx) => {
        const h = new Date(tx.transaction_date).getHours();
        acc[h] = (acc[h] || 0) + 1;
        return acc;
      }, {} as Record<number, number>),
      weekdayDistribution: mockTransactions.reduce((acc, tx) => {
        const d = new Date(tx.transaction_date).getDay();
        acc[d] = (acc[d] || 0) + 1;
        return acc;
      }, {} as Record<number, number>)
    });
    
    // Add to store
    for (const tx of mockTransactions) {
      await addTransaction(tx);
    }

    // Mark demo as used in Firestore (one-time per account)
    const currentUser = auth?.currentUser;
    if (currentUser && db) {
      await updateDoc(doc(db, 'users', currentUser.uid), { hasUsedDemo: true });
      setFireUser(prev => prev ? { ...prev, hasUsedDemo: true } : prev);
    }

    // Generate demo goals (category='demo' marks them for deletion)
    const demoGoals = [
      {
        name: '🏖️ Viagem de Férias',
        target_amount: 8000,
        current_amount: 2350,
        deadline: new Date(new Date().setMonth(new Date().getMonth() + 8)).toISOString(),
        category: 'demo',
        status: 'active',
        auto_round_up: 10,
        auto_transfer_amount: 0,
        auto_transfer_day: null,
      },
      {
        name: '💻 MacBook Pro',
        target_amount: 15000,
        current_amount: 4800,
        deadline: new Date(new Date().setMonth(new Date().getMonth() + 12)).toISOString(),
        category: 'demo',
        status: 'active',
        auto_round_up: 0,
        auto_transfer_amount: 500,
        auto_transfer_day: 5,
      },
      {
        name: '🏠 Reserva de Emergência',
        target_amount: 20000,
        current_amount: 12000,
        deadline: null,
        category: 'demo',
        status: 'active',
        auto_round_up: 0,
        auto_transfer_amount: 1000,
        auto_transfer_day: 1,
      },
      {
        name: '🚗 Carro Novo',
        target_amount: 45000,
        current_amount: 5500,
        deadline: new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString(),
        category: 'demo',
        status: 'active',
        auto_round_up: 10,
        auto_transfer_amount: 0,
        auto_transfer_day: null,
      },
    ];
    for (const goal of demoGoals) {
      await addGoal(goal);
    }

    showToast('100 transações de demonstração adicionadas!', 'success');
    await fetchTransactions();
  }, [addTransaction, addGoal, fetchTransactions, showToast]);

  // Delete all mock/demo transactions in a single bulk IndexedDB transaction
  // (avoids the bug where looping permanentDelete triggers fetchTransactions/syncWithBackend
  //  between each delete, which was causing re-insertions mid-loop)
  const deleteDemoData = useCallback(async () => {
    const demoTxs = transactions.filter(tx => tx.receipt_hash?.startsWith('mock_'));
    const demoGoalsList = goals.filter(g => g.category === 'demo');

    if (demoTxs.length === 0 && demoGoalsList.length === 0) {
      showToast('Nenhum dado de demonstração encontrado.', 'error');
      return;
    }

    // Delete transactions in one atomic IndexedDB transaction
    if (demoTxs.length > 0) {
      const idb = await getDB();
      if (idb) {
        const txSet = idb.transaction('transactions', 'readwrite');
        for (const tx of demoTxs) {
          if (tx.id !== undefined) await txSet.store.delete(tx.id);
        }
        await txSet.done;
        await fetchTransactions();
      }
    }

    // Delete demo goals via API
    for (const goal of demoGoalsList) {
      await deleteGoal(goal.id);
    }

    const total = demoTxs.length + demoGoalsList.length;
    showToast(`${total} itens de demonstração removidos!`, 'success');
  }, [transactions, goals, fetchTransactions, deleteGoal, showToast]);

  // Dismiss onboarding without generating demo (one-time, marks hasUsedDemo in Firestore)
  const dismissOnboarding = useCallback(async () => {
    const currentUser = auth?.currentUser;
    if (currentUser && db) {
      await updateDoc(doc(db, 'users', currentUser.uid), { hasUsedDemo: true });
      setFireUser(prev => prev ? { ...prev, hasUsedDemo: true } : prev);
    }
  }, []);

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
          name:        data.name      || currentUser.displayName || '',
          email:       data.email     || currentUser.email       || '',
          photoURL:    data.photoURL  || currentUser.photoURL   || '',
          locale:      data.locale    || 'pt-BR',
          currency:    data.currency  || 'BRL',
          createdAt:   data.createdAt || '',
          hasUsedDemo: data.hasUsedDemo === true,
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
      // Use scanned_at if available, otherwise fallback to transaction_date
      const txDate = new Date(tx.scanned_at || tx.transaction_date);
      if (isNaN(txDate.getTime())) return true; // Include invalid dates rather than hiding them
      return txDate >= startDate;
    }).map(tx => ({
      ...tx,
      _original_date: tx.transaction_date, // preserve original date for the details modal
      transaction_date: tx.scanned_at || tx.transaction_date // override for all dashboard charts/lists
    }));
    console.log('📅 Filtered result:', { filtered: filtered.length, outflow: filtered.filter(t => t.transaction_type === 'Outflow').length });
    return filtered;
  }, [transactions, getDateFilter, dateRange]);


  const filteredTransactions = useMemo(() => {
    const result = filteredByDate.filter(tx => {
      const merchant = tx.merchant_name || "Desconhecido";
      const matchesSearch = merchant.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (tx.note && tx.note.toLowerCase().includes(searchQuery.toLowerCase())) ||
                           (tx.destination_institution && tx.destination_institution.toLowerCase().includes(searchQuery.toLowerCase()));
      
      let matchesFilter = true;
      const type = (tx.transaction_type || '').toLowerCase();
      const cat = (tx.category || '').toLowerCase();
      if (activeFilter === "inflow") matchesFilter = type === "inflow" || cat === "receita" || cat === "income";
      if (activeFilter === "high_value") matchesFilter = Number(tx.total_amount || 0) > 500;
      if (activeFilter === "with_notes") matchesFilter = !!tx.note;
      if (activeFilter === "today") {
        const todayLocal = new Date().toLocaleDateString('sv-SE');
        const txLocalDate = new Date(tx.transaction_date).toLocaleDateString('sv-SE');
        matchesFilter = txLocalDate === todayLocal;
      }

      return matchesSearch && matchesFilter;
    });

    // Explicitly sort by date (newest first)
    return result.sort((a, b) => {
      const dateA = new Date(a.transaction_date).getTime();
      const dateB = new Date(b.transaction_date).getTime();
      if (isNaN(dateA) || isNaN(dateB)) return 0;
      return dateB - dateA;
    });
  }, [filteredByDate, searchQuery, activeFilter]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const handleManualAdd = async () => {
     if (!manualTx.merchant_name || !manualTx.total_amount) return;
     const amount = parseFloat(manualTx.total_amount);
     const transactionDate = new Date().toISOString();
     const scannedAt = new Date().toISOString();

     try {
       const response = await authenticatedFetch(getApiUrl("/expenses"), {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           amount,
           merchant: manualTx.merchant_name,
           category: manualTx.category,
           transaction_type: manualTx.transaction_type,
           payment_method: manualTx.payment_method,
           note: manualTx.note || undefined,
           date: transactionDate,
           scanned_at: scannedAt,
         }),
       });

       if (!response.ok) {
         throw new Error(await response.text());
       }

       const saved = await response.json();
       const newTx: TransactionEntity = {
          id: Number(saved.id) || undefined,
          total_amount: Number(saved.amount) || amount,
          merchant_name: saved.merchant || manualTx.merchant_name,
          category: saved.category || manualTx.category,
          currency: 'BRL',
          transaction_date: saved.date || transactionDate,
          scanned_at: saved.scanned_at || scannedAt,
          transaction_type: saved.transaction_type || manualTx.transaction_type,
          payment_method: saved.payment_method || manualTx.payment_method,
          description: saved.description || undefined,
          receipt_hash: saved.receipt || undefined,
          is_synced: true,
          note: saved.note || manualTx.note || undefined
       };
       const result = await addTransaction(newTx);
       if (!result.success) {
         await syncWithBackend();
       }

       haptics.success();
       setShowManualModal(false);
       setManualTx({ merchant_name: "", total_amount: "", category: "Outros", transaction_type: "Outflow", payment_method: "Dinheiro", note: "" });
     } catch (error) {
       console.error("Erro ao cadastrar transação manual:", error);
       haptics.error();
       showToast("Não foi possível salvar a transação no Firebase.", "error");
     }
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadType("Outflow");
    setReceiptCategory("");
    setShowModal(true);
  };

  const executeUpload = async (force = false) => {
    if (!selectedFile) return;
    haptics.mediumTap();
    setShowModal(false);
    if (force) setDuplicateWarning(null);
    setIsUploading(true);
    let keepSelectionForDuplicate = false;
    const categoryOverride = receiptCategory.trim().replace(/\s+/g, " ");
    const formData = new FormData();
    formData.append("received_file", selectedFile);
    if (pendingNote) formData.append("note", pendingNote);
    formData.append("transaction_type", uploadType);
    if (force) formData.append("force", "true");
    
    try {
      const response = await authenticatedFetch(getApiUrl("/receipts"), {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === "duplicate_warning") {
          keepSelectionForDuplicate = true;
          setDuplicateWarning(data);
          setIsUploading(false);
          return;
        }

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

        // Parse amount safely
        const rawAmount = ai.total_amount ?? ai.amount ?? ai.value;
        let parsedAmount = parseScannedAmount(rawAmount);

        const merchantName = String(ai.merchant_name || '').trim();
        const finalCategory = categoryOverride || ai.smart_category || 'Outros';
        const ocrFailed = merchantName.includes("OCR Falhou") || merchantName.toLowerCase().startsWith("erro");
        if ((isNaN(parsedAmount) || parsedAmount <= 0) && ocrFailed) {
          showToast("Não foi possível ler o comprovante. Envie uma imagem mais nítida ou cadastre manualmente.", "error");
          setIsUploading(false);
          return;
        }
        parsedAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;

        // Parse date safely
        let parsedDate = new Date().toISOString();
        if (ai.transaction_date) {
           const d = new Date(ai.transaction_date);
           if (!isNaN(d.getTime())) parsedDate = d.toISOString();
        }

        if (categoryOverride && data.database_id) {
          const categoryResponse = await authenticatedFetch(getApiUrl(`/expenses/${data.database_id}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category: categoryOverride }),
          });

          if (!categoryResponse.ok) {
            console.warn("Não foi possível salvar a categoria manual.", await categoryResponse.text());
          }
        }

        const newTx: TransactionEntity = {
          id: data.database_id, 
          total_amount: isNaN(parsedAmount) ? 0 : parsedAmount,
          merchant_name: merchantName || 'Desconhecido',
          category: finalCategory,
          currency: 'BRL',
          transaction_date: parsedDate,
          scanned_at: data.scanned_at || new Date().toISOString(),
          transaction_type: ai.transaction_type || uploadType || 'Outflow',
          payment_method: ai.payment_method || 'Comprovante',
          description: ai.description || undefined,
          destination_institution: ai.destination_institution || undefined,
          transaction_id: ai.transaction_id || undefined,
          masked_cpf: ai.masked_cpf || undefined,
          needs_manual_review: !!ai.needs_manual_review,
          receipt_hash: data.receipt_hash || data.filename || undefined,
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
      if (!keepSelectionForDuplicate) {
        setSelectedFile(null);
        setPendingNote("");
        setReceiptCategory("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
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
    if (filteredByDate.length === 0) return null;
    return [...filteredByDate].sort((a, b) => {
      const idDiff = (Number(b.id) || 0) - (Number(a.id) || 0);
      if (idDiff !== 0) return idDiff;
      return new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime();
    })[0];
  }, [filteredByDate]);

  const recentReceipts = useMemo(() => {
    if (!mostRecentReceipt) return [];
    return [
      mostRecentReceipt,
      ...filteredByDate.filter((tx) => tx.id !== mostRecentReceipt.id).slice(0, 4),
    ];
  }, [filteredByDate, mostRecentReceipt]);

  const getReceiptFields = (tx: TransactionEntity) => {
    const fields = [
      { label: t('fields.merchant'), value: tx.merchant_name },
      { label: t('fields.category'), value: t(`categories.${tx.category}`).replace('categories.', '') },
      { label: t('fields.amount'), value: formatCurrency(tx.total_amount) },
      // Use original_date if available (from our dashboard mapping), otherwise fallback to transaction_date
      { label: t('fields.date'), value: formatDate((tx as any)._original_date || tx.transaction_date) },
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
        const type = (tx.transaction_type || '').toLowerCase();
        if(type === 'outflow' && tx.total_amount) {
            const cat = tx.category || 'Outros';
            map[cat] = (map[cat] || 0) + (Number(tx.total_amount) || 0);
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
         const type = (tx.transaction_type || '').toLowerCase();
         const cat = (tx.category || '').toLowerCase();
         const isInflow = type === 'inflow' || cat === 'receita' || cat === 'income';
         current += (isInflow ? val : -val);
         const date = new Date(tx.transaction_date);
         return { date: new Intl.DateTimeFormat('pt-BR', { month: 'short', day: 'numeric' }).format(date), capital: current };
     });
     if (data.length === 1) data.push({ date: 'Hoje', capital: data[0].capital });
     return data;
  }, [filteredByDate]);

  const dailyInsights = useMemo(() => {
    const today = new Date().toLocaleDateString('sv-SE');
    const todayTxs = filteredByDate.filter(tx => tx.transaction_date && new Date(tx.transaction_date).toLocaleDateString('sv-SE') === today);
    const todayInflow = todayTxs.reduce((acc, tx) => {
      const type = (tx.transaction_type || '').toLowerCase();
      const cat = (tx.category || '').toLowerCase();
      return (type === "inflow" || cat === "receita" || cat === "income") ? acc + tx.total_amount : acc;
    }, 0);
    const todayOutflow = todayTxs.reduce((acc, tx) => {
      const type = (tx.transaction_type || '').toLowerCase();
      const cat = (tx.category || '').toLowerCase();
      return (type === "outflow" && cat !== "receita" && cat !== "income") ? acc + tx.total_amount : acc;
    }, 0);
    const delta = todayInflow - todayOutflow;
    return {
      delta, absDelta: Math.abs(delta),
      message: delta > 0 ? t('dashboard.richer') : (delta < 0 ? t('dashboard.poorer') : t('dashboard.stable')),
      isPositive: delta >= 0
    };
  }, [filteredByDate, t]);

  const weekdayIntensity = useMemo(() => {
    console.log('📅 Calculating weekday intensity from', filteredByDate.length, 'transactions');
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2023, 0, 1 + i); // Jan 1, 2023 was a Sunday
      return formatDateI18n(d, 'EEEEEE');
    });
    const intensity = [0, 0, 0, 0, 0, 0, 0];
    let processedCount = 0;
    filteredByDate.forEach(tx => {
      const type = (tx.transaction_type || '').toLowerCase();
      const cat = (tx.category || '').toLowerCase();
      const isOutflow = type === 'outflow' && cat !== 'receita' && cat !== 'income';
      
      if (isOutflow) {
        const date = new Date(tx.transaction_date);
        if (!isNaN(date.getTime())) {
          intensity[date.getDay()] += Number(tx.total_amount || 0);
          processedCount++;
        }
      }
    });
    const result = days.map((day, i) => ({ day, val: intensity[i] }));
    console.log('📅 Weekday intensity:', { processedTxs: processedCount, byDay: intensity, result });
    return result;
  }, [filteredByDate, formatDateI18n]);

  const paymentMethodsData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredByDate.forEach(tx => {
      const type = (tx.transaction_type || '').toLowerCase();
      const cat = (tx.category || '').toLowerCase();
      const isOutflow = type === 'outflow' && cat !== 'receita' && cat !== 'income';
      
      if (isOutflow) {
        const method = tx.payment_method || 'Outros';
        map[method] = (map[method] || 0) + Number(tx.total_amount || 0);
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredByDate]);

  const inflowCount = useMemo(() => filteredByDate.filter(t => {
    const type = (t.transaction_type || '').toLowerCase();
    const cat = (t.category || '').toLowerCase();
    return type === 'inflow' || cat === 'receita' || cat === 'income';
  }).length, [filteredByDate]);
  
  const outflowCount = useMemo(() => filteredByDate.filter(t => {
    const type = (t.transaction_type || '').toLowerCase();
    const cat = (t.category || '').toLowerCase();
    return type === 'outflow' && cat !== 'receita' && cat !== 'income';
  }).length, [filteredByDate]);
  const totalInflowFiltered = useMemo(() => filteredByDate.reduce((acc, tx) => {
    const type = (tx.transaction_type || '').toLowerCase();
    const cat = (tx.category || '').toLowerCase();
    const isInflow = type === 'inflow' || type === 'entrada' || cat === 'receita' || cat === 'income';
    return isInflow ? acc + Number(tx.total_amount || 0) : acc;
  }, 0), [filteredByDate]);
  
  const totalOutflowFiltered = useMemo(() => filteredByDate.reduce((acc, tx) => {
    const type = (tx.transaction_type || '').toLowerCase();
    const cat = (tx.category || '').toLowerCase();
    const isInflow = type === 'inflow' || type === 'entrada' || cat === 'receita' || cat === 'income';
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
      const type = (tx.transaction_type || '').toLowerCase();
      const cat = (tx.category || '').toLowerCase();
      const isOutflow = type === 'outflow' && cat !== 'receita' && cat !== 'income';
      
      if (!isOutflow) return;
      outflowCount++;
      const date = new Date(tx.transaction_date);
      if (isNaN(date.getTime())) return;
      
      const hour = date.getHours();
      hourlyMap[hour] += Number(tx.total_amount || 0);
      
      const dom = date.getDate();
      dayOfMonthMap[dom] = (dayOfMonthMap[dom] || 0) + Number(tx.total_amount || 0);

      const month = date.toLocaleString('pt-BR', { month: 'short' });
      monthlyMap[month] = (monthlyMap[month] || 0) + Number(tx.total_amount || 0);
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
    <div className="p-4 md:p-5 pt-1 md:pt-2 space-y-5 font-sans" style={{ maxWidth: '100%' }}>
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
            </div>


          {/* TAB 1: HOME */}
          <div className="@container space-y-4 sm:space-y-6">
              
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


                
                {/* Delete demo button — visible while demo data exists, regardless of onboarding state */}
                {transactions.some(tx => tx.receipt_hash?.startsWith('mock_')) && (
                  <button
                    onClick={deleteDemoData}
                    className="ml-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/30 transition-colors whitespace-nowrap"
                  >
                    🗑️ Apagar Dados Demo
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

              {/* ONBOARDING BANNER — first access only, one-time per account */}
              <AnimatePresence>
                {!fireLoading && fireUser && !fireUser.hasUsedDemo && (
                  <motion.div
                    initial={{ opacity: 0, y: -12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12, scale: 0.98 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-900/40 via-purple-800/20 to-pink-900/20 p-4 sm:p-5 shadow-lg"
                  >
                    {/* Decorative blobs */}
                    <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-purple-500/20 blur-2xl" />
                    <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-pink-500/15 blur-2xl" />

                    {/* Dismiss button */}
                    <button
                      onClick={dismissOnboarding}
                      className="absolute right-3 top-3 rounded-full p-1 text-text-tertiary hover:text-text-secondary transition-colors"
                      aria-label="Fechar"
                    >
                      <X size={16} />
                    </button>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Icon */}
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-purple-500/20 text-2xl border border-purple-500/30">
                        🎲
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary">
                          Bem-vindo ao SHARECOM, {fireUser.name.split(' ')[0] || 'usuário'}! 👋
                        </p>
                        <p className="mt-0.5 text-xs text-text-secondary leading-relaxed">
                          Gere dados de demonstração para explorar todas as funcionalidades antes de adicionar seus próprios recibos. Isso pode ser feito apenas <span className="font-semibold text-purple-400">uma vez</span>.
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={dismissOnboarding}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary border border-border hover:border-border-hover transition-colors"
                        >
                          Pular
                        </button>
                        <button
                          onClick={generateMockData}
                          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/80 hover:bg-purple-500 text-white transition-colors shadow-sm"
                        >
                          Gerar Demo
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

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
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={growthData.slice(-10)}>
                          <defs>
                            <linearGradient id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={metric.color} stopOpacity={0.5}/>
                              <stop offset="95%" stopColor={metric.color} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="capital" stroke={metric.color} strokeWidth={2} fillOpacity={1} fill={`url(#grad${i})`} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>

              {/* (5) TRANSACTIONS TABLE - Responsive */}
              {transactions.length > 0 ? (
                <div className="glass-card-static overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-glass-border flex flex-col xs:flex-row justify-between items-start xs:items-center gap-2">
                  <h3 className="text-[14px] sm:text-[16px] font-semibold text-text-primary">{t('dashboard.recentTransactions')}</h3>
                  <Link href="/timeline" className="text-[11px] sm:text-[12px] font-medium text-brand-cyan hover:underline touch-manipulation">{t('common.viewAll')}</Link>
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
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center glass-card">
                   <div className="w-20 h-20 bg-ds-bg-secondary rounded-3xl flex items-center justify-center mb-6 shadow-xl border-thin border-ds-border">
                      <FileText size={40} className="text-ds-text-tertiary" />
                   </div>
                   <h3 className="text-[20px] font-bold text-ds-text-primary mb-2">Nenhuma transação encontrada</h3>
                   <p className="text-[14px] text-ds-text-secondary max-w-xs mx-auto mb-8">
                      Você ainda não possui transações registradas para este período.
                   </p>
                   <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="px-6 py-3 bg-fn-balance text-white rounded-xl font-bold shadow-lg hover:scale-105 transition-all"
                   >
                      ENVIAR COMPROVANTE
                   </button>
                </div>
              )}
            </div>

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
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
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
                        <p className="text-[11px] text-ds-text-tertiary">R$ {tx.total_amount.toLocaleString('pt-BR')} • Excluído</p>
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
            <motion.div 
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-sm bg-ds-bg-primary border-thin border-ds-border rounded-2xl p-6 shadow-2xl"
            >
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

                <div>
                  <label className="text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest block mb-1.5">Categoria (opcional)</label>
                  <input
                    type="text"
                    value={receiptCategory}
                    onChange={(e) => setReceiptCategory(e.target.value)}
                    className="w-full p-3 bg-ds-bg-secondary border-thin border-ds-border rounded-xl text-ds-text-primary focus:border-fn-balance outline-none transition-all"
                    placeholder="Ex: Alimentação, Transporte, Aluguel..."
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 rounded-xl border-thin border-ds-border text-ds-text-secondary font-bold hover:bg-ds-bg-secondary">{t('common.cancel').toUpperCase()}</button>
                <button onClick={() => executeUpload()} className="flex-1 px-4 py-3 rounded-xl bg-fn-balance text-white font-bold shadow-lg hover:scale-105 transition-all">{t('upload.process')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DUPLICATE RECEIPT ALERT */}
      <AnimatePresence>
        {duplicateWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[450] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 16, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full max-w-sm bg-ds-bg-primary border-thin border-ds-border rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-ds-text-primary">Comprovante já escaneado</h3>
                  <p className="text-[12px] text-ds-text-tertiary">
                    Escaneado {duplicateWarning.times_scanned || 1}x anteriormente
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-ds-bg-secondary border-thin border-ds-border p-4 space-y-3 mb-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[12px] text-ds-text-tertiary">Valor escaneado</span>
                  <span className="text-[14px] font-bold text-fn-income tabular-nums">
                    {formatCurrency(parseScannedAmount(duplicateWarning.existing?.total_amount ?? duplicateWarning.existing?.amount ?? duplicateWarning.existing?.value))}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[12px] text-ds-text-tertiary">Estabelecimento</span>
                  <span className="text-[13px] font-medium text-ds-text-primary truncate">
                    {String(duplicateWarning.existing?.merchant_name || duplicateWarning.existing?.merchant || "Desconhecido")}
                  </span>
                </div>
              </div>

              <p className="text-[13px] text-ds-text-secondary mb-6">
                Deseja continuar e adicionar este comprovante mesmo assim?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    haptics.lightTap();
                    setDuplicateWarning(null);
                    setSelectedFile(null);
                    setPendingNote("");
                    setReceiptCategory("");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="flex-1 px-4 py-3 rounded-xl border-thin border-ds-border text-ds-text-secondary font-bold hover:bg-ds-bg-secondary"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => executeUpload(true)}
                  disabled={isUploading}
                  className="flex-1 px-4 py-3 rounded-xl bg-amber-500 text-white font-bold shadow-lg hover:scale-105 transition-all disabled:opacity-60 disabled:hover:scale-100"
                >
                  {isUploading ? "Enviando..." : "Continuar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MANUAL TRANSACTION MODAL */}
      <AnimatePresence>
        {showManualModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-md bg-ds-bg-primary border-thin border-ds-border rounded-2xl shadow-2xl overflow-hidden"
            >
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
    </div>
  );
}

export default ExpenseTracker;
