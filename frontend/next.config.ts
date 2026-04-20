import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
  buildExcludes: [/middleware-manifest\.json$/, /app-build-manifest\.json$/],
  customWorkerDir: "worker",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: "https://unidoc-493609.firebaseapp.com/__/auth/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        // 1. REGRAS GERAIS (Para o app principal)
        // Aplicado a tudo, EXCETO quando o host for o de autenticação
        source: "/(.*)",
        missing: [{ type: "host", value: "auth.sharecom.com.br" }],
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // 2. REGRAS ESPECÍFICAS PARA AUTH (Permissivo para o Firebase)
        // Aplicado APENAS quando o host for auth.sharecom.com.br
        source: "/(.*)",
        has: [{ type: "host", value: "auth.sharecom.com.br" }],
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // frame-ancestors * permite que qualquer uma das suas origens autorizadas carregue o login
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' http://localhost:3000 https://localhost:3000 https://app.sharecom.com.br https://auth.sharecom.com.br https://unidoc-493609.firebaseapp.com" },
          // Desativa o X-Frame-Options antigo que conflita com o CSP moderno
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
