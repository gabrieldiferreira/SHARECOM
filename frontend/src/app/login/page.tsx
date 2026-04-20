"use client";

import { useState, useEffect } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, hasFirebaseConfig, provider } from "@/lib/firebase";
import {
  Lock,
  ShieldCheck,
  BarChart3,
  Sparkles,
  PieChart,
} from "lucide-react";

export default function LoginPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleGoogleLogin = async () => {
    if (!auth || !provider) {
      setErrorMessage("Erro: Configuração do sistema não encontrada.");
      return;
    }
    setErrorMessage("");
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      setErrorMessage("Falha na autenticação. Tente novamente.");
    } finally {
      setIsSigningIn(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      
      {/* --- MOBILE VIEW: CEO CONTROL GLASS --- */}
      <div className="lg:hidden fixed inset-0 z-0">
        <img 
          src="/ceo-mobile.png" 
          alt="CEO Control" 
          className="w-full h-full object-cover"
        />
        {/* Overlay para elegância e leitura */}
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <div className="lg:hidden relative z-10 flex flex-col min-h-screen p-6 justify-between">
        {/* Top Branding Mobile */}
        <div className="flex flex-col items-center pt-10 animate-in fade-in duration-1000">
          <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/20 shadow-2xl mb-3 bg-black/40 backdrop-blur-sm p-1">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-lg font-bold tracking-[0.3em] text-white">SHARECOM</h1>
        </div>

        {/* Bottom GLASS Card Mobile */}
        <div className="pb-8 animate-in fade-in slide-in-from-bottom-12 duration-1000">
           <div 
             className="rounded-[32px] p-8 space-y-8"
             style={{ 
               backgroundColor: 'rgba(15, 23, 42, 0.65)', 
               backdropFilter: 'blur(30px)',
               WebkitBackdropFilter: 'blur(30px)',
               border: '0.5px solid rgba(255, 255, 255, 0.15)',
               boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
             }}
           >
             <div className="text-center space-y-2">
                <div className="flex justify-center mb-4">
                  <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Enterprise Management</span>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white">Controle em suas mãos</h2>
                <p className="text-sm text-white/60 leading-relaxed">
                  Mantenha a gestão absoluta de seus comprovantes e fluxos financeiros.
                </p>
             </div>

             <button
                onClick={handleGoogleLogin}
                disabled={isSigningIn || !hasFirebaseConfig}
                className="group w-full h-14 rounded-xl bg-white text-black font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-4 shadow-xl shadow-white/5"
              >
                {isSigningIn ? (
                  <div className="w-6 h-6 rounded-full border-[3px] border-black/10 border-t-black animate-spin" />
                ) : (
                  <>
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1.5 border border-black/5">
                      <img
                        src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                        className="w-full h-full"
                        alt="Google"
                      />
                    </div>
                    <span>Entrar com Google</span>
                  </>
                )}
              </button>

              {errorMessage ? (
                <div className="p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-xs text-center">
                  {errorMessage}
                </div>
              ) : null}

              <div className="flex justify-center gap-8 opacity-40">
                <Lock size={18} className="text-white" />
                <ShieldCheck size={18} className="text-white" />
                <BarChart3 size={18} className="text-white" />
              </div>
           </div>
        </div>
      </div>


      {/* --- DESKTOP VIEW: GLASS LOGIN LEFT, WORKER RIGHT --- */}
      
      {/* Painel de Login (Lado Esquerdo - Desktop Glass) */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-20 relative z-20">
        <div className="absolute inset-0 z-[-1] opacity-40">
           <div className="absolute top-[10%] left-[10%] w-64 h-64 bg-blue-600/20 rounded-full blur-[100px]" />
           <div className="absolute bottom-[10%] right-[10%] w-64 h-64 bg-indigo-600/20 rounded-full blur-[100px]" />
        </div>

        <div className="absolute top-12 left-12 flex items-center gap-3">
          <div className="w-7 h-7 rounded-md overflow-hidden border border-black/5" style={{ borderWidth: '0.5px' }}>
            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-lg font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>SHARECOM</h1>
        </div>

        {/* Card de Login GLASS */}
        <div 
          className="w-full max-w-[400px] rounded-[32px] p-12 relative overflow-hidden"
          style={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.03)', 
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '0.5px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.1)'
          }}
        >
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none bg-gradient-to-br from-white/5 to-transparent" />

          <div className="relative z-10">
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-3 text-blue-400">
                <Sparkles size={14} className="animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]">IA Management System</span>
              </div>
              <h2 className="text-[22px] font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Domine sua gestão financeira</h2>
              <p className="text-[13px] leading-relaxed opacity-60" style={{ color: 'var(--text-primary)' }}>Digitalize, analise e gerencie todos os seus comprovantes em um único lugar, com rapidez e segurança.</p>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={isSigningIn || !hasFirebaseConfig}
              className="group w-full h-14 rounded-xl bg-white text-black font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-3 shadow-xl shadow-blue-500/10"
            >
              {isSigningIn ? (
                <div className="w-5 h-5 rounded-full border-2 border-black/10 border-t-black animate-spin" />
              ) : (
                <>
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    className="w-5 h-5"
                    alt="Google"
                  />
                  <span className="text-[14px]">Entrar com Google</span>
                </>
              )}
            </button>

            {/* Secure Connection Badge */}
            <div className="mt-12 pt-10 border-t border-white/10">
              <div className="flex flex-col items-center gap-6">
                <div 
                  className="flex items-center gap-3 px-4 py-2 rounded-full border border-white/10"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}
                >
                  <div className="relative">
                    <Lock size={14} className="text-emerald-500" />
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse border-2 border-[#0F172A]" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Conexão Segura</span>
                    <span className="text-[8px] font-mono opacity-50 uppercase tracking-tighter" style={{ color: 'var(--text-primary)' }}>AES-256-GCM / TLS 1.3</span>
                  </div>
                </div>

                <div className="flex items-center gap-10 opacity-30">
                  <PieChart size={18} style={{ color: 'var(--text-primary)' }} />
                  <BarChart3 size={18} style={{ color: 'var(--text-primary)' }} />
                  <ShieldCheck size={18} style={{ color: 'var(--text-primary)' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-16 text-[11px] text-center font-bold tracking-[0.1em] opacity-40" style={{ color: 'var(--text-primary)' }}>
          © {new Date().getFullYear()} SHARECOM GLOBAL SERVICES
        </p>
      </div>

      {/* Painel de Imagem (Lado Direito - Desktop) */}
      <div 
        className="hidden lg:flex lg:w-[55%] relative overflow-hidden"
        style={{ borderLeft: '0.5px solid var(--ds-border)' }}
      >
        <div className="absolute inset-0 z-0">
          <img 
            src="/user-working.png" 
            alt="Profissional trabalhando" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-blue-900/10 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-primary)]/20 to-transparent" />
        </div>

        <div className="absolute bottom-12 right-12 z-10 p-6 rounded-lg backdrop-blur-md bg-white/10 border border-white/20 shadow-2xl max-w-xs">
          <div className="flex items-center gap-2 mb-3">
             <div className="w-2 h-2 rounded-full bg-emerald-500" />
             <span className="text-[10px] font-bold text-white uppercase tracking-widest">Gestão Empresarial Ativa</span>
          </div>
          <p className="text-white text-sm font-medium leading-relaxed">
            "Domine seus fluxos de caixa com a ferramenta líder em inteligência de comprovantes. Controle total, em tempo real."
          </p>
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
            <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest">Sharecom Intelligence</p>
            <ShieldCheck size={14} className="text-white/40" />
          </div>
        </div>
      </div>

    </div>
  );
}
