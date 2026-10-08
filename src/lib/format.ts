import { intlLocale, t } from '@/i18n';

// Dates in Japan time, numbers with separators, in the current UI language

const tz = 'Asia/Tokyo';
const cache = new Map<string, Intl.DateTimeFormat>();
const fmt = (kind: 'dateTime' | 'date' | 'day') => {
  const loc = intlLocale();
  const id = `${loc}:${kind}`;
  let f = cache.get(id);
  if (!f) {
    f =
      kind === 'dateTime'
        ? new Intl.DateTimeFormat(loc, { timeZone: tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
        : kind === 'date'
          ? new Intl.DateTimeFormat(loc, { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' })
          : new Intl.DateTimeFormat(loc, { timeZone: 'UTC', month: 'numeric', day: 'numeric' });
    cache.set(id, f);
  }
  return f;
};

export const fmtDateTime = (iso: string | null | undefined) => (iso ? fmt('dateTime').format(new Date(iso)) : '—');
export const fmtDate = (iso: string | null | undefined) => (iso ? fmt('date').format(new Date(iso)) : '—');
// "2026-10-08" (a JST day from the API) → "10/8"
export const fmtDay = (day: string) => fmt('day').format(new Date(`${day}T00:00:00Z`));

export const fmtAgo = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('time.now');
  if (s < 3600) return t('time.min', { n: Math.floor(s / 60) });
  if (s < 86_400) return t('time.hour', { n: Math.floor(s / 3600) });
  if (s < 86_400 * 7) return t('time.day', { n: Math.floor(s / 86_400) });
  return fmtDate(iso);
};

export const fmtNum = (n: number | null | undefined) => (n ?? 0).toLocaleString(intlLocale());
export const fmtYen = (n: number | null | undefined) => `¥${(n ?? 0).toLocaleString(intlLocale())}`;
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// "山田 <a@b.jp>" → "山田", or the address
export const displayName = (header: string) => {
  const m = header.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>/);
  return m ? m[1].trim() : header.trim();
};
export const firstAddress = (header: string) => header.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? '';

export const gmailThreadUrl = (mailbox: string | undefined, threadId: string) =>
  `https://mail.google.com/mail/u/${encodeURIComponent(mailbox || '0')}/#all/${threadId}`;

export const gmailComposeUrl = (o: { mailbox?: string; to: string; subject: string; body: string }) => {
  const q = new URLSearchParams({ view: 'cm', fs: '1', to: o.to, su: o.subject, body: o.body });
  if (o.mailbox) q.set('authuser', o.mailbox);
  return `https://mail.google.com/mail/?${q}`;
};
