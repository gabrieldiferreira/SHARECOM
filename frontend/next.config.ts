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
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Removemos o X-Frame-Options global para permitir que o auth funcione
          // A segurança por frame será feita via CSP frame-ancestors
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' http://localhost:3000 https://app.sharecom.com.br https://auth.sharecom.com.br https://unidoc-493609.firebaseapp.com;" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
