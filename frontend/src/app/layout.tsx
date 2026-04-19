import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Layout from "@/components/Layout";
import AuthGate from "@/components/AuthGate";
import ErrorSentinel from "@/components/ErrorSentinel";
import InstallPrompt from "@/components/InstallPrompt";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap", // Prevents render-blocking: shows fallback font instantly
  preload: true,
});

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "SHARECOM - Gerenciamento de Comprovantes",
  description: "Sistema inteligente de gerenciamento de comprovantes financeiros com extração de dados via IA",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SHARECOM",
    startupImage: "/icon-192x192.png"
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        {/* DNS prefetch + preconnect para recursos externos */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://firebaseapp.com" />
        <link rel="dns-prefetch" href="https://openrouter.ai" />
        {/* Preload do ícone principal (evita LCP delay) */}
        <link rel="preload" href="/icon-192x192.png" as="image" type="image/png" />
      </head>
      <body className={`${inter.variable} font-sans`}>
        <ErrorSentinel>
          <AuthGate>
            <Layout>{children}</Layout>
          </AuthGate>
          <InstallPrompt />
        </ErrorSentinel>
      </body>
    </html>
  );
}
