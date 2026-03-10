import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nebula: {
          bg: '#0a0e17',
          surface: '#111827',
          surface2: '#1a2235',
          border: '#2a3450',
          accent: '#6366f1',
          accent2: '#818cf8',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'flow': 'flow 2s linear infinite',
      },
      keyframes: {
        flow: {
          '0%': { strokeDashoffset: '24' },
          '100%': { strokeDashoffset: '0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
