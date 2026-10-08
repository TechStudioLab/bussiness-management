import { detectPlatform, findNoSales, hasAppLink, isContactLink } from './classify';

// What a site check reads from a page's HTML (regex only, so it runs anywhere)

export interface PageFacts {
  title: string;
  description: string;
  platform: string;
  hasApp: boolean;
  contactUrl: string;
  emails: string[];
  phones: string[];
  noSales: string;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const meta = (html: string, name: string) => {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0] ?? '';
  return decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '').trim();
};

// Visible text, without scripts, styles and comments
export const pageText = (html: string) =>
  stripTags(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<noscript[\s\S]*?<\/noscript>/gi, ' '));

const ignoredMail = /\.(png|jpe?g|gif|webp|svg)$|example\.|sentry|wixpress|@sentry|@domain|@email\.com|@xxx/i;

export const extractFacts = (html: string, baseUrl: string): PageFacts => {
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 200);
  const description = (meta(html, 'description') || meta(html, 'og:description')).slice(0, 300);
  const base = new URL(baseUrl);

  let contactUrl = '';
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decode(m[1].trim());
    const text = stripTags(m[2]);
    if (/^mailto:/i.test(href)) {
      const addr = decodeURIComponent(href.slice(7).split('?')[0]).trim().toLowerCase();
      if (addr.includes('@') && !ignoredMail.test(addr)) emails.add(addr);
      continue;
    }
    if (/^tel:/i.test(href)) {
      phones.add(href.slice(4).replace(/[^\d+\-]/g, ''));
      continue;
    }
    if (contactUrl || !isContactLink(href, text)) continue;
    try {
      const u = new URL(href, base);
      // Contact pages on the same site only (not a social profile or a map)
      if (/^https?:$/.test(u.protocol) && u.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '')) contactUrl = u.toString();
    } catch {
      // ignore broken links
    }
  }

  const text = pageText(html);
  // Addresses written as text (info@example.co.jp, info＠example.co.jp)
  for (const m of text.normalize('NFKC').matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const addr = m[0].toLowerCase();
    if (!ignoredMail.test(addr)) emails.add(addr);
  }

  return {
    title,
    description,
    platform: detectPlatform(html),
    hasApp: hasAppLink(html),
    contactUrl,
    emails: [...emails].slice(0, 5),
    phones: [...phones].filter(p => p.replace(/\D/g, '').length >= 9).slice(0, 3),
    noSales: findNoSales(text)
  };
};
