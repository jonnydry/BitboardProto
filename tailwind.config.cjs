/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
    './hooks/**/*.{ts,tsx,js,jsx}',
    './services/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Fira Code"', 'monospace'],
        terminal: ['"VT323"', 'monospace'],
      },
      colors: {
        terminal: {
          bg: 'rgb(var(--color-terminal-bg) / <alpha-value>)',
          text: 'rgb(var(--color-terminal-text) / <alpha-value>)',
          dim: 'rgb(var(--color-terminal-dim) / <alpha-value>)',
          alert: 'rgb(var(--color-terminal-alert) / <alpha-value>)',
          highlight: 'rgb(var(--color-terminal-highlight) / <alpha-value>)',
        },
      },
      boxShadow: {
        glow: 'var(--shadow-glow)',
        hard: '4px 4px 0px 0px rgb(var(--color-terminal-text) / 0.2)',
        'hard-lg': '8px 8px 0px 0px rgb(var(--color-terminal-text) / 0.15)',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        cursor: 'cursor .75s step-end infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        cursor: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(5px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
