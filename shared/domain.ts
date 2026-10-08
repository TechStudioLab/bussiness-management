// URLs, domains and e-mail addresses

// "example.co.jp", "https://www.example.co.jp/about" → a full URL, or '' when unusable
export const normalizeUrl = (raw: string): string => {
  const s = (raw ?? '').trim().replace(/[\s　]+/g, '');
  if (!s) return '';
  // mailto:, tel:, javascript: … are not web sites
  if (/^[a-z][a-z0-9+-]*:(?!\/\/|\d)/i.test(s) && !/^https?:/i.test(s)) return '';
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || u.username || u.password) return '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
};

// Host without "www." — the key that keeps one row per site
export const domainOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

// Mailboxes anyone can sign up for: a match on the domain alone means nothing
export const freeMailDomains = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.co.jp',
  'ymail.ne.jp',
  'yahoo.com',
  'outlook.com',
  'outlook.jp',
  'hotmail.com',
  'hotmail.co.jp',
  'live.jp',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'docomo.ne.jp',
  'ezweb.ne.jp',
  'au.com',
  'softbank.ne.jp',
  'i.softbank.jp',
  'nifty.com',
  'biglobe.ne.jp',
  'ocn.ne.jp',
  'so-net.ne.jp',
  'excite.co.jp',
  'zoho.com',
  'proton.me',
  'protonmail.com'
]);

export const addressDomain = (address: string) => address.split('@')[1]?.toLowerCase() ?? '';

// "山田 <info@example.co.jp>, b@x.jp" → ["info@example.co.jp", "b@x.jp"]
export const parseAddresses = (header: string): string[] => {
  const found = (header ?? '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  return [...new Set(found.map(a => a.toLowerCase()))];
};

// Does the mail domain belong to the site? info@example.co.jp ↔ example.co.jp,
// mail.example.co.jp ↔ example.co.jp, example.co.jp ↔ shop.example.co.jp
export const domainMatches = (mailDomain: string, siteDomain: string) => {
  const a = mailDomain.toLowerCase();
  const b = siteDomain.toLowerCase();
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
};

// Candidate site domains for a mail domain, longest first (for SQL lookups):
// mail.example.co.jp → [mail.example.co.jp, example.co.jp]; never a bare suffix like co.jp
export const domainCandidates = (mailDomain: string): string[] => {
  const parts = mailDomain.toLowerCase().split('.');
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join('.');
    if (isBareSuffix(d)) break;
    out.push(d);
  }
  return out;
};

const secondLevel = new Set(['co', 'ne', 'or', 'ac', 'go', 'ed', 'gr', 'lg', 'ad', 'com', 'net', 'org', 'gov', 'edu']);
const isBareSuffix = (d: string) => {
  const parts = d.split('.');
  if (parts.length === 1) return true;
  return parts.length === 2 && secondLevel.has(parts[0]) && parts[1].length === 2;
};

export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
