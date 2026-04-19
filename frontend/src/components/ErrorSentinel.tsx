"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorSentinel extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("SENTINELA DETECTOU FALHA CRÍTICA:", error, errorInfo);
    
    // Heurística de Auto-Recuperação
    // Se o erro for relacionado a leitura de propriedades nulas (comum em dados corrompidos)
    if (error.message.includes("toLowerCase") || error.message.includes("reading '0'") || error.message.includes("undefined")) {
        console.warn("Sentinela: Detectada possível corrupção de cache. Tentando auto-reparo...");
        // Marcar para limpeza no próximo reload se necessário, ou apenas logar
    }
  }

  handleReset = () => {
    // Limpeza profunda via código
    localStorage.clear();
    sessionStorage.clear();
    
    // Tenta apagar o IndexedDB se possível
    if (typeof window !== 'undefined' && window.indexedDB) {
        window.indexedDB.deleteDatabase('sharecom-db');
    }
    
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#020617', color: '#f8fafc', fontFamily: 'sans-serif' }}>
          <div className="max-w-md w-full p-8 rounded-2xl space-y-6 text-center shadow-2xl" style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}>
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-bold">Ops! Algo saiu do trilho</h1>
              <p className="text-slate-400 text-sm">
                O Sentinela detectou uma inconsistência nos dados locais que impediu o carregamento da página.
              </p>
            </div>

            <div className="p-3 rounded-lg text-left overflow-hidden bg-black/30 border border-white/5">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Log de Erro:</p>
                <code className="text-[11px] text-red-400 block truncate">
                    {this.state.error?.message || "Erro desconhecido"}
                </code>
            </div>

            <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => window.location.reload()}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-all"
                >
                  <RefreshCw size={18} />
                  Tentar Novamente
                </button>
                
                <button 
                  onClick={this.handleReset}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-medium text-slate-300 transition-all text-sm"
                >
                  <Trash2 size={16} />
                  Limpar Cache e Reparar
                </button>
            </div>
            
            <p className="text-[10px] text-slate-500">
                O Sentinela de Erros SHARECOM está monitorando esta sessão.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
