'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

interface ThemeToggleProps {
  /** compact: icon only (for header), full: shows label + 3-way (for settings) */
  variant?: 'compact' | 'full';
}

export function ThemeToggle({ variant = 'compact' }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid SSR hydration mismatch — render null until client
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="w-9 h-9 rounded-xl skeleton" aria-hidden />;
  }

  const isDark = resolvedTheme === 'dark';

  // ── Compact: icon toggle ───────────────────────────────────────────────────
  if (variant === 'compact') {
    return (
      <button
        id="theme-toggle"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-pressed={!isDark}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`
          relative p-2 rounded-xl border border-glass-border
          transition-all duration-200 group
          bg-ds-bg-secondary hover:bg-ds-bg-tertiary
          hover:border-ds-accent-purple/40 hover:shadow-glow
        `}
      >
        {/* Moon icon — visible in dark mode */}
        <Moon
          size={18}
          className={`
            absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            text-ds-accent-purple transition-all duration-300
            ${isDark ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-75 -rotate-90'}
          `}
        />
        {/* Sun icon — visible in light mode */}
        <Sun
          size={18}
          className={`
            absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            text-ds-accent-orange transition-all duration-300
            ${!isDark ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-75 rotate-90'}
          `}
        />
        {/* Reserve space */}
        <div className="w-[18px] h-[18px] opacity-0" aria-hidden />

        {/* Screen reader live region */}
        <span className="sr-only" aria-live="polite">
          {isDark ? 'Dark mode active' : 'Light mode active'}
        </span>
      </button>
    );
  }

  // ── Full: 3-way selector (dark / system / light) ──────────────────────────
  const options = [
    { value: 'dark',   label: 'Dark',   icon: <Moon size={14} /> },
    { value: 'system', label: 'System', icon: <Monitor size={14} /> },
    { value: 'light',  label: 'Light',  icon: <Sun size={14} /> },
  ] as const;

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold text-ds-text-muted uppercase tracking-wider">
        Aparência
      </p>
      <div className="grid grid-cols-3 gap-2">
        {options.map(opt => {
          const isActive = theme === opt.value;
          return (
            <button
              key={opt.value}
              id={`theme-option-${opt.value}`}
              onClick={() => setTheme(opt.value)}
              aria-pressed={isActive}
              aria-label={`Set ${opt.label} mode`}
              className={`
                p-3 rounded-[12px] border flex flex-col items-center gap-1.5
                text-[11px] font-bold transition-all duration-200
                ${isActive
                  ? 'bg-ds-accent-purple/20 border-ds-accent-purple text-ds-text-primary shadow-glow'
                  : 'bg-glass-highlight border-glass-border text-ds-text-secondary hover:bg-ds-bg-tertiary hover:border-ds-border'
                }
              `}
            >
              {opt.icon}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
