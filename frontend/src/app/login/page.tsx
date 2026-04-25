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
    return () => {
      document.body.classList.remove('login-page');
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
    <div className="min-h-screen w-full bg-[#0D0D12]">
      {/* Background gradients - pointer-events-none */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.4)_0%,_rgba(236,72,153,0.25)_40%,_transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(139,92,246,0.3)_0%,_rgba(236,72,153,0.15)_40%,_transparent_70%)]" />
      </div>

      {/* Left Side Image / Background - Contextual */}
      <div className="absolute left-0 top-0 w-full lg:w-1/2 h-full pointer-events-none bg-brand-purple overflow-hidden">
        {/* Dark overlay to ensure contrast - More aggressive on mobile, removed on desktop */}
        <div className="absolute inset-0 bg-black/60 lg:bg-transparent z-20" />
        {/* Subtle gradients to blend with the dark theme */}
        <div className="absolute inset-0 bg-gradient-to-b from-brand-purple/30 via-black/40 to-[#0D0D12] lg:hidden z-10" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0D0D12] hidden lg:block z-10" />
        <Image src="/ceo-mobile.png" fill className="object-cover opacity-30 lg:opacity-100 grayscale-[0.2] brightness-[0.4] lg:brightness-100" alt="CEO Mobile" />
      </div>

      {/* Main content - z-50 */}
      <div className="relative z-50 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-5 p-3 bg-white/5 rounded-3xl border border-white/10 shadow-2xl">
              <Image src="/logo.png" width={80} height={80} className="w-full h-full object-contain" alt="Logo" priority />
            </div>
            <h1 className="text-4xl font-black tracking-[0.15em] mb-1.5 text-white">
              SHARECOM
            </h1>
            <p className="text-purple-400/60 font-medium tracking-widest text-[9px] uppercase">
              Intelligence Control Systems
            </p>
          </div>

          {/* Login Card - NO backdrop-filter */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl">
            {isCheckingSession ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Loader2 className="w-10 h-10 border-4 border-white/10 border-t-purple-500 animate-spin rounded-full" />
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Validando Sessão...</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="text-center space-y-1 mb-6">
                  <h2 className="text-2xl font-bold text-white">Boas-vindas</h2>
                  <p className="text-white/50 text-sm">Conecte sua conta para acessar.</p>
                </div>

                {/* Email Input */}
                <div className="relative">
                  <div 
                    className="relative rounded-xl transition-all duration-200"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: emailFocused ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: emailFocused ? '0 0 0 3px rgba(139, 92, 246, 0.15)' : 'none',
                    }}
                  >
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      placeholder="E-mail"
                      aria-label="E-mail"
                      className="w-full bg-transparent py-3.5 pl-10 pr-3 text-sm text-white placeholder:text-white/35 outline-none"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="relative">
                  <div 
                    className="relative rounded-xl transition-all duration-200"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: passwordFocused ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: passwordFocused ? '0 0 0 3px rgba(139, 92, 246, 0.15)' : 'none',
                    }}
                  >
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      placeholder="Senha"
                      aria-label="Senha"
                      className="w-full bg-transparent py-3.5 pl-10 pr-10 text-sm text-white placeholder:text-white/35 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors z-10"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Forgot Password */}
                <div className="flex justify-end -mt-1">
                  <button 
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[11px] text-white/40 hover:text-white/60 transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                </div>

                {/* Primary Button */}
                <button
                  type="button"
                  onClick={handleEmailLogin}
                  disabled={isSigningIn}
                  className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                    boxShadow: '0 4px 20px rgba(139, 92, 246, 0.35)',
                  }}
                >
                  {isSigningIn ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    "ENTRAR COM E-MAIL"
                  )}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] text-white/30 uppercase">ou</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Social Login Buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isSigningIn}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 hover:bg-white/5 bg-white/5 border border-white/10"
                  >
                    <Image src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={16} height={16} className="w-4 h-4" alt="Google" />
                    Google
                  </button>
                </div>

                {errorMessage && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <p className="text-red-400 text-[10px] text-center font-bold uppercase tracking-widest leading-relaxed">
                      {errorMessage}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-center text-white/30 text-[9px] uppercase tracking-[0.25em]">
            Secure Corporate Access
          </p>
        </div>
      </div>

      {/* Right Side Image - Desktop Only */}
      <div className="hidden lg:block fixed right-0 top-0 w-1/2 h-full pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D12] via-transparent to-transparent z-10" />
        <Image src="/user-working.png" fill className="object-cover grayscale-[0.15]" alt="Work" priority />
      </div>
    </div>
  );
}
