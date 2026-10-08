import type { Config } from 'tailwindcss';

// Colors are CSS variables (src/index.css) so light and dark themes share every class.
// Brand crimson is the techstudiolab.jp accent.
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;
const tone = (name: string) => ({ DEFAULT: v(name), soft: v(`${name}-soft`), line: v(`${name}-line`), solid: v(`${name}-solid`) });

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        surface: v('surface'),
        sidebar: v('sidebar'),
        paper: { DEFAULT: v('paper'), light: v('paper-light') },
        line: { DEFAULT: v('line'), soft: v('line-soft') },
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), muted: v('ink-muted') },
        inverse: { DEFAULT: v('inverse'), fg: v('inverse-fg') },
        crimson: { DEFAULT: v('crimson'), dark: v('crimson-dark'), soft: v('crimson-soft'), fg: v('crimson-fg') },
        info: tone('info'),
        warn: tone('warn'),
        success: tone('success'),
        danger: tone('danger'),
        violet: tone('violet'),
        orange: tone('orange')
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans JP"', '"Hiragino Sans"', '"Yu Gothic UI"', 'Meiryo', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.06), 0 1px 3px rgb(var(--shadow) / 0.04)',
        pop: '0 12px 32px -8px rgb(var(--shadow) / 0.25), 0 4px 8px -4px rgb(var(--shadow) / 0.12)'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } }
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out'
      }
    }
  },
  plugins: []
} satisfies Config;
