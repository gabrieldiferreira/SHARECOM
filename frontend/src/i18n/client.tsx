'use client';

import { useCallback, useState, useEffect, createContext, useContext } from 'react';
import { ptBR, enUS, es as esLocale } from 'date-fns/locale';
import { format as dateFnsFormat } from 'date-fns';
import type { Locale } from './request';

// ─── Types ───────────────────────────────────────────────────────────────────

type Messages = Record<string, any>;

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
  formatCurrency: (amount: number) => string;
  formatDate: (dateStr: string | Date, fmt?: string) => string;
  formatNumber: (n: number) => string;
}

// ─── Locale → date-fns locale map ────────────────────────────────────────────

const dateFnsLocales: Record<Locale, Locale extends string ? object : never> = {
  'pt-BR': ptBR,
  'en': enUS,
  'es': esLocale,
} as any;

// ─── Currency config ──────────────────────────────────────────────────────────

const currencyConfig: Record<Locale, { currency: string; }> = {
  'pt-BR': { currency: 'BRL' },
  'en':    { currency: 'USD' },
  'es':    { currency: 'USD' },
};

// ─── Context ──────────────────────────────────────────────────────────────────

const I18nContext = createContext<I18nContextValue | null>(null);

// ─── Simple dot-path resolver (e.g. "dashboard.cashFlow") ────────────────────

function resolvePath(obj: Messages, path: string): string | undefined {
  return path.split('.').reduce((acc, key) => acc?.[key], obj as any) as string | undefined;
}

// ─── ICU-style plural parser (minimal, supports =0 / one / other) ─────────────

function parsePlural(template: string, count: number): string {
  const match = template.match(/\{(\w+),\s*plural,\s*(.+)\}/);
  if (!match) return template;

  const cases = match[2];
  const exact = cases.match(new RegExp(`=${count}\\s*\\{([^}]*)\\}`));
  if (exact) return exact[1].replace('#', String(count));

  const one = cases.match(/\bone\s*\{([^}]*)\}/);
  const other = cases.match(/\bother\s*\{([^}]*)\}/);

  if (count === 1 && one) return one[1].replace('#', String(count));
  if (other) return other[1].replace('#', String(count));

  return String(count);
}

// ─── Variable interpolation ───────────────────────────────────────────────────

function interpolate(template: string, values: Record<string, string | number> = {}): string {
  // Handle plural first
  if (template.includes(', plural,')) {
    const count = typeof values.count === 'number' ? values.count : parseInt(String(values.count ?? 0));
    template = parsePlural(template, count);
  }
  // Then replace simple {key} tokens
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

// ─── Provider ────────────────────────────────────────────────────────────────

interface I18nProviderProps {
  children: React.ReactNode;
  initialLocale: Locale;
  initialMessages: Messages;
}

export function I18nProvider({ children, initialLocale, initialMessages }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [messages, setMessages] = useState<Messages>(initialMessages);

  const setLocale = useCallback(async (newLocale: Locale) => {
    // Persist in cookie (1 year)
    document.cookie = `NEXT_LOCALE=${newLocale}; max-age=${60 * 60 * 24 * 365}; path=/; samesite=lax`;

    // Reload so the server sends the correct message bundle through layout.tsx
    window.location.reload();
  }, []);

  const t = useCallback((key: string, values?: Record<string, string | number>): string => {
    const raw = resolvePath(messages, key);
    if (!raw) {
      console.warn(`[i18n] Missing key: "${key}" for locale "${locale}"`);
      return key;
    }
    return interpolate(raw, values);
  }, [messages, locale]);

  const formatCurrency = useCallback((amount: number): string => {
    const { currency } = currencyConfig[locale];
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }, [locale]);

  const formatNumber = useCallback((n: number): string => {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }, [locale]);

  const formatDate = useCallback((dateStr: string | Date, fmt = 'PPpp'): string => {
    try {
      const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
      if (isNaN(date.getTime())) return '—';
      return dateFnsFormat(date, fmt, { locale: dateFnsLocales[locale] as any });
    } catch {
      return '—';
    }
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, formatCurrency, formatDate, formatNumber }}>
      {children}
    </I18nContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

// ─── Standalone helpers (for use outside React, e.g. in tRPC context) ────────

export function formatCurrencyStatic(amount: number, locale: Locale): string {
  const { currency } = currencyConfig[locale];
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export function formatDateStatic(date: Date, locale: Locale, fmt = 'PPpp'): string {
  try {
    return dateFnsFormat(date, fmt, { locale: dateFnsLocales[locale] as any });
  } catch {
    return date.toISOString();
  }
}
