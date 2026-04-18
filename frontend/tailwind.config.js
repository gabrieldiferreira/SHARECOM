/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Semantic / Functional Colors */
        fn: {
          income: '#10B981',
          expense: '#EF4444',
          balance: '#3B82F6',
          alert: '#F59E0B',
          structural: '#6B7280',
        },
        cat: {
          1: '#8B5CF6',
          2: '#3B82F6',
          3: '#F59E0B',
          4: '#EC4899',
          5: '#14B8A6',
          6: '#6B7280',
        },
        /* Light/Dark adaptive via CSS variables */
        ds: {
          'text-primary': 'var(--text-primary)',
          'text-secondary': 'var(--text-secondary)',
          'text-tertiary': 'var(--text-tertiary)',
          'bg-primary': 'var(--bg-primary)',
          'bg-secondary': 'var(--bg-secondary)',
          'bg-tertiary': 'var(--bg-tertiary)',
          'border': 'var(--ds-border)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'var(--font-inter)', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderWidth: {
        'thin': '0.5px',
      },
      fontSize: {
        'val-lg': ['28px', { lineHeight: '1.2', fontWeight: '500' }],
        'val-md': ['22px', { lineHeight: '1.2', fontWeight: '500' }],
        'val-sm': ['14px', { lineHeight: '1.4', fontWeight: '500' }],
        'label': ['12px', { lineHeight: '1.4', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
};
