import { categoryFor, industryFromText } from '../shared/classify';
import { extractFacts, type PageFacts } from '../shared/extract';
import type { Site } from '../shared/types';
import type { Env } from './env';
import type { Budget } from './gmail';
import { logActivity } from './store';
import { nowIso } from './util';

// Site check: the top page, then the contact page when one is linked.
// At most 2 requests per site, 8 s each, first 400 KB. docs/DESIGN.md §6

const MAX_BYTES = 400_000;
const UA = 'Mozilla/5.0 (compatible; TechStudioLabBusiness/1.0; +https://techstudiolab.jp)';

const fetchPage = async (url: string) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ja,en;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (type && !/html|xml/i.test(type)) throw new Error('HTMLではありません');
  const reader = res.body?.getReader();
  if (!reader) return { url: res.url || url, html: '' };
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c.subarray(0, Math.min(c.length, size - at)), at);
    at += c.length;
  }
  // Older Japanese sites still use Shift_JIS / EUC-JP
  const head = new TextDecoder('ascii').decode(bytes.subarray(0, 2048));
  const charset = (type.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/charset=["']?([\w-]+)/i)?.[1] ?? 'utf-8').toLowerCase();
  let html: string;
  try {
    html = new TextDecoder(charset).decode(bytes);
  } catch {
    html = new TextDecoder('utf-8').decode(bytes);
  }
  return { url: res.url || url, html };
};

export const analyzeSite = async (env: Env, siteId: number, budget?: Budget) => {
  const site = await env.DB.prepare('select * from sites where id = ?').bind(siteId).first<Site>();
  if (!site) return null;
  const take = () => (budget ? budget.take() : true);

  let facts: PageFacts;
  let contactFacts: PageFacts | null = null;
  try {
    if (!take()) return null;
    const top = await fetchPage(site.url);
    facts = extractFacts(top.html, top.url);
    const contactUrl = site.contact_url || facts.contactUrl;
    if (contactUrl && contactUrl !== top.url && take()) {
      try {
        const page = await fetchPage(contactUrl);
        contactFacts = extractFacts(page.html, page.url);
      } catch {
        // The top page alone is still useful
      }
    }
  } catch (e) {
    const msg = (e as Error).name === 'TimeoutError' ? '応答がありません（8秒）' : (e as Error).message;
    await env.DB.prepare('update sites set analyzed_at = ?, analyze_error = ?, updated_at = ? where id = ?').bind(nowIso(), msg.slice(0, 200), nowIso(), siteId).run();
    return { id: siteId, error: msg };
  }

  const noSales = contactFacts?.noSales || facts.noSales;
  const platform = facts.platform || contactFacts?.platform || '';
  const hasApp = facts.hasApp || !!contactFacts?.hasApp;
  const industry =
    site.industry_source === 'auto' && (!site.industry || site.industry === 'その他')
      ? industryFromText(`${facts.title} ${facts.description}`) ?? 'その他'
      : site.industry;
  const category =
    site.category_source === 'auto'
      ? categoryFor({ industry, platform, hasApp, text: `${facts.title} ${facts.description}` })
      : site.category;
  const emails = [...(contactFacts?.emails ?? []), ...facts.emails];
  const phones = [...(contactFacts?.phones ?? []), ...facts.phones];

  // Nothing sent yet and the site refuses sales mail: stop here
  const suspend = !!noSales && site.status === 'new';
  const stmts = [
    env.DB.prepare(
      `update sites set title = ?, description = ?, platform = ?, has_app = ?, industry = ?, category = ?,
         contact_url = case when contact_url = '' then ? else contact_url end,
         contact_email = case when contact_email = '' then ? else contact_email end,
         phone = case when phone = '' then ? else phone end,
         no_sales = ?, no_sales_text = ?, status = ?, status_reason = ?,
         analyzed_at = ?, analyze_error = '', updated_at = ?
       where id = ?`
    ).bind(
      facts.title,
      facts.description,
      platform,
      hasApp ? 1 : 0,
      industry,
      category,
      site.contact_url || facts.contactUrl,
      emails[0] ?? '',
      phones[0] ?? '',
      noSales ? 1 : 0,
      noSales,
      suspend ? 'suspended' : site.status,
      suspend ? '営業お断りの表記があります' : site.status_reason,
      nowIso(),
      nowIso(),
      siteId
    )
  ];
  if (suspend) stmts.push(logActivity(env, siteId, 'status', { from: site.status, to: 'suspended', reason: '営業お断りの表記', text: noSales }, 'system'));
  await env.DB.batch(stmts);
  return { id: siteId, error: null };
};

// Cron: check sites that were never checked, oldest first
export const analyzePending = async (env: Env, budget: Budget) => {
  const rows = await env.DB.prepare('select id from sites where analyzed_at is null order by id limit 10').all<{ id: number }>();
  for (const { id } of rows.results) {
    if (budget.left < 2) break;
    await analyzeSite(env, id, budget);
  }
};
