"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, provider, db } from "@/lib/firebase";
import { Eye, EyeOff, Mail, Lock, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [mounted, setMounted] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const initCheckDoneRef = useRef(false);

  const syncAndRedirect = async (user: any) => {
    try {
      console.log('🔥 Starting Firestore sync after login');
      console.log('✅ Auth OK, user:', user);
      console.log('User ID:', user?.uid);

      if (!user?.uid) {
        throw new Error('Authenticated user has no uid');
      }

      if (!auth?.currentUser) {
        throw new Error('Not authenticated');
      }

      if (!db) {
        throw new Error('Firestore not initialized');
      }

      console.log('✅ Firestore db available:', Boolean(db));

      const userRef = doc(db, 'users', user.uid);
      console.log('📝 Saving to Firestore collection:', 'users');
      console.log('📝 Document path:', `users/${user.uid}`);

      const userSnap = await getDoc(userRef);
      console.log('📄 Existing document found:', userSnap.exists());
      
      if (!userSnap.exists()) {
        const payload = {
          email: user.email,
          name: user.displayName,
          photoURL: user.photoURL,
          locale: 'pt-BR',
          currency: 'BRL',
          createdAt: new Date().toISOString()
        };
        console.log('📝 Saving to Firestore...', payload);

        try {
          await setDoc(userRef, payload);
          console.log('✅ Saved successfully!');
        } catch (err: any) {
          console.error('❌ Error saving:', err);
          showToast(`Error saving profile: ${err?.message || 'Unknown Firestore error'}`, 'error');
          throw err;
        }

        document.cookie = `NEXT_LOCALE=pt-BR; path=/; max-age=${60 * 60 * 24 * 365}`;
        localStorage.setItem('USER_CURRENCY', 'BRL');
      } else {
        const userData = userSnap.data();
        console.log('✅ Existing Firestore user data:', userData);
        if (userData.locale) document.cookie = `NEXT_LOCALE=${userData.locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
        if (userData.currency) localStorage.setItem('USER_CURRENCY', userData.currency);
      }
    } catch (e: any) {
      console.error('❌ Sync failed', e);
      showToast(`Login sync failed: ${e?.message || 'Unknown error'}`, 'error');
    }
    window.location.href = "/";
  };

  useEffect(() => {
    document.body.classList.add('login-page');
    // Force background color on html/body for mobile safe areas
    const originalBodyBg = document.body.style.backgroundColor;
    const originalHtmlBg = document.documentElement.style.backgroundColor;
    
    document.body.style.backgroundColor = '#0D0D12';
    document.documentElement.style.backgroundColor = '#0D0D12';

    return () => {
      document.body.classList.remove('login-page');
      document.body.style.backgroundColor = originalBodyBg;
      document.documentElement.style.backgroundColor = originalHtmlBg;
    };
  }, []);

  useEffect(() => {
    setMounted(true);
    if (!auth || initCheckDoneRef.current) return;

    let isMounted = true;
    initCheckDoneRef.current = true;

    const initAuth = async () => {
      try {
        const result = await getRedirectResult(auth as any);
        if (!isMounted) return;
        if (result?.user) {
          syncAndRedirect(result.user);
          return;
        }
      } catch (error: any) {
        if (!isMounted) return;
        console.error('❌ getRedirectResult error:', error);
        // Não bloqueia o usuário se o erro for apenas 'no result'
        if (error.code !== 'auth/no-recent-redirect-handled') {
          setErrorMessage(`Erro ao processar login mobile: ${error.message}`);
        }
        setIsCheckingSession(false);
      }

      const unsubscribe = onAuthStateChanged(auth as any, (user) => {
        if (!isMounted) return;
        if (user) {
          syncAndRedirect(user);
        } else {
          setIsCheckingSession(false);
        }
      });
      return unsubscribe;
    };

    let unsubscribe: any;
    initAuth().then(unsub => { unsubscribe = unsub; });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleGoogleLogin = async () => {
    console.log('🔥 Starting Google login');
    
    if (!auth || !provider) {
      setErrorMessage("Erro: Firebase não configurado.");
      console.error('❌ Firebase auth/provider missing', {
        hasAuth: Boolean(auth),
        hasProvider: Boolean(provider),
        hasDb: Boolean(db),
      });
      return;
    }
    setIsSigningIn(true);
    setErrorMessage("");
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      // Tentar popup primeiro (funciona em muitos browsers mobile modernos)
      try {
        const result = await signInWithPopup(auth as any, provider as any);
        console.log('✅ Auth OK (Popup), user:', result.user);
        if (result.user) {
          await syncAndRedirect(result.user);
        } else {
          console.error('❌ Google auth returned no user');
          setIsSigningIn(false);
        }
      } catch (popupError: any) {
        // Se falhar por bloqueio de popup ou se estivermos em mobile, tentamos redirect
        if (popupError.code === 'auth/popup-blocked' || isMobile) {
          console.log('↪️ Falling back to signInWithRedirect');
          await signInWithRedirect(auth as any, provider as any);
        } else {
          throw popupError;
        }
      }
    } catch (error: any) {
      console.error('❌ Google login failed:', error);
      showToast(`Google login error: ${error?.message || 'Unknown auth error'}`, 'error');
      if (error.code !== 'auth/cancelled-by-user') {
        setErrorMessage(error.message || "Falha ao autenticar.");
      }
      setIsSigningIn(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!auth) {
      setErrorMessage("Erro: Firebase não configurado.");
      return;
    }

    if (!email.trim() || !password) {
      setErrorMessage("Preencha e-mail e senha para entrar.");
      return;
    }

    setIsSigningIn(true);
    setErrorMessage("");

    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      await syncAndRedirect(result.user);
    } catch (error: any) {
      console.error("❌ Email login failed:", error);

      if (error?.code === "auth/invalid-credential" || error?.code === "auth/wrong-password" || error?.code === "auth/user-not-found") {
        setErrorMessage("E-mail ou senha incorretos.");
      } else if (error?.code === "auth/invalid-email") {
        setErrorMessage("Informe um e-mail válido.");
      } else if (error?.code === "auth/too-many-requests") {
        setErrorMessage("Muitas tentativas. Aguarde um pouco e tente novamente.");
      } else if (error?.code === "auth/operation-not-allowed") {
        setErrorMessage("Ative o login por e-mail e senha no Firebase.");
      } else {
        setErrorMessage(error?.message || "Falha ao autenticar com e-mail e senha.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleForgotPassword = () => {
    const nextUrl = email.trim()
      ? `/reset-password?email=${encodeURIComponent(email.trim())}`
      : "/reset-password";

    router.push(nextUrl);
  };



  if (!mounted) return null;

  return (
    <div className="fixed inset-0 w-full h-full bg-[#0D0D12] overflow-y-auto overflow-x-hidden">
      
      {/* --- MOBILE BACKGROUND (Hidden on Desktop) --- */}
      <div className="fixed inset-0 z-0 lg:hidden pointer-events-none">
        {/* Top Image with dramatic fade */}
        <div className="absolute top-0 left-0 w-full h-[55vh]">
          <Image src="/ceo-mobile.png" fill className="object-cover opacity-50 mix-blend-luminosity" alt="Background" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0D0D12]/50 to-[#0D0D12] z-10" />
        </div>
        {/* Animated Ambient Glows */}
        <div className="absolute bottom-[20%] left-[-20%] w-[70vw] h-[70vw] bg-purple-600/30 blur-[120px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-[40%] right-[-20%] w-[60vw] h-[60vw] bg-pink-600/20 blur-[100px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '6s' }} />
      </div>

      {/* --- DESKTOP BACKGROUND (Hidden on Mobile) --- */}
      <div className="fixed inset-0 z-0 hidden lg:block pointer-events-none">
        {/* Left Side */}
        <div className="absolute left-0 top-0 w-1/2 h-full bg-brand-purple overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0D0D12] z-10" />
          <Image src="/ceo-mobile.png" fill className="object-cover opacity-100" alt="Left background" />
        </div>
        {/* Right Side */}
        <div className="absolute right-0 top-0 w-1/2 h-full overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D12] via-transparent to-transparent z-10" />
          <Image src="/user-working.png" fill className="object-cover grayscale-[0.15]" alt="Right background" priority />
        </div>
        {/* Subtle overall gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.3)_0%,_transparent_60%)]" />
      </div>

      {/* --- MAIN CONTENT --- */}
      <div className="relative z-50 flex min-h-[100dvh] flex-col lg:flex-row items-center justify-end lg:justify-center p-4 pb-8 lg:pb-4">
        
        <div className="w-full max-w-md flex flex-col mt-auto lg:mt-0 lg:space-y-8">
          
          {/* Logo Section */}
          <div className="text-center mb-6 lg:mb-0 transform transition-all duration-700 translate-y-0">
            <div className="w-16 h-16 lg:w-20 lg:h-20 mx-auto mb-4 lg:mb-5 p-3 bg-white/5 backdrop-blur-md rounded-2xl lg:rounded-3xl border border-white/10 shadow-[0_0_30px_rgba(139,92,246,0.2)]">
              <Image src="/logo.png" width={80} height={80} className="w-full h-full object-contain" alt="Logo" priority />
            </div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-[0.15em] mb-1.5 text-white drop-shadow-md">
              SHARECOM
            </h1>
            <p className="text-purple-300/70 font-medium tracking-widest text-[8px] lg:text-[9px] uppercase">
              Intelligence Control Systems
            </p>
          </div>

          {/* Login Card */}
          <div className="bg-[#0f0f13]/80 lg:bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2rem] lg:rounded-2xl p-6 lg:p-8 shadow-2xl relative overflow-hidden">
            {/* Subtle inner reflection for glass effect on mobile */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none lg:hidden" />
            
            <div className="relative z-10">
              {isCheckingSession ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Loader2 className="w-10 h-10 border-4 border-white/5 border-t-purple-500 animate-spin rounded-full" />
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Validando Sessão...</p>
                </div>
              ) : (
                <div className="space-y-5 lg:space-y-5 space-y-4">
                  <div className="text-center space-y-1 mb-6">
                    <h2 className="text-xl lg:text-2xl font-bold text-white">Boas-vindas</h2>
                    <p className="text-white/50 text-xs lg:text-sm">Conecte sua conta para acessar.</p>
                  </div>

                  {/* Email Input */}
                  <div className="relative">
                    <div 
                      className="relative rounded-xl transition-all duration-300"
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: emailFocused ? '1px solid rgba(139, 92, 246, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: emailFocused ? '0 0 15px rgba(139, 92, 246, 0.15)' : 'none',
                      }}
                    >
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setEmailFocused(true)}
                        onBlur={() => setEmailFocused(false)}
                        placeholder="E-mail corporativo"
                        aria-label="E-mail"
                        className="w-full bg-transparent py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-white/30 outline-none"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="relative">
                    <div 
                      className="relative rounded-xl transition-all duration-300"
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: passwordFocused ? '1px solid rgba(139, 92, 246, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: passwordFocused ? '0 0 15px rgba(139, 92, 246, 0.15)' : 'none',
                      }}
                    >
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => setPasswordFocused(false)}
                        placeholder="Senha de acesso"
                        aria-label="Senha"
                        className="w-full bg-transparent py-3.5 pl-11 pr-12 text-sm text-white placeholder:text-white/30 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors z-10"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Forgot Password */}
                  <div className="flex justify-end -mt-2">
                    <button 
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-[11px] font-medium text-purple-400/70 hover:text-purple-400 transition-colors"
                    >
                      Esqueci minha senha
                    </button>
                  </div>

                  {/* Primary Button */}
                  <button
                    type="button"
                    onClick={handleEmailLogin}
                    disabled={isSigningIn}
                    className="w-full py-4 rounded-xl font-bold text-sm text-white transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_8px_25px_rgba(139,92,246,0.3)] relative overflow-hidden group"
                    style={{ background: 'linear-gradient(135deg, #8B5CF6, #D946EF)' }}
                  >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {isSigningIn ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        "ENTRAR NO SISTEMA"
                      )}
                    </span>
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-4 py-2">
                    <div className="flex-1 h-px bg-white/5" />
                    <span className="text-[10px] text-white/20 font-medium uppercase tracking-widest">ou acesso rápido</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>

                  {/* Social Login Buttons */}
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isSigningIn}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl font-medium text-sm text-white/90 transition-all active:scale-[0.98] disabled:opacity-50 hover:bg-white/10 bg-white/5 border border-white/10 backdrop-blur-md"
                  >
                    <Image src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={18} height={18} className="w-4 h-4" alt="Google" />
                    Continuar com Google
                  </button>

                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 backdrop-blur-sm mt-4 animate-in fade-in slide-in-from-bottom-2">
                      <p className="text-red-400 text-[10px] text-center font-bold uppercase tracking-widest leading-relaxed">
                        {errorMessage}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-white/20 text-[9px] uppercase tracking-[0.3em] mt-6 lg:mt-8">
            Secure Corporate Access
          </p>
        </div>
      </div>
    </div>
  );
}
