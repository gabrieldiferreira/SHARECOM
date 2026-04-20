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
import { Lock, ShieldCheck, BarChart3 } from "lucide-react";

export default function LoginPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [isCheckingRedirect, setIsCheckingRedirect] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    console.log("Login: Componente montado. Auth disponível:", !!auth);

    const checkRedirect = async () => {
      if (!auth) {
        setIsCheckingRedirect(false);
        return;
      }

      try {
        console.log("Login V2: Verificando resultado de redirecionamento...");
        const result = await getRedirectResult(auth);
        console.log("Login V2: getRedirectResult concluído. Usuário:", result?.user?.email || "Nenhum");
        if (result?.user) {
          window.location.href = "/";
          return;
        }
      } catch (error: any) {
        console.error("Login V2: Erro no redirect check:", error);
        setErrorMessage(`Erro no redirect: ${error.code || error.message}`);
      }
      
      setIsCheckingRedirect(false);
    };

    checkRedirect();

    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        console.log("Login V2: onAuthStateChanged. Usuário:", user?.email || "Nenhum");
        if (user) {
          window.location.href = "/";
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const handleGoogleLogin = async () => {
    if (!auth || !provider) {
      setErrorMessage("Firebase não configurado.");
      return;
    }

    setErrorMessage("");
    setIsSigningIn(true);
    setShowTransition(true);

    try {
      console.log("Login V2: Iniciando fluxo de autenticação...");
      await setPersistence(auth, browserLocalPersistence);

      const hostname = window.location.hostname;
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isLocalhost = hostname === "localhost" || 
                          hostname === "127.0.0.1" || 
                          hostname.startsWith("192.168.") || 
                          hostname.startsWith("10.") ||
                          hostname.endsWith(".local");

      console.log("Login V2: Hostname:", hostname, "Mobile:", isMobile, "Local:", isLocalhost);

      // No localhost ou ambiente de desenvolvimento, Redirect costuma falhar ou entrar em loop.
      // Forçamos Popup se estivermos em ambiente local ou se o redirect falhou antes.
      if (isMobile && !isLocalhost) {
        console.log("Login V2: Usando Redirect (Mobile/Production)");
        await signInWithRedirect(auth, provider);
      } else {
        console.log("Login V2: Usando Popup (Desktop/Local/Emulator)");
        const result = await signInWithPopup(auth, provider);
        console.log("Login V2: Resultado Popup:", !!result.user);
        if (result.user) window.location.href = "/";
        else {
          setIsSigningIn(false);
          setShowTransition(false);
        }
      }
    } catch (error: any) {
      console.error("Login V2: Erro ao autenticar:", error);
      setIsSigningIn(false);
      setShowTransition(false);
      
      if (error.code === 'auth/popup-blocked') {
        setErrorMessage("O popup foi bloqueado pelo navegador. Por favor, libere popups para este site.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        setErrorMessage("Login cancelado pelo usuário.");
      } else {
        setErrorMessage(error.message || "Falha no login.");
      }
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative overflow-hidden bg-[#020617]">
      
      {/* Overlay de Transição (Esconde a página enquanto valida) */}
      {(showTransition || isCheckingRedirect) && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950">
           <div className="relative z-10 flex flex-col items-center">
              <div className="w-20 h-20 mb-8 relative p-4 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-2xl">
                 <div className="absolute inset-0 rounded-3xl bg-blue-500/20 animate-ping" />
                 <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
              </div>
              <h2 className="text-white font-bold tracking-[0.5em] text-[10px] mb-4 uppercase">Sharecom</h2>
              <div className="flex gap-1.5">
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" />
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]" />
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]" />
              </div>
              <p className="mt-8 text-blue-400/40 text-[9px] font-bold uppercase tracking-widest animate-pulse">
                {isCheckingRedirect ? "Validando Protocolos..." : "Conectando..."}
              </p>
           </div>
        </div>
      )}

      {/* MOBILE UI */}
      <div className="lg:hidden flex flex-col min-h-screen relative">
        <div className="absolute inset-0 z-0">
          <img src="/ceo-mobile.png" className="w-full h-full object-cover" alt="CEO" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/40 to-transparent" />
        </div>

        <div className="relative z-10 flex flex-col flex-1 justify-between p-8">
          <div className="flex flex-col items-center pt-8">
            <div className="w-14 h-14 p-2 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 mb-4 shadow-2xl">
              <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
            </div>
            <h1 className="text-white font-black tracking-[0.3em] text-xl">SHARECOM</h1>
          </div>

          <div className="space-y-6 pb-4">
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-bold text-white leading-tight">Mastery Control</h2>
              <p className="text-slate-400 text-sm">IA aplicada à gestão de alta performance.</p>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={isSigningIn}
              className="w-full h-16 bg-white rounded-2xl flex items-center justify-center gap-4 active:scale-[0.98] transition-all shadow-[0_20px_40px_rgba(0,0,0,0.3)]"
            >
              {isSigningIn ? (
                <div className="w-6 h-6 border-4 border-slate-100 border-t-blue-600 animate-spin rounded-full" />
              ) : (
                <>
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="G" />
                  <span className="font-bold text-slate-900 uppercase tracking-tight">Entrar com Google</span>
                </>
              )}
            </button>

            {errorMessage && (
               <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                 <p className="text-red-500 text-[10px] text-center font-bold uppercase tracking-widest">{errorMessage}</p>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* DESKTOP UI */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-12 bg-[#020617] relative">
        <div className="w-full max-w-md p-12 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[40px] shadow-2xl">
          <div className="text-center mb-10">
            <div className="w-16 h-16 p-3 bg-white/10 rounded-2xl border border-white/10 mx-auto mb-6">
              <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Sessão Corporate</h2>
            <p className="text-slate-400 text-sm leading-relaxed">Conecte-se com segurança para gerenciar seus fluxos.</p>
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

      <div className="hidden lg:block w-1/2">
        <img src="/user-working.png" className="w-full h-full object-cover grayscale-[0.2]" alt="Work" />
      </div>
    </div>
  );
}
