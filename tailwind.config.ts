import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f4f9',
          100: '#dbe4f0',
          700: '#173a5e',
          800: '#0f2a47',
          900: '#08182b',
          950: '#040d17',
        },
        // Savant-style shooting scale: cold blue -> neutral -> hot red
        cold: 'var(--cold)',
        hot: 'var(--hot)',
        // Tokens from globals.css, so utilities follow the theme and the mode.
        surface: 'var(--surface)',
        panel: { DEFAULT: 'var(--panel)', 2: 'var(--panel-2)' },
        line: { DEFAULT: 'var(--line)', 2: 'var(--line-2)' },
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        accent: 'var(--accent)',
        pos: 'var(--pos)',
        neg: 'var(--neg)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
      },
      borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)' },
      boxShadow: { 1: 'var(--elev-1)', 2: 'var(--elev-2)', 3: 'var(--elev-3)' },
      transitionDuration: { fast: '120ms', base: '220ms', slow: '480ms' },
      transitionTimingFunction: { out: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
    },
  },
  plugins: [],
} satisfies Config;
