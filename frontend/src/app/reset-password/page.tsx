"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  confirmPasswordReset,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
} from "firebase/auth";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { auth } from "@/lib/firebase";

function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 w-full h-full bg-[#0D0D12] overflow-y-auto overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.4)_0%,_rgba(236,72,153,0.25)_40%,_transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(139,92,246,0.3)_0%,_rgba(236,72,153,0.15)_40%,_transparent_70%)]" />
      </div>

      {/* Left Side Image / Background - Contextual */}
      <div className="fixed left-0 top-0 w-full lg:w-1/2 h-[100dvh] pointer-events-none bg-brand-purple overflow-hidden z-10">
        {/* Dark overlay to ensure contrast - More aggressive on mobile, removed on desktop */}
        <div className="absolute inset-0 bg-black/60 lg:bg-transparent z-20" />
        {/* Subtle gradients to blend with the dark theme */}
        <div className="absolute inset-0 bg-gradient-to-b from-brand-purple/30 via-black/40 to-[#0D0D12] lg:hidden z-10" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0D0D12] hidden lg:block z-10" />
        <Image src="/ceo-mobile.png" fill className="object-cover opacity-30 lg:opacity-100 grayscale-[0.2] brightness-[0.4] lg:brightness-100" alt="CEO Mobile" />
      </div>

      <div className="relative z-50 flex min-h-[100dvh] items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-5 overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
              <Image src="/logo.png" width={80} height={80} className="w-full h-full object-cover scale-[1.15]" alt="Logo" priority />
            </div>
            <h1 className="text-4xl font-black tracking-[0.15em] mb-1.5 text-white">
              SHARE<span className="text-purple-500">COM</span>
            </h1>
            <p className="text-purple-400/60 font-medium tracking-widest text-[9px] uppercase">
              Intelligence Control Systems
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="space-y-5">
              <div className="text-center space-y-2 mb-6">
                <h2 className="text-2xl font-bold text-white">{title}</h2>
                <p className="text-white/50 text-sm">{description}</p>
              </div>

              {children}
            </div>
          </div>

          <p className="text-center text-white/30 text-[9px] uppercase tracking-[0.25em]">
            Secure Corporate Access
          </p>
        </div>
      </div>

      <div className="hidden lg:block fixed right-0 top-0 w-1/2 h-full pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D12] via-transparent to-transparent z-10" />
        <Image src="/user-working.png" fill className="object-cover grayscale-[0.15]" alt="Work" priority />
      </div>
    </div>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordFocused, setNewPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [isResetComplete, setIsResetComplete] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const oobCode = searchParams.get("oobCode") ?? "";
  const emailParam = searchParams.get("email") ?? "";

  useEffect(() => {
    document.body.classList.add("login-page");
    // Force background color on html/body for mobile safe areas
    const originalBodyBg = document.body.style.backgroundColor;
    const originalHtmlBg = document.documentElement.style.backgroundColor;

    document.body.style.backgroundColor = "#0D0D12";
    document.documentElement.style.backgroundColor = "#0D0D12";

    return () => {
      document.body.classList.remove("login-page");
      document.body.style.backgroundColor = originalBodyBg;
      document.documentElement.style.backgroundColor = originalHtmlBg;
    };
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!emailParam) return;
    setEmail(emailParam);
  }, [emailParam]);

  useEffect(() => {
    if (!oobCode) {
      setIsVerifyingCode(false);
      setIsCodeValid(false);
      setAccountEmail("");
      return;
    }

    if (!auth) {
      setIsVerifyingCode(false);
      setIsCodeValid(false);
      setErrorMessage("Erro: Firebase não configurado.");
      return;
    }

    let active = true;
    setIsVerifyingCode(true);
    setErrorMessage("");
    setSuccessMessage("");

    verifyPasswordResetCode(auth, oobCode)
      .then((resolvedEmail) => {
        if (!active) return;
        setAccountEmail(resolvedEmail);
        setIsCodeValid(true);
      })
      .catch((error: any) => {
        if (!active) return;
        console.error("❌ Reset code verification failed:", error);
        setIsCodeValid(false);
        setErrorMessage("Este link de redefinição é inválido ou expirou. Solicite um novo link.");
      })
      .finally(() => {
        if (!active) return;
        setIsVerifyingCode(false);
      });

    return () => {
      active = false;
    };
  }, [oobCode]);

  useEffect(() => {
    if (!isResetComplete) return;

    const timeoutId = window.setTimeout(() => {
      router.push("/login");
    }, 1600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isResetComplete, router]);

  const handleSendResetEmail = async () => {
    if (!auth) {
      setErrorMessage("Erro: Firebase não configurado.");
      return;
    }

    if (!email.trim()) {
      setErrorMessage("Informe seu e-mail para receber o link de redefinição.");
      return;
    }

    setIsSending(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccessMessage("Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
    } catch (error: any) {
      console.error("❌ Password reset email failed:", error);

      if (error?.code === "auth/invalid-email") {
        setErrorMessage("Informe um e-mail válido.");
      } else if (error?.code === "auth/too-many-requests") {
        setErrorMessage("Muitas tentativas. Aguarde um pouco e tente novamente.");
      } else if (error?.code === "auth/operation-not-allowed") {
        setErrorMessage("Ative o login por e-mail e senha no Firebase.");
      } else {
        setErrorMessage("Não foi possível enviar o e-mail agora. Tente novamente.");
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!auth) {
      setErrorMessage("Erro: Firebase não configurado.");
      return;
    }

    if (!oobCode) {
      setErrorMessage("Código de redefinição ausente.");
      return;
    }

    if (!newPassword || !confirmPassword) {
      setErrorMessage("Preencha e confirme a nova senha.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("As senhas não coincidem.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setIsResetComplete(true);
      setSuccessMessage("Senha redefinida com sucesso. Redirecionando para o login...");
    } catch (error: any) {
      console.error("❌ Password reset confirmation failed:", error);

      if (error?.code === "auth/expired-action-code" || error?.code === "auth/invalid-action-code") {
        setErrorMessage("Este link de redefinição é inválido ou expirou. Solicite um novo link.");
      } else if (error?.code === "auth/weak-password") {
        setErrorMessage("Escolha uma senha mais forte.");
      } else {
        setErrorMessage("Não foi possível redefinir a senha. Tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return null;

  if (isVerifyingCode) {
    return (
      <AuthShell
        title="Validando link"
        description="Estamos conferindo se o seu link de redefinição ainda é válido."
      >
        <div className="flex flex-col items-center justify-center py-6 space-y-4">
          <Loader2 className="w-10 h-10 border-4 border-white/10 border-t-purple-500 animate-spin rounded-full" />
          <p className="text-[11px] text-white/40 font-bold uppercase tracking-widest">
            Verificando código...
          </p>
        </div>
      </AuthShell>
    );
  }

  if (oobCode && isCodeValid) {
    return (
      <AuthShell
        title="Criar nova senha"
        description={`Defina uma nova senha para ${accountEmail || "sua conta"}.`}
      >
        <div className="space-y-4">
          <div className="relative">
            <div
              className="relative rounded-xl transition-all duration-200"
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: newPasswordFocused ? "1px solid rgba(139, 92, 246, 0.5)" : "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow: newPasswordFocused ? "0 0 0 3px rgba(139, 92, 246, 0.15)" : "none",
              }}
            >
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onFocus={() => setNewPasswordFocused(true)}
                onBlur={() => setNewPasswordFocused(false)}
                placeholder="Nova senha"
                aria-label="Nova senha"
                className="w-full bg-transparent py-3.5 pl-10 pr-10 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="relative">
            <div
              className="relative rounded-xl transition-all duration-200"
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: confirmPasswordFocused ? "1px solid rgba(139, 92, 246, 0.5)" : "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow: confirmPasswordFocused ? "0 0 0 3px rgba(139, 92, 246, 0.15)" : "none",
              }}
            >
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onFocus={() => setConfirmPasswordFocused(true)}
                onBlur={() => setConfirmPasswordFocused(false)}
                placeholder="Confirmar nova senha"
                aria-label="Confirmar nova senha"
                className="w-full bg-transparent py-3.5 pl-10 pr-10 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirmReset}
            disabled={isSubmitting || isResetComplete}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg"
            style={{
              background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
              boxShadow: "0 4px 20px rgba(139, 92, 246, 0.35)",
            }}
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "SALVAR NOVA SENHA"}
          </button>

          <Link
            href="/login"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm text-white transition-all hover:bg-white/5 bg-white/5 border border-white/10"
          >
            <ArrowLeft size={16} />
            Voltar para login
          </Link>

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-300 mt-0.5 shrink-0" />
              <p className="text-emerald-300 text-sm leading-relaxed">{successMessage}</p>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-sm text-center leading-relaxed">
                {errorMessage}
              </p>
            </div>
          )}
        </div>
      </AuthShell>
    );
  }

  if (oobCode && !isCodeValid) {
    return (
      <AuthShell
        title="Link inválido"
        description="Este link não pode mais ser usado. Solicite uma nova redefinição de senha."
      >
        <div className="space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-sm text-center leading-relaxed">
                {errorMessage}
              </p>
            </div>
          )}

          <Link
            href="/reset-password"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm text-white transition-all hover:bg-white/5 bg-white/5 border border-white/10"
          >
            Solicitar novo link
          </Link>

          <Link
            href="/login"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm text-white transition-all hover:bg-white/5 bg-white/5 border border-white/10"
          >
            <ArrowLeft size={16} />
            Voltar para login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Redefinir senha"
      description="Informe seu e-mail e enviaremos um link para criar uma nova senha."
    >
      <div className="space-y-4">
        <div className="relative">
          <div
            className="relative rounded-xl transition-all duration-200"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: emailFocused ? "1px solid rgba(139, 92, 246, 0.5)" : "1px solid rgba(255, 255, 255, 0.1)",
              boxShadow: emailFocused ? "0 0 0 3px rgba(139, 92, 246, 0.15)" : "none",
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
              aria-label="E-mail para redefinição de senha"
              className="w-full bg-transparent py-3.5 pl-10 pr-3 text-sm text-white placeholder:text-white/35 outline-none"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSendResetEmail}
          disabled={isSending}
          className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg"
          style={{
            background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
            boxShadow: "0 4px 20px rgba(139, 92, 246, 0.35)",
          }}
        >
          {isSending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ENVIAR LINK"}
        </button>

        <Link
          href="/login"
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm text-white transition-all hover:bg-white/5 bg-white/5 border border-white/10"
        >
          <ArrowLeft size={16} />
          Voltar para login
        </Link>

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-emerald-300 text-sm text-center leading-relaxed">
              {successMessage}
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-sm text-center leading-relaxed">
              {errorMessage}
            </p>
          </div>
        )}
      </div>
    </AuthShell>
  );
}

function ResetPasswordFallback() {
  return (
    <AuthShell
      title="Carregando"
      description="Preparando a experiência de redefinição de senha."
    >
      <div className="flex flex-col items-center justify-center py-6 space-y-4">
        <Loader2 className="w-10 h-10 border-4 border-white/10 border-t-purple-500 animate-spin rounded-full" />
        <p className="text-[11px] text-white/40 font-bold uppercase tracking-widest">
          Aguarde...
        </p>
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
