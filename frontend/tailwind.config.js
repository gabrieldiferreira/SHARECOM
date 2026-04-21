/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // next-themes adds .dark / .light on <html> — use class strategy
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Design system tokens — all reference CSS variables
        // This ensures Tailwind classes auto-adapt to dark/light
        ds: {
          bg: {
            primary:   'var(--ds-bg-primary)',
            secondary: 'var(--ds-bg-secondary)',
            tertiary:  'var(--ds-bg-tertiary)',
          },
          text: {
            primary:   'var(--ds-text-primary)',
            secondary: 'var(--ds-text-secondary)',
            muted:     'var(--ds-text-muted)',
          },
          border:  'var(--ds-border)',
          accent: {
            purple: '#8B5CF6',
            pink:   '#EC4899',
            orange: '#FB923C',
            cyan:   '#06B6D4',
            green:  '#10B981',
            red:    '#EF4444',
          },
        },
        // Brand aliases (used in existing components)
        brand: {
          bg:     'var(--ds-bg-primary)',
          purple: '#8B5CF6',
          pink:   '#EC4899',
          orange: '#FB923C',
          cyan:   '#06B6D4',
          green:  '#10B981',
          red:    '#EF4444',
        },
        // Glass tokens
        glass: {
          card:      'var(--glass-bg)',
          border:    'var(--glass-border)',
          highlight: 'var(--glass-highlight)',
        },
        // Legacy ds-* aliases (keep existing page.tsx classes working)
        'ds-bg-primary':     'var(--ds-bg-primary)',
        'ds-bg-secondary':   'var(--ds-bg-secondary)',
        'ds-text-primary':   'var(--ds-text-primary)',
        'ds-text-secondary': 'var(--ds-text-secondary)',
        'ds-border':         'var(--ds-border)',
        'fn-income':         '#10B981',
        'fn-expense':        '#EF4444',
        'fn-balance':        '#8B5CF6',
        // New semantic tokens
        text: {
          primary:   'var(--ds-text-primary)',
          secondary: 'var(--ds-text-secondary)',
          tertiary:  'var(--ds-text-muted)',
        },
      },
      fontFamily: {
        sans: ['Inter', '"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        card:  '20px',
        btn:   '12px',
        input: '12px',
      },
      boxShadow: {
        glass:      '0 8px 32px rgba(0, 0, 0, 0.4)',
        'glass-lg': '0 12px 40px rgba(0, 0, 0, 0.5)',
        glow:       '0 0 20px rgba(139, 92, 246, 0.3)',
        'glow-lg':  '0 0 40px rgba(139, 92, 246, 0.45)',
        'glow-cyan':  '0 0 20px rgba(6, 182, 212, 0.3)',
        'glow-green': '0 0 20px rgba(16, 185, 129, 0.3)',
        'glow-pink':  '0 0 20px rgba(236, 72, 153, 0.3)',
        // Light mode shadows
        card: '0 4px 24px rgba(13, 13, 18, 0.10), 0 1px 4px rgba(13, 13, 18, 0.06)',
      },
      fontSize: {
        hero:    ['48px', { lineHeight: '1',   fontWeight: '900' }],
        'val-xl':['32px', { lineHeight: '1.2', fontWeight: '600' }],
        'val-lg':['28px', { lineHeight: '1.2', fontWeight: '500' }],
        'val-md':['22px', { lineHeight: '1.2', fontWeight: '500' }],
        label:   ['12px', { lineHeight: '1.4', fontWeight: '400' }],
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top':    'env(safe-area-inset-top)',
      },
      transitionProperty: {
        'theme': 'background-color, color, border-color, box-shadow',
      },
      transitionDuration: {
        theme: '200ms',
      },
    },
  },
  plugins: [],
};
