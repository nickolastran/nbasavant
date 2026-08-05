import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
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
        cold: '#325aa8',
        hot: '#c8102e',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
