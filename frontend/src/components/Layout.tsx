"use client";

import React, { useState, useRef, useEffect } from "react";

import Link from "next/link";
import { LayoutDashboard, History, PieChart, Settings, Plus, Loader2, CheckCircle2, LogOut, Sun, Moon, ScanLine, Camera, Image, FileText, X, ClipboardPaste, Link2, ArrowDown, ArrowUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { getApiUrl } from "../lib/api";
import { authenticatedFetch } from "../lib/auth";
import { useTransactionStore } from "../store/useTransactionStore";
import { TransactionEntity } from "../lib/db";
import { auth } from "@/lib/firebase";
import { signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";

export default function Layout({ children }: { children: React.ReactNode }) {
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

  // Timer para invalidar links antigos (60 segundos)
  useEffect(() => {
    if (showModal && pastedAt && !selectedFile) {
      const timer = setInterval(() => {
        const now = Date.now();
        if (now - pastedAt > 60000) {
          setShowModal(false);
          setPastedContent("");
          setPastedAt(null);
          setToast({ message: "Link expirado (limite de 1 minuto)", type: 'error' });
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showModal, pastedAt, selectedFile]);

  const handlePasteLink = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.trim() === "") {
        setToast({ message: "Nenhum link disponível no clipboard", type: 'error' });
        return;
      }

      setPastedContent(text);
      setPastedAt(Date.now());
      setPendingNote("");
      setShowModal(true);
      setShowScanMenu(false);
    } catch (err) {
      setToast({ message: "Permita o acesso à área de transferência para colar", type: 'error' });
      console.error("Erro ao ler clipboard:", err);
    }
  };
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isDark, setIsDark] = useState(false);
  const isLoginPage = pathname === "/login";

  React.useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
  }, []);

  React.useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

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
        const ai = data.ai_data || {};

        const newTx: TransactionEntity = {
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
          is_synced: false,
          note: data.note || undefined
        };

        if (ai.merchant_name && ai.merchant_name.includes("Check API Key")) {
          alert("O backend está rodando, mas a GEMINI_API_KEY está ausente ou inválida. Por favor, configure o arquivo backend/.env");
          return;
        }
        if (ai.merchant_name && ai.merchant_name.includes("Limite Gemini atingido")) {
          alert("Limite de uso da API Gemini atingido. Aguarde o reset da cota ou troque para um plano com mais capacidade.");
          return;
        }

        console.log("SHARECOM: Salvando localmente...");
        await addTransaction(newTx);
        console.log("SHARECOM: Sincronizando com o backend...");
        await syncWithBackend(); // Força re-sync com o backend para atualizar os dashboards
        console.log("SHARECOM: Sincronização finalizada.");
        setLastAdded({ amount: newTx.total_amount, merchant: newTx.merchant_name });
        setUploadSuccess(true);
        setTimeout(() => {
          setUploadSuccess(false);
          setLastAdded(null);
        }, 4000);
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
    }
  };

  const navItems = [
    { name: "Painel", href: "/", icon: LayoutDashboard },
    { name: "Histórico", href: "/timeline", icon: History },
    { name: "Scanner", href: "/scanner", icon: ScanLine },
    { name: "Relatórios", href: "/reports", icon: PieChart },
    { name: "Link", onClick: handlePasteLink, icon: Link2 },
  ];

  const handleLogout = async () => {
    if (!auth) {
      alert("Firebase Auth não está configurado.");
      return;
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
      alert("Não foi possível encerrar sua sessão.");
    }
  };

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen flex-col md:flex-row" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 sticky top-2 mx-3 z-50 shadow-xl" style={{
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
        borderRadius: '16px'
      }}>
        <div className="flex items-center gap-2">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || "Perfil"}
              className="w-8 h-8 rounded-full"
              style={{ border: '0.5px solid var(--ds-border)' }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-medium text-[10px]" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              {user?.displayName?.[0] || "U"}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 shadow-sm">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-lg font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>SHARECOM</h1>
        </div>

        <button onClick={toggleTheme} className="p-1.5 rounded-md" style={{ color: 'var(--text-secondary)' }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      {/* Header Fade Effect (Subtle & Small) */}
      <div className="md:hidden sticky top-[68px] left-0 right-0 h-3 z-40 pointer-events-none" style={{ background: 'linear-gradient(to bottom, var(--bg-primary) 0%, transparent 100%)', marginTop: '-12px' }}></div>

      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-60 p-4 space-y-6 overflow-y-auto scroll-container no-scrollbar h-screen sticky top-0" style={{ backgroundColor: 'var(--bg-secondary)', borderRight: '0.5px solid var(--ds-border)' }}>
        <div className="flex items-center justify-between px-2 pt-2">
          <div className="flex items-center gap-2">
             <div className="w-7 h-7 rounded-md overflow-hidden border border-black/5 shadow-sm">
               <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
             </div>
             <h1 className="text-xl font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>SHARECOM</h1>
          </div>
          <button onClick={toggleTheme} className="p-1.5 rounded-md" style={{ color: 'var(--text-secondary)' }}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        {/* User Profile Info */}
        {user && (
          <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || "Perfil"}
                className="w-10 h-10 rounded-full"
                style={{ border: '0.5px solid var(--ds-border)' }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                {user.displayName?.[0] || "U"}
              </div>
            )}
            <div className="overflow-hidden">
              <p className="text-label" style={{ color: 'var(--text-tertiary)' }}>{getGreeting()}</p>
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user.displayName}</p>
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
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

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all"
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
        className="hidden"
        accept="image/*,application/pdf"
      />
      <input
        type="file"
        ref={galleryInputRef}
        onChange={handleFileSelection}
        className="hidden"
        accept="image/*"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileSelection}
        className="hidden"
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
                  onClick={() => { setShowScanMenu(false); cameraInputRef.current?.click(); }}
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
                  onClick={() => { setShowScanMenu(false); galleryInputRef.current?.click(); }}
                  className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-black/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <Image size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">Galeria</p>
                    <p className="text-[10px] text-gray-500">Escolher das fotos</p>
                  </div>
                </button>

                <button
                  onClick={() => { setShowScanMenu(false); fileInputRef.current?.click(); }}
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
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.82)' : 'rgba(255, 255, 255, 0.82)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
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
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', border: '0.5px solid var(--ds-border)' }}
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
                      backgroundColor: uploadType === 'Outflow' ? 'rgba(239, 68, 68, 0.12)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
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
                      backgroundColor: uploadType === 'Inflow' ? 'rgba(16, 185, 129, 0.12)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
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
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
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
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] w-[90%] max-w-sm animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-white/20 backdrop-blur-md bg-opacity-90">
              <div className="bg-white/20 p-2 rounded-full">
                <CheckCircle2 size={24} />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Gasto Adicionado</p>
                <p className="text-sm font-semibold truncate">{lastAdded.merchant}</p>
              </div>
              <div className="text-right whitespace-nowrap">
                <p className="text-lg font-bold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lastAdded.amount)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Global Loading Bar */}
        <div className={`fixed top-0 left-0 w-full h-1 z-[100] transition-opacity duration-300 ${(isUploading || uploadSuccess) ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div
            className="h-full transition-all ease-out"
            style={{
              backgroundColor: '#10B981',
              width: uploadSuccess ? '100%' : (isUploading ? '90%' : '0%'),
              transitionDuration: isUploading ? '15s' : '0.5s'
            }}
          ></div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-container pb-20 md:pb-0">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </div>

        {/* Bottom Nav - Mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 px-4 flex items-center justify-around z-50 shadow-[0_-8px_30px_rgba(0,0,0,0.2)]" style={{
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px)',
          borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
          borderRadius: '24px 24px 0 0',
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: 'translateZ(0)',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale'
        }}>
          {navItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            const isActive = item.href ? pathname === item.href : false;

            if (item.onClick) {
              return (
                <button
                  key={item.name}
                  onClick={item.onClick}
                  className="flex flex-col items-center space-y-0.5 transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <Icon size={20} />
                  <span className="text-[11px] font-semibold">{item.name}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href || "#"}
                className="flex flex-col items-center space-y-0.5 transition-colors"
                style={{ color: isActive ? '#3B82F6' : 'var(--text-tertiary)' }}
              >
                <Icon size={20} />
                <span className="text-[11px] font-semibold">{item.name}</span>
              </Link>
            );
          })}

          {/* Central Scan Button - opens camera on mobile */}
          <div className="relative -top-4 flex flex-col items-center">
            <button
              onClick={() => setShowScanMenu(true)}
              disabled={isUploading}
              className="w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-all text-white"
              style={{
                backgroundColor: uploadSuccess ? '#10B981' : '#3B82F6',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              }}
            >
              {isUploading ? (
                <Loader2 size={24} className="animate-spin" />
              ) : uploadSuccess ? (
                <CheckCircle2 size={24} />
              ) : (
                <Camera size={24} strokeWidth={2} />
              )}
            </button>
            <span className="text-[10px] font-medium mt-0.5" style={{ color: '#3B82F6' }}>Scan</span>
          </div>

          {[navItems[3], navItems[4]].map((item) => {
            const Icon = item.icon;
            const isActive = item.href ? pathname === item.href : false;

            if (item.onClick) {
              return (
                <button
                  key={item.name}
                  onClick={item.onClick}
                  className="flex flex-col items-center space-y-0.5 transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-medium">{item.name}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href || "#"}
                className="flex flex-col items-center space-y-0.5 transition-colors"
                style={{ color: isActive ? '#3B82F6' : 'var(--text-tertiary)' }}
              >
                <Icon size={20} />
                <span className="text-[10px] font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
