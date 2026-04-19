"use client";

import { useState, useEffect } from "react";
import { Download, Smartphone, ChevronLeft } from "lucide-react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Verifica se já está instalado
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    if (!isStandalone) {
      // Mostra a etiqueta sutil após 1 segundo
      setTimeout(() => setIsVisible(true), 1000);
    }

    const handler = (e: any) => {
      console.log("Evento beforeinstallprompt capturado! ✅");
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      alert("Para instalar: Clique nos 3 pontinhos do Chrome e selecione 'Instalar Aplicativo'.");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed right-0 top-1/2 -translate-y-1/2 z-[100] transition-all duration-500 ease-in-out md:hidden ${
        isExpanded ? 'translate-x-0' : 'translate-x-[calc(100%-32px)]'
      }`}
    >
      <div className="flex items-center">
        {/* Gatilho / Aba */}
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-24 w-8 rounded-l-xl flex flex-col items-center justify-center gap-2 shadow-lg border-y border-l"
          style={{ 
            backgroundColor: '#10B981', 
            borderColor: 'rgba(255,255,255,0.2)',
            color: 'white'
          }}
        >
          <ChevronLeft size={16} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          <div className="[writing-mode:vertical-lr] text-[10px] font-bold tracking-widest uppercase">
            APP
          </div>
        </button>

        {/* Conteúdo Expansível */}
        <div 
          className="bg-white dark:bg-slate-900 border-y border-l p-4 shadow-2xl rounded-l-xl flex flex-col items-center gap-3 min-w-[140px]"
          style={{ borderColor: 'var(--ds-border)' }}
        >
          <div className="p-2 rounded-full bg-emerald-500/10 text-emerald-500">
            <Smartphone size={20} />
          </div>
          <div className="text-center">
            <p className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>SHARECOM</p>
            <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Instalar no Celular</p>
          </div>
          <button
            onClick={handleInstall}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Download size={12} />
            INSTALAR
          </button>
        </div>
      </div>
    </div>
  );
}
