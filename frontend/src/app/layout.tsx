import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Layout from "@/components/Layout";
import AuthGate from "@/components/AuthGate";
import ErrorSentinel from "@/components/ErrorSentinel";
import InstallPrompt from "@/components/InstallPrompt";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "SHARECOM - Gerenciamento de Comprovantes",
  description: "Sistema de gerenciamento de comprovantes financeiros",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-512x512.png",
    apple: "/icon-512x512.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SHARECOM",
    startupImage: "/icon-512x512.png"
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
