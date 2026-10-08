import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// Light / dark / follow the system. Kept in this browser (localStorage "tsl.theme");
// index.html applies it before the first paint. Colors live in src/index.css.

export type ThemePref = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

const STORAGE = 'tsl.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

const readPref = (): ThemePref => {
  try {
    const v = localStorage.getItem(STORAGE);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};
const resolve = (p: ThemePref): Resolved => (p === 'system' ? (media().matches ? 'dark' : 'light') : p);

const Ctx = createContext<{ pref: ThemePref; resolved: Resolved; setPref: (p: ThemePref) => void }>({
  pref: 'system',
  resolved: 'light',
  setPref: () => undefined
});

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [resolved, setResolved] = useState<Resolved>(() => resolve(readPref()));

  useEffect(() => {
    const apply = () => {
      const r = resolve(pref);
      document.documentElement.dataset.theme = r;
      setResolved(r);
    };
    apply();
    if (pref !== 'system') return;
    const m = media();
    m.addEventListener('change', apply);
    return () => m.removeEventListener('change', apply);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    try {
      localStorage.setItem(STORAGE, p);
    } catch {
      // private mode: the choice lasts for this visit only
    }
    setPrefState(p);
  }, []);

  const value = useMemo(() => ({ pref, resolved, setPref }), [pref, resolved, setPref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useTheme = () => useContext(Ctx);

// Recharts takes plain colors, not CSS variables
export const chartColors = (theme: Resolved) =>
  theme === 'dark'
    ? { grid: '#232731', axis: '#2c313d', text: '#888f9c', bar: '#e8344e', line: '#eceef2', tooltipBg: '#15181f', tooltipBorder: '#2c313d', tooltipText: '#eceef2' }
    : { grid: '#eceef2', axis: '#e1e4ea', text: '#6b7280', bar: '#c8102e', line: '#111827', tooltipBg: '#ffffff', tooltipBorder: '#e1e4ea', tooltipText: '#111827' };
