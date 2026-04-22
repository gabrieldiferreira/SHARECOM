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
        // New unified color system
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
        },
        card: 'var(--card)',
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        border: 'var(--border)',
        accent: {
          purple: 'var(--accent-purple)',
          pink: 'var(--accent-pink)',
          orange: 'var(--accent-orange)',
          cyan: 'var(--accent-cyan)',
        },
        success: 'var(--success)',
        error: 'var(--error)',
        
        // Legacy ds-* aliases (for backward compatibility)
        ds: {
          bg: {
            primary: 'var(--ds-bg-primary)',
            secondary: 'var(--ds-bg-secondary)',
            tertiary: 'var(--ds-bg-tertiary)',
          },
          text: {
            primary: 'var(--ds-text-primary)',
            secondary: 'var(--ds-text-secondary)',
            muted: 'var(--ds-text-muted)',
          },
          border: 'var(--ds-border)',
          accent: {
            purple: 'var(--ds-accent-purple)',
            pink: 'var(--ds-accent-pink)',
            orange: 'var(--ds-accent-orange)',
            cyan: 'var(--ds-accent-cyan)',
            green: '#10B981',
            red: '#EF4444',
          },
        },
        // Brand aliases
        brand: {
          bg: 'var(--bg-primary)',
          purple: 'var(--accent-purple)',
          pink: 'var(--accent-pink)',
          orange: 'var(--accent-orange)',
          cyan: 'var(--accent-cyan)',
          green: 'var(--success)',
          red: 'var(--error)',
        },
        // Glass tokens
        glass: {
          card: 'var(--glass-bg)',
          border: 'var(--glass-border)',
          highlight: 'var(--glass-highlight)',
        },
        // Semantic tokens
        'fn-income': 'var(--success)',
        'fn-expense': 'var(--error)',
        'fn-balance': 'var(--accent-purple)',
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
        // Light mode shadows - warm neutral
        card: '0 4px 24px rgba(28, 25, 23, 0.1), 0 1px 4px rgba(28, 25, 23, 0.06)',
        'card-lg': '0 8px 32px rgba(28, 25, 23, 0.12), 0 2px 8px rgba(28, 25, 23, 0.08)',
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
      screens: {
        'xs': '375px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
        'tablet-landscape': {'raw': '(min-width: 768px) and (orientation: landscape)'},
        'mobile-landscape': {'raw': '(max-width: 767px) and (orientation: landscape)'},
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '1.5rem',
          lg: '2rem',
          xl: '3rem',
        },
      },
      transitionProperty: {
        'theme': 'background-color, color, border-color, box-shadow',
      },
      transitionDuration: {
        theme: '200ms',
      },
    },
  },
  plugins: [
    require('@tailwindcss/container-queries'),
  ],
};
