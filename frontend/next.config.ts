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
      {
        source: "/__/firebase/:path*",
        destination: "https://unidoc-493609.firebaseapp.com/__/firebase/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        // 1. REGRAS GERAIS (App Principal)
        source: "/(.*)",
        missing: [{ type: "host", value: "auth.sharecom.com.br" }],
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Permite que o app abra o popup do Google e receba os dados de volta
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
      {
        // 2. REGRAS ESPECÍFICAS PARA AUTH
        source: "/(.*)",
        has: [{ type: "host", value: "auth.sharecom.com.br" }],
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' http://localhost:3000 https://localhost:3000 https://app.sharecom.com.br https://auth.sharecom.com.br https://unidoc-493609.firebaseapp.com https://www.sharecom.com.br" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
          // No domínio de auth, a política deve ser relaxada para o Google processar o login
          { key: "Cross-Origin-Opener-Policy", value: "unsafe-none" },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
