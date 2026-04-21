'use client';

import { ThemeProvider } from 'next-themes';
import { useEffect } from 'react';

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  // Dev-only: unregister any service workers when running on localhost to avoid stale cached bundles
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
    if (!isLocalhost) return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => {
          try {
            reg.unregister().then(() => {
              console.debug('Dev: unregistered service worker', reg);
            }).catch((e) => console.debug('Dev: failed to unregister SW', e));
          } catch (e) {
            console.debug('Dev: error during SW unregister', e);
          }
        });
      }).catch((e) => console.debug('Dev: error getting SW registrations', e));
    }

    if (typeof caches !== 'undefined') {
      caches.keys?.().then(keys => {
        keys.forEach(k => caches.delete(k));
      }).catch(() => {});
    }
  }, []);

  return (
    <ThemeProvider
      attribute="class"       // adds .dark / .light to <html>
      defaultTheme="dark"     // Finwave aesthetic default
      enableSystem            // respect OS preference on first visit
      disableTransitionOnChange={false}
    >
      {children}
    </ThemeProvider>
  );
}
