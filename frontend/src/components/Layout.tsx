"use client";

import React, { useState, useRef, useEffect } from "react";

import NextImage from "next/image";
import Link from "next/link";
import { LayoutDashboard, History, PieChart, Settings, Plus, Loader2, CheckCircle2, LogOut, ScanLine, Camera, Image as LucideImage, FileText, X, ClipboardPaste, Link2, ArrowDown, ArrowUp, ArrowDownLeft, ArrowUpRight, Target, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { getApiUrl } from "../lib/api";
import { authenticatedFetch } from "../lib/auth";
import { useTransactionStore } from "../store/useTransactionStore";
import { TransactionEntity } from "../lib/db";
import { auth } from "@/lib/firebase";
import { signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";

import { useI18n } from "../i18n/client";

type NavItem = {
  name: string;
  href?: string;
  icon: LucideIcon;
  onClick?: () => void;
};

const hiddenFileInputClassName = "fixed left-0 top-0 h-px w-px opacity-0 pointer-events-none";

const extractUrlFromText = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed).toString();
  } catch {
    const match = trimmed.match(/https?:\/\/[^\s]+/i);
    return match?.[0] ?? "";
  }
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const { addTransaction, syncWithBackend, pendingNote, setPendingNote } = useTransactionStore();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [lastAdded, setLastAdded] = useState<{ amount: number, merchant: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [uploadType, setUploadType] = useState<"Inflow" | "Outflow">("Outflow");
  const [showScanMenu, setShowScanMenu] = useState(false);
  const [pastedContent, setPastedContent] = useState("");
  const [pastedAt, setPastedAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const documentsInputRef = useRef<HTMLInputElement>(null);
  const portalScrollRef = useRef<HTMLDivElement>(null);

  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (uploadSuccess && lastAdded) {
      const exitTimer = setTimeout(() => setIsExiting(true), 3700);
      const removeTimer = setTimeout(() => {
        setUploadSuccess(false);
        setIsExiting(false);
        setLastAdded(null);
      }, 4000);
      return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
    }
  }, [uploadSuccess, lastAdded]);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (uploadSuccess && lastAdded) {
      meta?.setAttribute('content', uploadType === 'Inflow' ? '#10B981' : '#EF4444');
    } else {
      meta?.setAttribute('content', '#0A0A0F');
    }
  }, [uploadSuccess, lastAdded, uploadType]);

  // Timer para invalidar links antigos (60 segundos)
  useEffect(() => {
    if (showModal && pastedAt && !selectedFile) {
      const timer = setInterval(() => {
        const now = Date.now();
        if (now - pastedAt > 60000) {
          setShowModal(false);
          setPastedContent("");
          setPastedAt(null);
          // setToast({ message: "Link expirado (limite de 1 minuto)", type: 'error' });
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showModal, pastedAt, selectedFile]);


  const handlePasteLink = async () => {
    setShowScanMenu(false);

    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find(type => type.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const extension = imageType.split('/')[1] || 'png';
            const file = new File([blob], `pasted-image-${Date.now()}.${extension}`, { type: imageType });

            setSelectedFile(file);
            setPastedContent("");
            setPastedAt(null);
            setPendingNote("");
            setShowModal(true);
            return;
          }
        }
      }
    } catch (err) {
      console.warn("Não foi possível ler imagem do clipboard, tentando texto.", err);
    }

    try {
      const text = await navigator.clipboard.readText();
      const url = extractUrlFromText(text);
      if (!url) {
        // setToast({ message: "Clipboard vazio ou formato não suportado", type: 'error' });
        return;
      }

      setPastedContent(url);
      setSelectedFile(null); // Limpa arquivo se houver
      setPastedAt(Date.now());
      setPendingNote("");
      setShowModal(true);
    } catch (err) {
      // setToast({ message: "Permita o acesso à área de transferência", type: 'error' });
      console.error("Erro ao ler clipboard:", err);
    }
  };
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const isAuthPage = pathname === "/login" || pathname === "/reset-password";

  React.useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };


  React.useEffect(() => {
    const handleShareTarget = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get("share-target")) {
        try {
          // Busca o arquivo no cache do Service Worker
          const cache = await caches.open('shared-files');
          const response = await cache.match('/api/shared-file-tmp');

          if (response) {
            const blob = await response.blob();
            const file = new File([blob], `shared-receipt-${Date.now()}.jpg`, { type: blob.type });

            // Define o arquivo e mostra o modal
            setSelectedFile(file);
            setShowModal(true);

            // Limpa o cache
            await cache.delete('/api/shared-file-tmp');

            // Limpa a URL sem recarregar a página
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
          }
        } catch (err) {
          console.error("Erro ao recuperar arquivo compartilhado:", err);
        }
      }
    };

    handleShareTarget();
  }, [pathname]);

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadType("Outflow");
    setShowModal(true);
  };

  const executeUpload = async () => {
    if (!selectedFile && !pastedContent) return;

    setShowModal(false);
    setIsUploading(true);
    const formData = new FormData();
    if (selectedFile) {
      formData.append("received_file", selectedFile, selectedFile.name);
    }

    // Se for link: envia o URL limpo em campo separado, e o comentário em 'note'
    if (!selectedFile && pastedContent) {
      formData.append("receipt_url", pastedContent.trim());
    }
    // Tipo de transação selecionado pelo usuário
    formData.append("transaction_type", uploadType);
    // Nota/comentário do usuário (opcional)
    if (pendingNote.trim()) {
      formData.append("note", pendingNote.trim());
    } else if (selectedFile && !pendingNote.trim()) {
      // sem nota, não adiciona nada
    }

    try {
      const apiUrl = getApiUrl("/process-ata");
      console.log("SHARECOM: Tentando enviar para:", apiUrl);
      const response = await authenticatedFetch(apiUrl, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === "duplicate_warning") {
          alert("Este comprovante já foi escaneado anteriormente. Use o scanner para adicionar mesmo assim.");
          return;
        }

        const ai = data.ai_data || {};
        const rawAmount = typeof ai.total_amount === "string"
          ? parseFloat(ai.total_amount.replace(/[^\d.,]/g, "").replace(",", "."))
          : Number(ai.total_amount) || 0;
        const parsedAmount = Number.isFinite(rawAmount) ? rawAmount : 0;
        const merchantName = String(ai.merchant_name || "").trim();

        if (merchantName.includes("Check API Key")) {
          alert("O backend está rodando, mas a GEMINI_API_KEY está ausente ou inválida. Por favor, configure o arquivo backend/.env");
          return;
        }
        if (merchantName.includes("Limite Gemini atingido")) {
          alert("Limite de uso da API Gemini atingido. Aguarde o reset da cota ou troque para um plano com mais capacidade.");
          return;
        }
        const ocrFailed = merchantName.includes("OCR Falhou") || merchantName.toLowerCase().startsWith("erro");
        if (parsedAmount <= 0 && ocrFailed) {
          alert("Não foi possível ler o comprovante. Envie uma imagem mais nítida ou cadastre manualmente.");
          return;
        }

        const newTx: TransactionEntity = {
          total_amount: parsedAmount,
          merchant_name: merchantName || 'Desconhecido',
          category: ai.smart_category || 'Outros',
          currency: 'BRL',
          transaction_date: ai.transaction_date || new Date().toISOString(),
          transaction_type: ai.transaction_type || uploadType || 'Outflow',
          payment_method: ai.payment_method || 'Comprovante',
          description: ai.description || undefined,
          destination_institution: ai.destination_institution || undefined,
          transaction_id: ai.transaction_id || undefined,
          masked_cpf: ai.masked_cpf || undefined,
          needs_manual_review: !!ai.needs_manual_review,
          receipt_hash: data.filename || undefined,
          is_synced: false,
          note: data.note || undefined
        };

        console.log("SHARECOM: Salvando localmente...");
        await addTransaction(newTx);
        console.log("SHARECOM: Sincronizando com o backend...");
        await syncWithBackend(); // Força re-sync com o backend para atualizar os dashboards
        console.log("SHARECOM: Sincronização finalizada.");
        setLastAdded({ amount: newTx.total_amount, merchant: newTx.merchant_name });
        setUploadSuccess(true);
      } else {
        if (response.status === 401) {
          alert("Sua sessão expirou. Faça login novamente para continuar.");
          return;
        }
        const errorText = await response.text();
        let errorMsg = errorText || "Falha no servidor.";
        try {
          const errObj = JSON.parse(errorText);
          if (errObj.detail) errorMsg = errObj.detail;
        } catch (e) { }
        alert(`Erro ao processar: ${errorMsg}`);
      }
    } catch (e) {
      console.error("Fetch error:", e);
      if (e instanceof DOMException && e.name === "ConstraintError") {
        alert("Este recibo já foi registrado localmente.");
        return;
      }
      if (e instanceof Error && e.message === "AUTH_REQUIRED") {
        alert("Você precisa estar autenticado para enviar recibos.");
        return;
      }
      alert("Erro de conexão com o servidor de IA. Verifique se o backend está ativo na URL configurada (NEXT_PUBLIC_API_BASE_URL).");
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
      setPendingNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (documentsInputRef.current) documentsInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const openCameraPicker = () => {
    cameraInputRef.current?.click();
    setShowScanMenu(false);
  };

  const openGalleryPicker = () => {
    galleryInputRef.current?.click();
    setShowScanMenu(false);
  };

  const openDocumentPicker = () => {
    documentsInputRef.current?.click();
    setShowScanMenu(false);
  };

  const desktopNavItems: NavItem[] = [
    { name: t('nav.home'), href: "/", icon: LayoutDashboard },
    { name: "Histórico", href: "/timeline", icon: History },
    { name: t('nav.analytics'), href: "/reports", icon: PieChart },
    { name: t('nav.goals'), href: "/goals", icon: Target },
  ];

  const mobileNavItems: NavItem[] = [
    { name: t('nav.home'), href: "/", icon: LayoutDashboard },
    { name: "Histórico", href: "/timeline", icon: History },
    { name: t('nav.analytics'), href: "/reports", icon: PieChart },
    { name: t('nav.goals'), href: "/goals", icon: Target },
  ];


  const handleLogout = async () => {
    if (!auth) {
      alert("Firebase Auth não está configurado.");
      return;
    }

    try {
      await signOut(auth);
      // Forçar redirecionamento manual após logout
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout failed:", error);
      alert("Não foi possível encerrar sua sessão.");
    }
  };

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen flex-col md:flex-row" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>

      {/* ── Global Loading Bar ── fixed to the true viewport top ── */}
      {isUploading && (
        <div className='fixed top-0 left-0 right-0 z-[500]' style={{paddingTop: 'env(safe-area-inset-top)'}}>
          <div className='h-1 bg-[#8B5CF6]/30'>
            <div className='h-full bg-[#8B5CF6] animate-loading-bar rounded-full' />
          </div>
        </div>
      )}

      {/* Mobile Header */}
      <div className="md:hidden sticky top-0 z-50 mobile-header-shell">
        <div className="mobile-status-bridge" aria-hidden="true" />

        <div>
          <header className="mobile-header-card flex items-center justify-between p-4 shadow-none dark:shadow-xl">
            <div className="flex items-center gap-2 w-8">
              {/* Espaço reservado para manter o logo centralizado via justify-between */}
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg overflow-hidden border-2 border-purple-500/60 shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                <NextImage src="/logo.png" alt="Logo" width={32} height={32} className="w-full h-full object-cover scale-[1.15]" />
              </div>
              <h1 className="text-lg font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>SHARE<span className="text-purple-500">COM</span></h1>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/settings" className="p-1.5 rounded-md hover:bg-black/5" style={{ color: 'var(--text-secondary)' }}>
                <Settings size={18} />
              </Link>
              <button onClick={handleLogout} className="p-1.5 rounded-md hover:bg-black/5" style={{ color: 'var(--text-secondary)' }}>
                <LogOut size={18} />
              </button>
            </div>
          </header>
        </div>

        <div className="mobile-header-fade" aria-hidden="true" />
      </div>

      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-60 p-4 space-y-6 overflow-y-auto scroll-container no-scrollbar h-screen sticky top-0" style={{ backgroundColor: 'var(--bg-secondary)', borderRight: '0.5px solid var(--ds-border)' }}>
        <div className="flex items-center justify-between px-2 pt-2">
          <div className="flex items-center gap-2">
             <div className="w-7 h-7 rounded-md overflow-hidden border-2 border-purple-500/60 shadow-[0_0_10px_rgba(139,92,246,0.3)]">
               <NextImage src="/logo.png" alt="Logo" width={28} height={28} className="w-full h-full object-cover scale-[1.15]" />
             </div>
             <h1 className="text-xl font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>SHARE<span className="text-purple-500">COM</span></h1>
          </div>
        </div>



        <nav className="flex-1 space-y-1">
          {desktopNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href ? pathname === item.href : false;

            if (item.onClick) {
              return (
                <button
                  key={item.name}
                  onClick={item.onClick}
                  className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-black/5"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Icon size={20} />
                  <span className="font-medium text-sm">{item.name}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href || "#"}
                className="flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200"
                style={{
                  backgroundColor: isActive ? '#3B82F6' : 'transparent',
                  color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                }}
              >
                <Icon size={20} />
                <span className="font-medium text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 pt-4" style={{ borderTop: '0.5px solid var(--ds-border)' }}>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium text-sm transition-all active:scale-[0.97] disabled:opacity-50"
            style={{
              backgroundColor: uploadSuccess ? '#10B981' : '#3B82F6',
              color: '#FFFFFF',
              borderRadius: '6px',
            }}
          >
            {isUploading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : uploadSuccess ? (
              <CheckCircle2 size={18} />
            ) : (
              <Plus size={18} strokeWidth={2.5} />
            )}
            <span>{uploadSuccess ? "Enviado!" : "Enviar Comprovante"}</span>
          </button>

          <Link
            href="/settings"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all hover:bg-black/5"
            style={{ color: 'var(--text-secondary)', border: '0.5px solid var(--ds-border)', borderRadius: '6px' }}
          >
            <Settings size={16} />
            <span>Configurações</span>
          </Link>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all hover:bg-black/5"
            style={{ color: 'var(--text-secondary)', border: '0.5px solid var(--ds-border)', borderRadius: '6px' }}
          >
            <LogOut size={16} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelection}
        className={hiddenFileInputClassName}
        tabIndex={-1}
        aria-hidden="true"
        accept="image/*,application/pdf"
      />
      <input
        type="file"
        ref={galleryInputRef}
        onChange={handleFileSelection}
        className={hiddenFileInputClassName}
        tabIndex={-1}
        aria-hidden="true"
        accept="image/*"
      />
      <input
        type="file"
        ref={documentsInputRef}
        onChange={handleFileSelection}
        className={hiddenFileInputClassName}
        tabIndex={-1}
        aria-hidden="true"
        accept="application/pdf"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileSelection}
        className={hiddenFileInputClassName}
        tabIndex={-1}
        aria-hidden="true"
        accept="image/*"
        capture="environment"
      />

      {/* Mobile Scan Action Sheet */}
      {showScanMenu && (
        <div className="fixed inset-0 z-[250] md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowScanMenu(false)} />
          <div className="absolute bottom-0 left-0 right-0 animate-in slide-in-from-bottom duration-300">
            <div
              className="mx-4 mb-8 rounded-2xl overflow-hidden shadow-2xl border"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--ds-border)' }}
            >
              <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--ds-border)' }}>
                <h3 className="font-semibold text-sm">Escanear Comprovante</h3>
                <button onClick={() => setShowScanMenu(false)} className="p-1 rounded-full hover:bg-black/5">
                  <X size={18} />
                </button>
              </div>

              <div className="p-2 space-y-1">
                <button
                  onClick={openCameraPicker}
                  className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-black/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    <Camera size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">Câmera</p>
                    <p className="text-[10px] text-gray-500">Tirar foto agora</p>
                  </div>
                </button>

                <button
                  onClick={openGalleryPicker}
                  className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-black/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <LucideImage size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">Galeria</p>
                    <p className="text-[10px] text-gray-500">Escolher das fotos</p>
                  </div>
                </button>

                <button
                  onClick={openDocumentPicker}
                  className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-black/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">Arquivos</p>
                    <p className="text-[10px] text-gray-500">Escolher PDF ou documento</p>
                  </div>
                </button>

                <button
                  onClick={handlePasteLink}
                  className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-black/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <Link2 size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">Link do Clipboard</p>
                    <p className="text-[10px] text-gray-500">Detectar link ou imagem copiada</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />

          {/* Glass card — same frosted-glass style as the header */}
          <div
            className="w-full max-w-sm relative z-10 overflow-hidden rounded-2xl shadow-2xl"
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.82)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <div className="p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Confirmar Envio</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-black/10"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* File / Link preview */}
              {selectedFile ? (
                <div
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '0.5px solid var(--ds-border)' }}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)', color: '#3B82F6' }}>
                    <FileText size={18} />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-tertiary)' }}>Arquivo Selecionado</p>
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{selectedFile?.name}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20" style={{ backgroundColor: 'rgba(16, 185, 129, 0.07)' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-500">
                    <Link2 size={20} />
                  </div>
                  <div className="overflow-hidden flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/70">Link Detectado</p>
                    <p className="text-[11px] font-mono truncate opacity-80" style={{ color: 'var(--text-primary)' }}>{pastedContent}</p>
                  </div>
                </div>
              )}

              {/* ── Transaction direction selector ── */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Tipo de Movimentação</p>
                <div className="grid grid-cols-2 gap-2">
                  {/* Outflow (Saída) */}
                  <button
                    onClick={() => setUploadType("Outflow")}
                    className="relative flex flex-col items-center gap-1.5 py-3 rounded-xl font-medium text-sm transition-all duration-200 active:scale-95"
                    style={{
                      backgroundColor: uploadType === 'Outflow' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255,255,255,0.05)',
                      border: uploadType === 'Outflow' ? '1.5px solid rgba(239, 68, 68, 0.6)' : '1px solid var(--ds-border)',
                      color: uploadType === 'Outflow' ? '#EF4444' : 'var(--text-tertiary)',
                      boxShadow: uploadType === 'Outflow' ? '0 0 12px rgba(239,68,68,0.15)' : 'none',
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                      style={{ backgroundColor: uploadType === 'Outflow' ? 'rgba(239,68,68,0.2)' : 'transparent' }}
                    >
                      <ArrowDown size={18} strokeWidth={2.5} />
                    </div>
                    <span className="text-[12px] font-semibold">Saída</span>
                    {uploadType === 'Outflow' && (
                      <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                    )}
                  </button>

                  {/* Inflow (Entrada) */}
                  <button
                    onClick={() => setUploadType("Inflow")}
                    className="relative flex flex-col items-center gap-1.5 py-3 rounded-xl font-medium text-sm transition-all duration-200 active:scale-95"
                    style={{
                      backgroundColor: uploadType === 'Inflow' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.05)',
                      border: uploadType === 'Inflow' ? '1.5px solid rgba(16, 185, 129, 0.6)' : '1px solid var(--ds-border)',
                      color: uploadType === 'Inflow' ? '#10B981' : 'var(--text-tertiary)',
                      boxShadow: uploadType === 'Inflow' ? '0 0 12px rgba(16,185,129,0.15)' : 'none',
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                      style={{ backgroundColor: uploadType === 'Inflow' ? 'rgba(16,185,129,0.2)' : 'transparent' }}
                    >
                      <ArrowUp size={18} strokeWidth={2.5} />
                    </div>
                    <span className="text-[12px] font-semibold">Entrada</span>
                    {uploadType === 'Inflow' && (
                      <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                    )}
                  </button>
                </div>
              </div>

              {/* Comment textarea */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Comentário (opcional)</label>
                <textarea
                  value={pendingNote}
                  onChange={(e) => setPendingNote(e.target.value)}
                  placeholder="Ex: Almoço com cliente, treino de futebol..."
                  className="w-full rounded-xl p-3 text-sm focus:outline-none transition-colors h-20 resize-none"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    border: '0.5px solid var(--ds-border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95"
                  style={{ border: '0.5px solid var(--ds-border)', color: 'var(--text-secondary)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={executeUpload}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                  style={{
                    background: uploadType === 'Outflow'
                      ? 'linear-gradient(135deg, #EF4444, #DC2626)'
                      : 'linear-gradient(135deg, #10B981, #059669)',
                    boxShadow: uploadType === 'Outflow'
                      ? '0 4px 15px rgba(239,68,68,0.3)'
                      : '0 4px 15px rgba(16,185,129,0.3)',
                  }}
                >
                  Enviar Agora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Global Success Notification Toast */}
        {uploadSuccess && lastAdded && (
          <div className={`fixed top-0 left-0 right-0 z-[600] ${isExiting ? 'scan-card-exit' : 'scan-card'}`}>
            <div 
              className={`w-full transition-all duration-500 ease-out ${uploadType === 'Inflow' ? 'bg-[#10B981]' : 'bg-[#EF4444]'} rounded-b-[24px] shadow-2xl`} 
              style={{ paddingTop: 'env(safe-area-inset-top)', minHeight: 'env(safe-area-inset-top)' }}
            >
              <div className={`w-full px-6 pb-5 pt-3 ${uploadType === 'Inflow' ? 'bg-[#10B981]/90' : 'bg-[#EF4444]/90'} backdrop-blur-xl rounded-b-[24px]`}>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-white/70 text-xs font-medium uppercase tracking-wider'>
                      {uploadType === 'Inflow' ? 'Entrada recebida' : 'Saída registrada'}
                    </p>
                    <p className='text-white text-3xl font-bold mt-1'>
                      {uploadType === 'Inflow' ? '+' : '-'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lastAdded.amount)}
                    </p>
                    <p className='text-white/80 text-sm mt-1 truncate max-w-[200px]'>{lastAdded.merchant}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-white/20`}>
                    {uploadType === 'Inflow' ? <ArrowDownLeft className='text-white' size={24} /> : <ArrowUpRight className='text-white' size={24} />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}



        <div className="flex-1 overflow-y-auto scroll-container pb-28 md:pb-0">
          <div className="max-w-7xl mx-auto w-full grid grid-cols-1 grid-rows-1">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ 
                  duration: 0.25, 
                  ease: "easeInOut" 
                }}
                className="col-start-1 row-start-1 w-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom Nav - Mobile (Fixed 5-item Bar) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 z-50" style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {/* Central Scan Button - Fixed and Molded (Extra Large Size) */}
          <div className="absolute left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center" style={{ top: '-25px' }}>
            <button
              onClick={() => setShowScanMenu(true)}
              disabled={isUploading}
              className="w-20 h-20 rounded-full flex items-center justify-center active:scale-90 hover:scale-105 transition-all text-white cursor-pointer touch-manipulation select-none"
              style={{
                backgroundColor: uploadSuccess ? '#10B981' : '#3B82F6',
                boxShadow: '0 8px 20px rgba(59, 130, 246, 0.5)',
              }}
            >
              {isUploading ? (
                <Loader2 size={36} className="animate-spin" />
              ) : uploadSuccess ? (
                <CheckCircle2 size={36} />
              ) : (
                <Camera size={36} strokeWidth={2.2} />
              )}
            </button>
          </div>

          {/* Wave Background with Precise SVG Notch */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            <svg width="100%" height="100%" className="w-full h-full" style={{ filter: 'drop-shadow(0 -4px 12px rgba(0,0,0,0.1))' }}>
              <defs>
                <mask id="notch-mask">
                  <rect width="100%" height="100%" fill="white" />
                  {/* Recorte descido para acompanhar o botão (cy=15) */}
                  <ellipse cx="50%" cy="15" rx="48" ry="52" fill="black" />
                </mask>
              </defs>
              <rect 
                width="100%" 
                height="100%" 
                fill="var(--mobile-header-surface)" 
                mask="url(#notch-mask)"
                style={{ fillOpacity: 0.98, backdropFilter: 'blur(20px)' }}
              />
            </svg>
          </div>

          {/* Borda superior com corte seco e vão real (Sem SVG/Fade) */}
          <div className="absolute top-0 left-0 right-0 h-[0.5px] z-20 pointer-events-none opacity-20">
            <div className="absolute left-0 top-0 h-full bg-white" style={{ width: 'calc(50% - 48px)' }} />
            <div className="absolute right-0 top-0 h-full bg-white" style={{ width: 'calc(50% - 48px)' }} />
          </div>

          {/* Interaction & Icons Layer - Static Fixed Nav */}
          <div className="absolute inset-0 z-40 pointer-events-auto">
            {mobileNavItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = item.href ? pathname === item.href : false;
              // Positions: 0%, 20%, [Gap 40-60 for Scan Button], 60%, 80%
              const finalPos = index < 2 ? `${index * 20}%` : `${(index + 1) * 20}%`;

              return (
                <div
                  key={item.href || item.name}
                  className="absolute top-0 bottom-0 flex flex-col items-center justify-center gap-1.5 py-2"
                  style={{ left: finalPos, width: '20%' }}
                >
                  <Link
                    href={item.href || "#"}
                    className="flex flex-col items-center justify-center w-full h-full active:opacity-60 transition-opacity touch-manipulation"
                    style={{ color: isActive ? '#3B82F6' : 'var(--text-tertiary)' }}
                  >
                    <Icon size={22} strokeWidth={1.5} />
                    <span className="text-[10px] font-semibold text-center leading-tight truncate w-full px-1">
                      {item.name}
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </nav>
      </main>
    </div>
  );
}
