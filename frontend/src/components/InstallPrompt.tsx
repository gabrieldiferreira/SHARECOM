"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, X, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Não mostra se já foi dispensado nesta sessão
    const wasDismissed = sessionStorage.getItem("pwa-install-dismissed");
    if (wasDismissed) return;

    // Detecta iOS — não tem beforeinstallprompt, mas pode adicionar à tela inicial
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

    if (isStandalone) return; // Já instalado, não mostra

    if (ios) {
      setIsIOS(true);
      // No iOS, mostra o banner após 3s para guiar o usuário
      const t = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(t);
    }

    // Android/Chrome/Edge: captura o evento sem chamar preventDefault
    const handler = (e: Event) => {
      e.preventDefault(); // Evita o mini-infobar nativo (feio)
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Mostra o banner após 2s
      setTimeout(() => setShowBanner(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setDismissed(true);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  };

  return (
    <AnimatePresence>
      {showBanner && !dismissed && (
        isIOS ? (
          <motion.div
            key="ios-banner"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="fixed bottom-32 left-4 right-4 z-[500] rounded-2xl p-4 shadow-2xl"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--ds-border)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl overflow-hidden shrink-0 shadow-md"
                style={{ border: '1px solid var(--ds-border)' }}
              >
                <Image src="/logo.png" alt="SHARECOM App Logo" width={40} height={40} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Instalar SHARECOM
                </p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Toque em{" "}
                  <span className="font-bold" style={{ color: "#3B82F6" }}>
                    Compartilhar ↑
                  </span>{" "}
                  e depois{" "}
                  <span className="font-bold" style={{ color: "#3B82F6" }}>
                    &ldquo;Adicionar à Tela de Início&rdquo;
                  </span>
                </p>
              </div>
              <button onClick={handleDismiss} style={{ color: "var(--text-tertiary)" }}>
                <X size={18} />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="android-banner"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="fixed bottom-32 left-4 right-4 z-[500] rounded-2xl shadow-2xl"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--ds-border)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div className="flex items-center gap-3 p-4">
              <div
                className="w-10 h-10 rounded-xl overflow-hidden shrink-0 shadow-md"
                style={{ border: '1px solid var(--ds-border)' }}
              >
                <Image src="/logo.png" alt="SHARECOM App Logo" width={40} height={40} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  Instalar SHARECOM
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Acesso rápido, funciona offline
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg"
                  style={{
                    border: "0.5px solid var(--ds-border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Agora não
                </button>
                <button
                  onClick={handleInstall}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg text-white"
                  style={{ backgroundColor: "#3B82F6" }}
                >
                  Instalar
                </button>
              </div>
            </div>
          </motion.div>
        )
      )}
    </AnimatePresence>
  );
}
