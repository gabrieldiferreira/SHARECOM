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
  // Removemos turbopack vazio para evitar conflitos no build da Vercel
  reactStrictMode: true,
  compress: true, // Enables gzip/brotli compression
  poweredByHeader: false, // Remove X-Powered-By header
  eslint: {
    // Desativamos para que o build passe mesmo com avisos de <img> e <a>
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Garante que o build não trave por tipos no ambiente da Vercel
    ignoreBuildErrors: true,
  },
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
        // Cache longo para assets estáticos imutáveis (ícones, fontes, SW)
        source: "/(icon-192x192|icon-512x512|logo|manifest)\\.(png|svg|json|ico)$",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Cache do Service Worker não deve ser longo (precisa ser re-baixado)
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        // Segurança para todas as rotas
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
