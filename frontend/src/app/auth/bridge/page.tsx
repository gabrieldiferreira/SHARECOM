"use client";

import { useEffect, useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "@/lib/firebase";
import { ShieldCheck, Lock, Loader2, Sparkles } from "lucide-react";

export default function AuthBridge() {
  const [status, setStatus] = useState("Iniciando Protocolo de Segurança...");
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const sequence = [
      { msg: "Estabelecendo Túnel SSL/TLS 1.3...", log: "> Conexão estabelecida via porta 443" },
      { msg: "Verificando Certificados de Autenticidade...", log: "> Certificado SHA-256 validado" },
      { msg: "Iniciando Handshake com Google Cloud...", log: "> Handshake concluído com sucesso" },
      { msg: "Criptografando Dados de Sessão...", log: "> Algoritmo AES-256-GCM ativo" },
      { msg: "Abrindo Gateway Seguro...", log: "> Redirecionando para provedor externo" },
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < sequence.length) {
        setStatus(sequence[currentStep].msg);
        setLogs(prev => [...prev, sequence[currentStep].log]);
        setProgress((currentStep + 1) * 20);
        currentStep++;
      } else {
        clearInterval(interval);
        startRealAuth();
      }
    }, 600);

    return () => clearInterval(interval);
  }, []);

  const startRealAuth = async () => {
    if (!auth || !provider) return;
    try {
      await signInWithPopup(auth, provider);
      // O Firebase vai fechar esse popup ou redirecionar
      // Se for popup, o handleLogin do pai vai detectar
      window.close();
    } catch (e) {
      console.error(e);
      setStatus("Falha no Gateway. Fechando...");
      setTimeout(() => window.close(), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8 flex flex-col items-center justify-center font-mono overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-blue-600 rounded-full blur-[100px]" />
         <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-emerald-600 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl">
              <ShieldCheck size={32} className="text-emerald-500 animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-4 border-[#020617]">
              <Lock size={10} className="text-white" />
            </div>
          </div>
          
          <div className="space-y-1">
            <h1 className="text-sm font-bold tracking-[0.2em] text-emerald-500 uppercase">Secure Gateway</h1>
            <p className="text-[10px] text-white/40 uppercase tracking-widest">Sharecom Intelligence Systems</p>
          </div>
        </div>

        {/* Fake Loading Bars */}
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-[10px] text-emerald-500/80 font-bold">{status}</span>
            <span className="text-[10px] text-emerald-500/50">{progress}%</span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
            <div 
              className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Fake Terminal Logs */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-4 h-32 overflow-hidden flex flex-col justify-end gap-1">
          <AnimatePresence>
            {logs.map((log, i) => (
              <p key={i} className="text-[9px] text-emerald-500/60 font-mono animate-in fade-in slide-in-from-bottom-2">
                {log}
              </p>
            ))}
          </AnimatePresence>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-emerald-500 animate-pulse">_</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-[10px] text-white/20">
          <Sparkles size={12} />
          <span className="uppercase tracking-[0.3em]">Encrypted Connection</span>
        </div>
      </div>
    </div>
  );
}

// Wrapper to avoid build issues with motion
import { AnimatePresence } from "framer-motion";
