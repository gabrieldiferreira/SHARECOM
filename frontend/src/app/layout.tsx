import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
import Layout from "@/components/Layout";
import AuthGate from "@/components/AuthGate";
import ErrorSentinel from "@/components/ErrorSentinel";
import InstallPrompt from "@/components/InstallPrompt";
import { I18nProvider } from "@/i18n/client";
import { locales, defaultLocale, type Locale } from "@/i18n/request";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";

import { DevTools } from "@/components/DevTools";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#16161E" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "SHARECOM - Controle Financeiro",
  description: "Sistema inteligente de controle financeiro e gestão de comprovantes",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192x192.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SHARECOM",
    startupImage: [
      // In a real prod setup, multiple splash screen images would be defined here
      { url: "/splash-1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
    ],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "theme-color": "var(--mobile-header-surface)",
  },
  formatDetection: {
    telephone: false,
  },
};

async function getLocaleAndMessages(): Promise<{ locale: Locale; messages: Record<string, any> }> {
  let locale: Locale = defaultLocale;

  try {
    // 1. Cookie first
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value as Locale | undefined;
    if (cookieLocale && locales.includes(cookieLocale)) {
      locale = cookieLocale;
    } else {
      // 2. Accept-Language header
      const headerStore = await headers();
      const acceptLanguage = headerStore.get("accept-language") || "";
      const langs = acceptLanguage.split(",").map(l => l.split(";")[0].trim().toLowerCase());
      for (const lang of langs) {
        if (lang.startsWith("pt")) { locale = "pt-BR"; break; }
        if (lang.startsWith("en")) { locale = "en"; break; }
        if (lang.startsWith("es")) { locale = "es"; break; }
      }
    }
  } catch {
    // Static rendering fallback
  }

  const messages = (await import(`@/messages/${locale}.json`)).default;
  return { locale, messages };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, messages } = await getLocaleAndMessages();

  return (
    <html lang={locale} dir="ltr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://firebaseapp.com" />
        <link rel="dns-prefetch" href="https://openrouter.ai" />
      </head>
      <body className={`${inter.variable} font-sans transition-theme`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ToastProvider>
            <I18nProvider initialLocale={locale} initialMessages={messages}>
              <ErrorSentinel>
                <AuthGate>
                  <Layout>{children}</Layout>
                </AuthGate>
                <InstallPrompt />
                <DevTools />
              </ErrorSentinel>
            </I18nProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
