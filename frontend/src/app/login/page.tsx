"use client";

import { useState, useEffect, useRef } from "react";
import { 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult,
  onAuthStateChanged,
  browserLocalPersistence, 
  setPersistence 
} from "firebase/auth";
import { auth, provider } from "@/lib/firebase";
import GlassCard from "@/components/GlassCard";
import { Fingerprint } from "lucide-react";

export default function LoginPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [mounted, setMounted] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const initCheckDoneRef = useRef(false);

  // SINGLE effect: Initialize auth state once on mount
  useEffect(() => {
    setMounted(true);
    if (!auth || initCheckDoneRef.current) return;

    let isMounted = true;
    initCheckDoneRef.current = true;

    const initAuth = async () => {
      // Check if returning from OAuth redirect
      try {
        const result = await getRedirectResult(auth);
        if (!isMounted) return;
        
        if (result?.user) {
          console.log("Login: Authenticated via redirect");
          window.location.href = "/";
          return;
        }
      } catch (error: any) {
        if (!isMounted) return;
        console.error("Redirect result check failed:", error?.code);
      }

      // Monitor ongoing auth state
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (!isMounted) return;
        
        if (user) {
          console.log("Login: User authenticated");
          window.location.href = "/";
        } else {
          setIsCheckingSession(false);
        }
      });

      return unsubscribe;
    };

    let unsubscribe: any;
    initAuth().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleGoogleLogin = async () => {
    if (!auth || !provider) {
      setErrorMessage("Erro: Firebase não configurado.");
      return;
    }

    setIsSigningIn(true);
    setErrorMessage("");

    try {
      console.log("Login: Iniciando fluxo de autenticação...");
      
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      // On localhost, ALWAYS use popup to avoid Firebase Hosting handler issues
      // On production mobile, use redirect if needed
      if (isLocalhost || !isMobile) {
        console.log("Login: Using Popup.");
        const result = await signInWithPopup(auth, provider);
        if (result.user) {
          console.log("Login: Success via popup, redirecting...");
          window.location.href = "/";
        } else {
          setIsSigningIn(false);
        }
      } else {
        // Production mobile: use redirect
        console.log("Login: Mobile. Using Redirect.");
        await signInWithRedirect(auth, provider);
      }
    } catch (error: any) {
      console.error("Erro no login:", error);
      if (error.code === 'auth/popup-blocked') {
        setErrorMessage("O popup foi bloqueado pelo navegador. Por favor, clique novamente ou permita popups.");
      } else if (error.code !== 'auth/cancelled-by-user') {
        setErrorMessage(error.message || "Falha ao autenticar.");
      }
      setIsSigningIn(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row hero-gradient text-white">
      {/* Lado Esquerdo / Mobile Top */}
      <div className="flex-1 flex flex-col p-8 justify-center items-center relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
          <img src="/ceo-mobile.png" className="w-full h-full object-cover" alt="Background" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/50 to-transparent" />
        </div>

        <div className="relative z-50 w-full max-w-md space-y-12">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 p-4 bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-2xl">
              <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
            </div>
            <h1 className="text-4xl font-black tracking-[0.2em] mb-2">SHARECOM</h1>
            <p className="text-blue-400/60 font-medium tracking-widest text-[10px] uppercase">Intelligence Control Systems</p>
          </div>

          <GlassCard className="p-10 rounded-[40px] shadow-2xl relative overflow-hidden group" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10 space-y-6">
              {isCheckingSession ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <div className="w-10 h-10 border-4 border-white/10 border-t-blue-500 animate-spin rounded-full" />
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Validando Sessão...</p>
                </div>
              ) : (
                <>
                  <div className="text-center space-y-2 mb-8">
                    <h2 className="text-xl font-bold">Boas-vindas</h2>
                    <p className="text-slate-400 text-sm">Conecte sua conta para acessar o painel.</p>
                  </div>

                  <div className="relative">
                    <button
                      onClick={handleGoogleLogin}
                      disabled={isSigningIn}
                      className="relative w-full flex items-center justify-center gap-3 px-6 py-4 bg-white text-black rounded-2xl font-bold text-sm transition-all hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-xl group pointer-events-auto z-10"
                    >
                      {isSigningIn ? (
                        <div className="w-5 h-5 border-2 border-black/10 border-t-black animate-spin rounded-full" />
                      ) : (
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 group-hover:scale-110 transition-transform" alt="Google" />
                      )}
                      {isSigningIn ? "AUTENTICANDO..." : "ENTRAR COM GOOGLE"}
                    </button>

                    <button
                      type="button"
                      className="absolute -right-3 -top-6 w-12 h-12 rounded-full flex items-center justify-center bg-white/6 border border-white/10 text-white shadow-md"
                      onClick={() => alert('Autenticação biométrica (simulada)')}
                      title="Biometria"
                    >
                      <Fingerprint size={18} />
                    </button>
                  </div>

                  {errorMessage && (
                    <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <p className="text-red-400 text-[10px] text-center font-bold uppercase tracking-widest leading-relaxed">
                        {errorMessage}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </GlassCard>

          <p className="text-center text-slate-500 text-[10px] uppercase tracking-[0.3em]">
            Secure Corporate Access
          </p>
        </div>
      </div>

      {/* Lado Direito (Desktop Only) */}
      <div className="hidden lg:block w-1/2 relative">
        <img src="/user-working.png" className="w-full h-full object-cover grayscale-[0.2]" alt="Work" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#020617] to-transparent w-32" />
        <div className="absolute inset-0 bg-blue-600/5 mix-blend-overlay" />
      </div>
    </div>
  );
}
