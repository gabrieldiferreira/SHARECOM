'use client';

import { useI18n } from '@/i18n/client';
import type { Locale } from '@/i18n/request';

const LOCALE_LABELS: Record<Locale, { flag: string; label: string; nativeLabel: string }> = {
  'pt-BR': { flag: '🇧🇷', label: 'Português', nativeLabel: 'PT-BR' },
  'en':    { flag: '🇺🇸', label: 'English',   nativeLabel: 'EN' },
  'es':    { flag: '🇪🇸', label: 'Español',   nativeLabel: 'ES' },
};

interface LanguageSwitcherProps {
  compact?: boolean; // If true, shows flag + code only (for header)
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="space-y-3">
      {!compact && (
        <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider">
          {t('common.language')}
        </p>
      )}
      <div className={compact ? 'flex gap-1' : 'grid grid-cols-3 gap-2'}>
        {(Object.keys(LOCALE_LABELS) as Locale[]).map(l => {
          const { flag, label, nativeLabel } = LOCALE_LABELS[l];
          const isActive = locale === l;

          if (compact) {
            return (
              <button
                key={l}
                onClick={() => setLocale(l)}
                aria-label={`Switch to ${label}`}
                aria-pressed={isActive}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  isActive
                    ? 'bg-brand-purple text-white'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-glass-highlight'
                }`}
              >
                {flag} {nativeLabel}
              </button>
            );
          }

          return (
            <button
              key={l}
              onClick={() => setLocale(l)}
              aria-label={`Switch to ${label}`}
              aria-pressed={isActive}
              className={`p-3 rounded-[12px] border-thin flex flex-col items-center gap-1.5 transition-all ${
                isActive
                  ? 'bg-brand-purple/20 border-brand-purple text-text-primary shadow-glow'
                  : 'bg-glass-highlight border-glass-border text-text-secondary hover:bg-white/[0.07] hover:border-white/10'
              }`}
            >
              <span className="text-[20px]">{flag}</span>
              <span className="text-[11px] font-bold">{nativeLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
