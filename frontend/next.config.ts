import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development" ? false : false, // Force enable for testing
  reloadOnOnline: true,
  buildExcludes: [/middleware-manifest\.json$/],
  customWorkerDir: "worker",
});

const nextConfig: NextConfig = {
  turbopack: {},
};

export default withPWA(nextConfig);
