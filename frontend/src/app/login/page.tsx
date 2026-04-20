"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { auth, hasFirebaseConfig, provider } from "@/lib/firebase";
import { Lock, ShieldCheck, BarChart3, Sparkles } from "lucide-react";

export default function LoginPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [isCheckingRedirect, setIsCheckingRedirect] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (auth) {
      // 1. Ouvinte de estado (O mais rápido e confiável)
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          window.location.href = "/";
        } else {
          // 2. Se não houver usuário, checa se veio de um redirect (fallback mobile)
          getRedirectResult(auth).finally(() => setIsCheckingRedirect(false));
        }
      });
      return () => unsubscribe();
    } else {
      setIsCheckingRedirect(false);
    }
  }, []);

  const handleGoogleLogin = async () => {
    if (!auth || !provider) {
      setErrorMessage("Erro: Configuração do Firebase ausente.");
      return;
    }

    setErrorMessage("");
    setIsSigningIn(true);
    setShowTransition(true);

    try {
      // Forçamos persistência para evitar deslogar ao fechar aba
      await setPersistence(auth, browserLocalPersistence);

      // Tentamos POPUP primeiro, mesmo no mobile.
      // No Mobile, o popup abre uma aba cheia, mantendo a proporção do aparelho.
      try {
        const result = await signInWithPopup(auth, provider);
        if (result.user) window.location.href = "/";
      } catch (popupError: any) {
        // Se o popup for bloqueado (comum em alguns navegadores mobile), usamos Redirect
        if (popupError.code === "auth/popup-blocked" || popupError.code === "auth/cancelled-popup-request") {
          console.log("Popup bloqueado, tentando Redirect...");
          await signInWithRedirect(auth, provider);
        } else {
          throw popupError;
        }
      }
    } catch (error: any) {
      console.error("Erro no login:", error);
      setIsSigningIn(false);
      setShowTransition(false);
      setErrorMessage("Falha na autenticação. Tente novamente.");
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative overflow-hidden bg-[#020617]">
      
      {/* Overlay de Transição Profissional */}
      {(showTransition || isCheckingRedirect) && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950">
           <div className="relative z-10 flex flex-col items-center animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 mb-8 relative">
                 <div className="absolute inset-0 rounded-3xl bg-blue-600/20 animate-ping" />
                 <div className="relative z-10 w-full h-full p-4 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-2xl">
                    <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
                 </div>
              </div>
              <h2 className="text-white font-bold tracking-[0.5em] text-xs mb-4">SHARECOM</h2>
              <div className="flex gap-1">
                 <div className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" />
                 <div className="w-1 h-1 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]" />
                 <div className="w-1 h-1 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]" />
              </div>
           </div>
        </div>
      )}

      {/* MOBILE DESIGN */}
      <div className="lg:hidden flex flex-col min-h-screen relative">
        <div className="absolute inset-0 z-0">
          <img src="/ceo-mobile.png" className="w-full h-full object-cover" alt="Background" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        </div>

        <div className="relative z-10 flex flex-col flex-1 justify-between p-8">
          <div className="flex flex-col items-center pt-8">
            <div className="w-14 h-14 p-2 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 mb-4">
              <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
            </div>
            <h1 className="text-white font-black tracking-[0.3em] text-xl">SHARECOM</h1>
          </div>

          <div className="space-y-6 pb-4">
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-bold text-white leading-tight">Gestão Inteligente</h2>
              <p className="text-slate-400 text-sm">Controle financeiro com precisão absoluta.</p>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={isSigningIn}
              className="w-full h-16 bg-white rounded-2xl flex items-center justify-center gap-4 active:scale-95 transition-all shadow-2xl"
            >
              {isSigningIn ? (
                <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-600 animate-spin rounded-full" />
              ) : (
                <>
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="G" />
                  <span className="font-bold text-slate-900">Entrar com Google</span>
                </>
              )}
            </button>

            {errorMessage && <p className="text-red-500 text-[10px] text-center font-bold uppercase">{errorMessage}</p>}
          </div>
        </div>
      </div>

      {/* DESKTOP DESIGN */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-12 bg-slate-950 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]" />

        <div className="w-full max-w-md p-12 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[40px] shadow-2xl relative z-10">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 p-3 bg-white/10 rounded-2xl border border-white/10">
                <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Acesso Restrito</h2>
            <p className="text-slate-400 text-sm">Conecte-se à sua conta corporativa SHARECOM.</p>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full h-14 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] shadow-xl"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" />
            <span>Continuar com Google</span>
          </button>
        </div>
      </div>

      <div className="hidden lg:block w-1/2 relative">
        <img src="/user-working.png" className="w-full h-full object-cover" alt="Work" />
        <div className="absolute inset-0 bg-blue-900/10 mix-blend-multiply" />
      </div>
    </div>
  );
}
