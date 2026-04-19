"use client";

import { useEffect, useRef } from "react";

// Adicionando suporte a tipos para o Web Component
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'pwa-install': any;
    }
  }
}

export default function InstallPrompt() {
  const pwaInstallRef = useRef<any>(null);

  useEffect(() => {
    // Importação dinâmica para evitar erros de SSR
    import("@khmyznikov/pwa-install").then(() => {
      console.log("SHARECOM: Biblioteca PWA Carregada! 🚀");
    });
  }, []);

  return (
    <pwa-install
      ref={pwaInstallRef}
      id="pwa-install-element"
      install-description="Instale o SHARECOM para gerenciar seus comprovantes com facilidade e offline."
      manifest-url="/manifest.json"
      name="SHARECOM"
      icon="/icon-192x192.png"
      description="Gerenciamento inteligente de comprovantes com IA"
      manual-apple="true"
      manual-chrome="true"
      use-custom-brand
      // Estilização customizada para bater com o tema dark
      style={{
        '--pwa-install-bg-color': 'var(--bg-secondary)',
        '--pwa-install-text-color': 'var(--text-primary)',
        '--pwa-install-primary-color': '#10B981',
        '--pwa-install-border-radius': '16px',
        '--pwa-install-font-family': 'var(--font-inter)',
        '--pwa-install-z-index': '9999'
      } as any}
    ></pwa-install>
  );
}
