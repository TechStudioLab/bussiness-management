import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { ja, type MessageKey } from './ja';

// UI language (Japanese / English). The choice is kept in this browser
// (localStorage "tsl.lang"); the first visit follows the browser language.
// index.html sets <html lang> before the first paint, so the start value is read from there.

export type Locale = 'ja' | 'en';
export type { MessageKey };

export const locales: { key: Locale; label: string; short: string }[] = [
  { key: 'ja', label: '日本語', short: 'JA' },
  { key: 'en', label: 'English', short: 'EN' }
];

const STORAGE = 'tsl.lang';
const dicts: Record<Locale, Record<string, string>> = { ja, en };

let current: Locale = document.documentElement.lang === 'en' ? 'en' : 'ja';

export const getLocale = () => current;
export const intlLocale = () => (current === 'ja' ? 'ja-JP' : 'en-US');

type Vars = Record<string, string | number>;

// "{count}" picks the "_one" variant when count is 1 (English plurals)
const lookup = (key: MessageKey, count?: unknown): string => {
  const d = dicts[current];
  if (count === 1 && d[`${key}_one`]) return d[`${key}_one`];
  return d[key] ?? ja[key] ?? key;
};

/** Translated text; "{name}" placeholders are filled from vars. */
export const t = (key: MessageKey, vars?: Vars): string => {
  const s = lookup(key, vars?.count);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
};

/** Like t(), but placeholders may be elements (links, bold numbers). */
export const tx = (key: MessageKey, vars: Record<string, ReactNode>): ReactNode =>
  lookup(key, vars.count)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part, i) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      return <Fragment key={i}>{name && name in vars ? vars[name] : part}</Fragment>;
    });

const Ctx = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({ locale: current, setLocale: () => undefined });

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setState] = useState<Locale>(current);
  const setLocale = useCallback((l: Locale) => {
    current = l;
    document.documentElement.lang = l;
    try {
      localStorage.setItem(STORAGE, l);
    } catch {
      // private mode: the choice lasts for this visit only
    }
    setState(l);
  }, []);
  useEffect(() => {
    document.title = t('app.title');
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

/** Components that show text call this, so they re-render when the language changes. */
export const useI18n = () => {
  const { locale, setLocale } = useContext(Ctx);
  return { locale, setLocale, t, tx };
};
