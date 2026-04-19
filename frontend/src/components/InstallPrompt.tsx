"use client";

import { useState, useEffect } from "react";
import { Download, Smartphone, ChevronLeft, Loader2, MoreVertical, PlusSquare } from "lucide-react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    const checkInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      if (isStandalone) {
        setIsVisible(false);
      } else {
        setTimeout(() => setIsVisible(true), 1500);
      }
    };

    checkInstalled();

    const manualTimer = setTimeout(() => {
      if (!deferredPrompt) setShowManual(true);
    }, 8000);

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowManual(false);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      setIsVisible(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(manualTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return; // No modo manual, o clique apenas expande para ver as instruções

    try {
      setIsInstalling(true);
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setIsVisible(false);
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
        {/* Etiqueta / Aba */}
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`h-24 w-8 rounded-l-xl flex flex-col items-center justify-center gap-2 shadow-lg border-y border-l transition-colors ${
            deferredPrompt ? 'bg-emerald-600' : 'bg-slate-700'
          }`}
          style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'white' }}
        >
          <ChevronLeft size={16} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          <div className="[writing-mode:vertical-lr] text-[10px] font-bold tracking-widest uppercase">
            {deferredPrompt ? 'INSTALAR' : 'AJUDA'}
          </div>
        </button>

        {/* Painel Interno */}
        <div 
          className="bg-white dark:bg-slate-900 border-y border-l p-4 shadow-2xl rounded-l-xl flex flex-col items-center gap-4 min-w-[180px] max-w-[220px]"
          style={{ borderColor: 'var(--ds-border)' }}
        >
          <div className="flex flex-col items-center gap-2 text-center">
             <div className={`p-2 rounded-full ${deferredPrompt ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                {isInstalling ? <Loader2 size={20} className="animate-spin" /> : <Smartphone size={20} />}
             </div>
             <div>
                <p className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>SHARECOM</p>
                <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                   {deferredPrompt ? 'Pronto para instalar' : 'Siga os passos abaixo:'}
                </p>
             </div>
          </div>

          {/* Se não houver prompt nativo, mostra os passos direto na aba */}
          {!deferredPrompt && (
             <div className="space-y-3 w-full border-t pt-3" style={{ borderColor: 'var(--ds-border)' }}>
                <div className="flex items-start gap-2">
                   <div className="text-[10px] font-bold text-amber-500 mt-0.5">1.</div>
                   <p className="text-[9px] leading-tight" style={{ color: 'var(--text-primary)' }}>
                      Toque nos <span className="font-bold inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 px-0.5 rounded">3 pontos <MoreVertical size={8}/></span>
                   </p>
                </div>
                <div className="flex items-start gap-2">
                   <div className="text-[10px] font-bold text-amber-500 mt-0.5">2.</div>
                   <p className="text-[9px] leading-tight" style={{ color: 'var(--text-primary)' }}>
                      Selecione <span className="font-bold inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 px-0.5 rounded">Instalar <PlusSquare size={8}/></span>
                   </p>
                </div>
             </div>
          )}

          {deferredPrompt && (
             <button
               onClick={handleInstall}
               disabled={isInstalling}
               className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-emerald-500/20"
             >
               {isInstalling ? <Loader2 size={12} className="animate-spin" /> : (
                 <>
                   <Download size={12} />
                   INSTALAR AGORA
                 </>
               )}
             </button>
          )}

          <button 
             onClick={() => setIsExpanded(false)}
             className="text-[9px] font-medium" 
             style={{ color: 'var(--text-tertiary)' }}
          >
             Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
