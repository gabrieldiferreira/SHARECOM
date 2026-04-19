"use client";

import { useState, useEffect } from "react";
import { Download, Smartphone, ChevronLeft, Loader2 } from "lucide-react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // 1. Verifica se já está instalado para não mostrar nada
    const checkInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      if (isStandalone) {
        setIsVisible(false);
      } else {
        // Se não for standalone, mostra a etiqueta após 1.5s
        setTimeout(() => setIsVisible(true), 1500);
      }
    };

    checkInstalled();

    // 2. Captura o evento nativo de instalação do navegador
    const handler = (e: any) => {
      console.log("SHARECOM: Sistema de instalação pronto! ✅");
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // 3. Detecta quando o app termina de ser instalado para sumir com a etiqueta
    window.addEventListener("appinstalled", () => {
      console.log("SHARECOM: App instalado com sucesso! 🎉");
      setIsVisible(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // Se o Chrome ainda não liberou o evento, tentamos expandir para mostrar o status
      setIsExpanded(true);
      return;
    }

    try {
      setIsInstalling(true);
      // Dispara o prompt NATIVO do navegador sem intermediários
      await deferredPrompt.prompt();
      
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`SHARECOM: Resultado da instalação: ${outcome}`);
      
      if (outcome === 'accepted') {
        setIsVisible(false);
      }
    } catch (err) {
      console.error("Erro ao disparar instalação:", err);
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
    }
  };

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed right-0 top-1/2 -translate-y-1/2 z-[100] transition-all duration-500 ease-in-out md:hidden ${
        isExpanded ? 'translate-x-0' : 'translate-x-[calc(100%-32px)]'
      }`}
    >
      <div className="flex items-center">
        {/* Etiqueta Lateral */}
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`h-24 w-8 rounded-l-xl flex flex-col items-center justify-center gap-2 shadow-lg border-y border-l transition-colors ${
            deferredPrompt ? 'bg-emerald-600' : 'bg-slate-700'
          }`}
          style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'white' }}
        >
          <ChevronLeft size={16} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          <div className="[writing-mode:vertical-lr] text-[10px] font-bold tracking-widest uppercase">
            {deferredPrompt ? 'INSTALAR' : 'APP'}
          </div>
        </button>

        {/* Painel de Ação */}
        <div 
          className="bg-white dark:bg-slate-900 border-y border-l p-4 shadow-2xl rounded-l-xl flex flex-col items-center gap-3 min-w-[150px]"
          style={{ borderColor: 'var(--ds-border)' }}
        >
          <div className={`p-2 rounded-full ${deferredPrompt ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
            {isInstalling ? <Loader2 size={20} className="animate-spin" /> : <Smartphone size={20} />}
          </div>
          
          <div className="text-center">
            <p className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>SHARECOM</p>
            <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
              {deferredPrompt ? 'Pronto para instalar' : 'Aguardando navegador...'}
            </p>
          </div>

          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className={`w-full py-2 text-white text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
              deferredPrompt 
                ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95' 
                : 'bg-slate-600 opacity-70 cursor-not-allowed'
            }`}
          >
            {isInstalling ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <>
                <Download size={12} />
                {deferredPrompt ? 'INSTALAR AGORA' : 'PREPARANDO...'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
