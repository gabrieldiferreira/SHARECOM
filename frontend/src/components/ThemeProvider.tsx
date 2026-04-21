'use client';

import { ThemeProvider } from 'next-themes';

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
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
