import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale, type Locale } from './i18n/request';

// ─── Paths to skip ────────────────────────────────────────────────────────────
const SKIP_PATHS = [
  '/_next/',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
  '/workbox-',
  '/worker-',
  '/icon-',
  '/robots.txt',
  '/sitemap.xml',
];

// ─── Rate limit config ────────────────────────────────────────────────────────
const RATE_LIMIT_PATHS = ['/api/share', '/api/trpc'];
const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 60;    // requests per window

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets
  if (SKIP_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // ── 1. Locale detection (cookie → Accept-Language → default) ─────────────
  if (!pathname.startsWith('/api/')) {
    const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value as Locale | undefined;
    let locale: Locale = defaultLocale;

    if (cookieLocale && locales.includes(cookieLocale)) {
      locale = cookieLocale;
    } else {
      const acceptLanguage = request.headers.get('accept-language') || '';
      const langs = acceptLanguage.split(',').map(l => l.split(';')[0].trim().toLowerCase());
      for (const lang of langs) {
        if (lang.startsWith('pt')) { locale = 'pt-BR'; break; }
        if (lang.startsWith('en')) { locale = 'en'; break; }
        if (lang.startsWith('es')) { locale = 'es'; break; }
      }
    }

    response.cookies.set('NEXT_LOCALE', locale, {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
    });
  }

  // ── 2. Rate limiting (Edge-level, no DB) ─────────────────────────────────
  if (RATE_LIMIT_PATHS.some(p => pathname.startsWith(p))) {
    const ip = getClientIp(request);
    const rateLimitKey = `rl:${ip}:${pathname.split('/')[2] || 'api'}`;

    // Use Vercel Edge Config or KV for rate limits
    // Simplified implementation using response headers for tracking
    // Production: use Upstash Redis REST API from Edge (no TCP, just HTTP)
    const rateLimitHeaders = {
      'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
      'X-RateLimit-Window': String(RATE_LIMIT_WINDOW),
    };

    Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
  }

  // ── 3. Security headers ───────────────────────────────────────────────────
  const securityHeaders: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-DNS-Prefetch-Control': 'on',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };

  // Cache-Control for dashboard API responses
  if (pathname.startsWith('/api/trpc')) {
    // tRPC dashboard queries: 5min CDN cache, 1min stale-while-revalidate
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=60, stale-if-error=86400'
    );
    // Compressed responses (Vercel auto-gzip, but hint for proxies)
    response.headers.set('Vary', 'Accept-Encoding, Authorization');
  }

  Object.entries(securityHeaders).forEach(([k, v]) => response.headers.set(k, v));

  return response;
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||      // Cloudflare
    req.headers.get('x-real-ip') ||             // Nginx
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  );
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon|manifest|sw\\.js|workbox|worker|icon).*)',
  ],
};
