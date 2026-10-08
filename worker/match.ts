import { addressDomain, domainCandidates, freeMailDomains } from '../shared/domain';
import type { Env } from './env';

// Which site does a mail belong to? (docs/DESIGN.md §3)
// 1. the thread is already linked  2. a known address  3. the domain

export const findSiteFor = async (env: Env, threadId: string, addresses: string[]): Promise<number | null> => {
  if (threadId) {
    const t = await env.DB.prepare('select site_id from messages where thread_id = ? and site_id is not null limit 1')
      .bind(threadId)
      .first<{ site_id: number }>();
    if (t) return t.site_id;
  }
  if (!addresses.length) return null;

  const marks = addresses.map(() => '?').join(',');
  const known = await env.DB.prepare(
    `select site_id from site_addresses where address in (${marks})
     union all select id from sites where contact_email in (${marks}) limit 1`
  )
    .bind(...addresses, ...addresses)
    .first<{ site_id: number }>();
  if (known) return known.site_id;

  for (const address of addresses) {
    const domain = addressDomain(address);
    if (!domain || freeMailDomains.has(domain)) continue;
    const cands = domainCandidates(domain);
    if (!cands.length) continue;
    // Exact or parent domain (mail.example.co.jp → example.co.jp), or a site on a
    // subdomain of the mail domain (example.co.jp → shop.example.co.jp)
    const row = await env.DB.prepare(
      `select id from sites where domain in (${cands.map(() => '?').join(',')}) or domain like ?
       order by length(domain) desc limit 1`
    )
      .bind(...cands, `%.${domain}`)
      .first<{ id: number }>();
    if (row) return row.id;
  }
  return null;
};

// Our own addresses never count as the other side
export const ownMatcher = (ownDomains: string[], mailboxEmails: string[]) => {
  const domains = ownDomains.map(d => d.toLowerCase());
  const emails = new Set(mailboxEmails.map(e => e.toLowerCase()));
  return (address: string) => {
    const d = addressDomain(address);
    return emails.has(address) || domains.some(own => d === own || d.endsWith(`.${own}`));
  };
};
