import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export const locales = ['pt-BR', 'en', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'pt-BR';

export default getRequestConfig(async () => {
  const locale = await getLocale();

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});

export async function getLocale(): Promise<Locale> {
  // 1. Cookie takes priority (user explicit choice)
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value as Locale | undefined;
  if (cookieLocale && locales.includes(cookieLocale)) {
    return cookieLocale;
  }

  // 2. Accept-Language header detection
  const headerStore = await headers();
  const acceptLanguage = headerStore.get('accept-language') || '';
  const detected = detectLocaleFromHeader(acceptLanguage);
  if (detected) return detected;

  // 3. Default to pt-BR
  return defaultLocale;
}

function detectLocaleFromHeader(acceptLanguage: string): Locale | null {
  if (!acceptLanguage) return null;

  // Parse Accept-Language header: e.g. "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
  const preferred = acceptLanguage
    .split(',')
    .map(lang => {
      const [tag, q = 'q=1.0'] = lang.trim().split(';');
      const quality = parseFloat(q.replace('q=', ''));
      return { tag: tag.trim().toLowerCase(), quality };
    })
    .sort((a, b) => b.quality - a.quality)
    .map(l => l.tag);

  for (const lang of preferred) {
    // Exact match first
    const exact = locales.find(l => l.toLowerCase() === lang);
    if (exact) return exact;

    // Prefix match: "pt" → "pt-BR", "en-us" → "en"
    if (lang.startsWith('pt')) return 'pt-BR';
    if (lang.startsWith('en')) return 'en';
    if (lang.startsWith('es')) return 'es';
  }

  return null;
}
