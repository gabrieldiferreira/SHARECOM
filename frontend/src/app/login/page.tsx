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

export default function LoginPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [mounted, setMounted] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const redirectStartedRef = useRef(false);

  useEffect(() => {
    if (!mounted) return;
    if (!isCheckingSession && !redirectStartedRef.current) {
      redirectStartedRef.current = true;
      setIsSigningIn(true);
      if (!auth || !provider) {
        setErrorMessage("Erro: Firebase não configurado.");
        setIsSigningIn(false);
        return;
      }
      signInWithRedirect(auth, provider).catch((e: any) => {
        console.error("Auto sign-in failed", e);
        setErrorMessage(e?.message || "Falha ao iniciar login");
        setIsSigningIn(false);
      });
    }
  }, [isCheckingSession, mounted]);

  useEffect(() => {
    setMounted(true);
    if (!auth) return;

    // Captura o resultado do redirecionamento
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        console.log("Login: Sucesso via Redirect");
        window.location.href = "/";
      }
    }).catch((error) => {
      console.error("Erro no Redirect Result:", error);
      setErrorMessage(error.message);
    });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("Login: Usuário detectado, redirecionando...");
        window.location.href = "/";
      } else {
        setIsCheckingSession(false);
      }
    });
    return () => unsubscribe();
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
      
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const hostname = window.location.hostname;
      const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
      
      // No mobile, o redirect é mais estável. No desktop/localhost, o popup é melhor.
      if (isMobile && !isLocalhost) {
        console.log("Login: Mobile Produção. Usando Redirect.");
        await signInWithRedirect(auth, provider);
      } else {
        console.log("Login: Usando Popup.");
        const result = await signInWithPopup(auth, provider);
        if (result.user) {
           window.location.href = "/";
        } else {
           setIsSigningIn(false);
        }
      }
    } catch (error: any) {
      console.error("Erro no login:", error);
      if (error.code === 'auth/popup-blocked') {
        setErrorMessage("Popup bloqueado pelo navegador.");
      } else {
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
        <div className="absolute inset-0 z-0 opacity-20">
          <img src="/ceo-mobile.png" className="w-full h-full object-cover" alt="Background" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/50 to-transparent" />
        </div>

        <div className="relative z-10 w-full max-w-md space-y-12">
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

                  <div className="flex flex-col items-center justify-center py-8 space-y-4">
                    <div className="w-10 h-10 border-4 border-white/10 border-t-blue-500 animate-spin rounded-full" />
                    <p className="text-sm font-medium">Redirecionando para o Google — aguarde...</p>
                  </div>

                  {errorMessage && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
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
