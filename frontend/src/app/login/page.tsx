"use client";

import { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, hasFirebaseConfig, provider } from "@/lib/firebase";
import {
  Receipt,
  ShieldCheck,
  BarChart3,
  Share2,
  Scan,
  Lock,
} from "lucide-react";

export default function LoginPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleGoogleLogin = async () => {
    if (!auth || !provider) {
      setErrorMessage(
        "Firebase não configurado. Preencha as variáveis NEXT_PUBLIC_FIREBASE_*."
      );
      return;
    }

    setErrorMessage("");
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google login failed:", error);
      setErrorMessage(
        "Falha no login com Google. Verifique a configuração do Firebase."
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const features = [
    {
      icon: Scan,
      title: "Escaneie comprovantes",
      description: "Digitalize e organize seus recibos com IA",
      color: "#8B5CF6",
    },
    {
      icon: BarChart3,
      title: "Relatórios detalhados",
      description: "Visualize entradas, saídas e categorias",
      color: "#3B82F6",
    },
    {
      icon: Share2,
      title: "Compartilhe com facilidade",
      description: "Envie comprovantes para qualquer pessoa",
      color: "#14B8A6",
    },
  ];

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Painel esquerdo — branding + features */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        {/* Decoração de fundo sutil */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, #3B82F6 0%, transparent 50%), radial-gradient(circle at 80% 70%, #8B5CF6 0%, transparent 50%)",
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 flex items-center justify-center"
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                borderRadius: "8px",
              }}
            >
              <Receipt size={22} style={{ color: "#3B82F6" }} />
            </div>
            <h1
              className="text-xl font-medium tracking-wide"
              style={{ color: "var(--text-primary)" }}
            >
              SHARECOM
            </h1>
          </div>
          <p
            className="mt-1"
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
            }}
          >
            Sistema de Gerenciamento de Comprovantes
          </p>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center gap-8 max-w-sm">
          <h2
            className="text-2xl font-medium leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
            Gerencie seus comprovantes de forma{" "}
            <span style={{ color: "#3B82F6" }}>simples</span> e{" "}
            <span style={{ color: "#10B981" }}>segura</span>
          </h2>

          <div className="flex flex-col gap-6">
            {features.map((feat) => (
              <div key={feat.title} className="flex items-start gap-3">
                <div
                  className="w-9 h-9 flex-shrink-0 flex items-center justify-center"
                  style={{
                    backgroundColor: `${feat.color}14`,
                    borderRadius: "8px",
                  }}
                >
                  <feat.icon size={18} style={{ color: feat.color }} />
                </div>
                <div>
                  <p
                    className="font-medium"
                    style={{
                      fontSize: "14px",
                      color: "var(--text-primary)",
                    }}
                  >
                    {feat.title}
                  </p>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginTop: "2px",
                    }}
                  >
                    {feat.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
            © {new Date().getFullYear()} SHARECOM
          </p>
        </div>
      </div>

      {/* Painel direito — formulário de login */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo mobile */}
        <div className="flex flex-col items-center mb-10 lg:mb-12">
          <div
            className="w-14 h-14 flex items-center justify-center mb-4"
            style={{
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              borderRadius: "12px",
            }}
          >
            <Receipt size={28} style={{ color: "#3B82F6" }} />
          </div>
          <h1
            className="text-2xl font-medium tracking-wide"
            style={{ color: "var(--text-primary)" }}
          >
            SHARECOM
          </h1>
          <p
            className="mt-2 text-center leading-relaxed lg:hidden"
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
            }}
          >
            Sistema de Gerenciamento de Comprovantes
          </p>
        </div>

        {/* Card de login */}
        <div
          className="w-full max-w-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "0.5px solid var(--ds-border)",
            borderRadius: "8px",
            padding: "24px",
          }}
        >
          <div className="mb-6">
            <h2
              className="font-medium mb-1"
              style={{
                fontSize: "16px",
                color: "var(--text-primary)",
              }}
            >
              Acesse sua conta
            </h2>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              Entre para gerenciar suas transações e comprovantes
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isSigningIn || !hasFirebaseConfig}
            className="w-full py-3 font-medium text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-3"
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "0.5px solid var(--ds-border)",
              borderRadius: "6px",
              color: "var(--text-primary)",
            }}
          >
            {isSigningIn ? (
              <div
                className="w-5 h-5 rounded-full animate-spin"
                style={{
                  border: "2px solid var(--ds-border)",
                  borderTopColor: "#3B82F6",
                }}
              />
            ) : (
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                className="w-5 h-5"
                alt="Google"
              />
            )}
            {isSigningIn ? "Conectando..." : "Entrar com Google"}
          </button>

          {errorMessage ? (
            <p
              className="mt-4 text-center"
              style={{
                fontSize: "12px",
                color: "#EF4444",
                backgroundColor: "rgba(239, 68, 68, 0.05)",
                borderRadius: "6px",
                padding: "12px",
              }}
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <div
            className="mt-6 pt-5 flex items-center justify-center gap-2"
            style={{ borderTop: "0.5px solid var(--ds-border)" }}
          >
            <Lock size={12} style={{ color: "var(--text-tertiary)" }} />
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
              }}
            >
              Criptografia de ponta a ponta
            </p>
          </div>
        </div>

        {/* Feature pills — mobile only */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-8 lg:hidden">
          {features.map((feat) => (
            <div
              key={feat.title}
              className="flex items-center gap-2"
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                backgroundColor: "var(--bg-secondary)",
                border: "0.5px solid var(--ds-border)",
                borderRadius: "6px",
                padding: "6px 10px",
              }}
            >
              <feat.icon size={14} style={{ color: feat.color }} />
              {feat.title}
            </div>
          ))}
        </div>

        {/* Segurança — desktop */}
        <div className="hidden lg:flex items-center gap-2 mt-10">
          <ShieldCheck size={14} style={{ color: "#10B981" }} />
          <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
            Seus dados são protegidos com criptografia AES-256
          </p>
        </div>
      </div>
    </div>
  );
}
