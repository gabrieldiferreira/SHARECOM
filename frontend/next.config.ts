import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
  buildExcludes: [/middleware-manifest\.json$/],
  customWorkerDir: "worker",
});

const nextConfig: NextConfig = {
  // Removemos turbopack vazio para evitar conflitos no build da Vercel
  reactStrictMode: true,
};

export default withPWA(nextConfig);
