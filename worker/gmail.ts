import { parseAddresses } from '../shared/domain';
import { classifyIncoming } from '../shared/mail';
import type { MessageKind } from '../shared/types';
import type { Env } from './env';
import { findSiteFor, ownMatcher } from './match';
import { getSettings, logActivity, recountSite } from './store';
import { decrypt, nowIso } from './util';

// Gmail sync (read-only). docs/DESIGN.md §3
// Each run: refresh the access token, queue new message ids (first run: last 90
// days; afterwards history.list), then read queued headers within the budget of
// outgoing requests per invocation.

export class Budget {
  used = 0;
  constructor(public limit: number) {}
  take() {
    if (this.used >= this.limit) return false;
    this.used++;
    return true;
  }
  get left() {
    return this.limit - this.used;
  }
}

export const budgetFor = (env: Env) => new Budget(Number(env.SUBREQUEST_BUDGET ?? 45) || 45);

interface MailboxRow {
  id: number;
  email: string;
  refresh_token: string;
  history_id: string | null;
}

class GmailError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const api = (env: Env) => `${env.GMAIL_API_BASE ?? 'https://gmail.googleapis.com'}/gmail/v1/users/me`;
const tokenUrl = (env: Env) => (env.GOOGLE_OAUTH_BASE ? `${env.GOOGLE_OAUTH_BASE}/token` : 'https://oauth2.googleapis.com/token');

const accessToken = async (env: Env, mb: MailboxRow, budget: Budget) => {
  if (!budget.take()) throw new GmailError(0, 'budget');
  const res = await fetch(tokenUrl(env), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: await decrypt(env.TOKEN_KEY, mb.refresh_token),
      grant_type: 'refresh_token'
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GmailError(res.status, /invalid_grant/.test(body) ? 'Googleとの接続が切れました。設定から再接続してください。' : `token ${res.status}`);
  }
  return ((await res.json()) as { access_token: string }).access_token;
};

const getJson = async <T>(env: Env, token: string, path: string, budget: Budget): Promise<T> => {
  if (!budget.take()) throw new GmailError(0, 'budget');
  const res = await fetch(`${api(env)}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new GmailError(res.status, `gmail ${res.status} ${path.split('?')[0]}`);
  return res.json() as Promise<T>;
};

const queueIds = async (env: Env, mailboxId: number, ids: string[]) => {
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    await env.DB.batch(chunk.map(id => env.DB.prepare('insert or ignore into sync_queue (mailbox_id, message_id) values (?, ?)').bind(mailboxId, id)));
  }
};

const BACKFILL_QUERY = 'newer_than:90d {in:inbox in:sent} -in:chats';

// Find new message ids and queue them
const discover = async (env: Env, mb: MailboxRow, token: string, budget: Budget) => {
  if (!mb.history_id) {
    const profile = await getJson<{ historyId: string }>(env, token, '/profile', budget);
    let pageToken = '';
    for (let page = 0; page < 5 && budget.left > 5; page++) {
      const q = new URLSearchParams({ q: BACKFILL_QUERY, maxResults: '500' });
      if (pageToken) q.set('pageToken', pageToken);
      const list = await getJson<{ messages?: { id: string }[]; nextPageToken?: string }>(env, token, `/messages?${q}`, budget);
      await queueIds(env, mb.id, (list.messages ?? []).map(m => m.id));
      if (!list.nextPageToken) break;
      pageToken = list.nextPageToken;
    }
    await env.DB.prepare('update mailboxes set history_id = ? where id = ?').bind(profile.historyId, mb.id).run();
    return;
  }
  let pageToken = '';
  let latest = mb.history_id;
  for (let page = 0; page < 5 && budget.left > 5; page++) {
    const q = new URLSearchParams({ startHistoryId: mb.history_id, historyTypes: 'messageAdded', maxResults: '500' });
    if (pageToken) q.set('pageToken', pageToken);
    let res: { history?: { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[]; historyId?: string; nextPageToken?: string };
    try {
      res = await getJson(env, token, `/history?${q}`, budget);
    } catch (e) {
      // The history id expired (about a week without sync): start over from recent mail
      if (e instanceof GmailError && e.status === 404) {
        await env.DB.prepare('update mailboxes set history_id = null where id = ?').bind(mb.id).run();
        return;
      }
      throw e;
    }
    const ids = (res.history ?? [])
      .flatMap(h => h.messagesAdded ?? [])
      .filter(m => !(m.message.labelIds ?? []).some(l => ['DRAFT', 'SPAM', 'TRASH', 'CHAT'].includes(l)))
      .map(m => m.message.id);
    await queueIds(env, mb.id, ids);
    if (res.historyId) latest = res.historyId;
    if (!res.nextPageToken) break;
    pageToken = res.nextPageToken;
  }
  await env.DB.prepare('update mailboxes set history_id = ? where id = ?').bind(latest, mb.id).run();
};

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

const HEADERS = ['From', 'To', 'Cc', 'Subject', 'Auto-Submitted', 'Precedence', 'X-Autoreply', 'X-Autorespond', 'X-Auto-Response-Suppress'];

const decodeEntities = (s: string) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Read queued messages and link them to sites
const readQueued = async (env: Env, mb: MailboxRow, token: string, budget: Budget, isOwn: (a: string) => boolean) => {
  const limit = Math.max(0, budget.left);
  if (!limit) return 0;
  const queued = await env.DB.prepare('select message_id from sync_queue where mailbox_id = ? limit ?').bind(mb.id, limit).all<{ message_id: string }>();
  const touched = new Set<number>();
  let read = 0;
  for (const { message_id } of queued.results) {
    const done = env.DB.prepare('delete from sync_queue where mailbox_id = ? and message_id = ?').bind(mb.id, message_id);
    // Already stored (e.g. the same mail seen through another mailbox)
    if (await env.DB.prepare('select 1 from messages where id = ?').bind(message_id).first()) {
      await done.run();
      continue;
    }
    let m: GmailMessage;
    try {
      const q = HEADERS.map(h => `metadataHeaders=${encodeURIComponent(h)}`).join('&');
      m = await getJson<GmailMessage>(env, token, `/messages/${message_id}?format=metadata&${q}`, budget);
    } catch (e) {
      if (e instanceof GmailError && (e.status === 404 || e.status === 400)) {
        await done.run();
        continue;
      }
      throw e;
    }
    read++;
    const labels = m.labelIds ?? [];
    if (labels.some(l => ['DRAFT', 'SPAM', 'TRASH', 'CHAT'].includes(l))) {
      await done.run();
      continue;
    }
    const h = (name: string) => m.payload?.headers?.find(x => x.name.toLowerCase() === name.toLowerCase())?.value ?? '';
    const direction: 'out' | 'in' = labels.includes('SENT') ? 'out' : 'in';
    const from = h('From');
    const to = [h('To'), h('Cc')].filter(Boolean).join(', ');
    const others = (direction === 'out' ? parseAddresses(to) : parseAddresses(from)).filter(a => !isOwn(a));
    if (!others.length) {
      // Mail between our own addresses
      await done.run();
      continue;
    }
    const subject = h('Subject');
    const kind: MessageKind =
      direction === 'out'
        ? 'sent'
        : classifyIncoming({
            from,
            subject,
            autoSubmitted: h('Auto-Submitted'),
            precedence: h('Precedence'),
            xAutoreply: h('X-Autoreply') || h('X-Autorespond'),
            xAutoResponse: h('X-Auto-Response-Suppress')
          });
    const siteId = await findSiteFor(env, m.threadId, others);
    const sentAt = m.internalDate ? new Date(Number(m.internalDate)).toISOString().replace(/\.\d{3}Z$/, 'Z') : nowIso();
    const insert = env.DB.prepare(
      `insert or ignore into messages (id, thread_id, mailbox_id, site_id, direction, kind, from_addr, to_addr, subject, snippet, sent_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(m.id, m.threadId, mb.id, siteId, direction, kind, from.slice(0, 300), to.slice(0, 500), subject.slice(0, 300), decodeEntities(m.snippet ?? '').slice(0, 300), sentAt);
    const stmts = [insert, done];
    if (siteId) {
      const type = kind === 'sent' ? 'email_sent' : kind === 'reply' ? 'reply' : kind === 'auto' ? 'auto_reply' : 'bounce';
      stmts.push(logActivity(env, siteId, type, { subject, from, to, messageId: m.id }, direction === 'out' ? mb.email : null, sentAt));
      touched.add(siteId);
    }
    await env.DB.batch(stmts);
  }
  for (const id of touched) await recountSite(env, id);
  return read;
};

export const syncMailbox = async (env: Env, mailboxId: number, budget: Budget) => {
  const mb = await env.DB.prepare('select id, email, refresh_token, history_id from mailboxes where id = ?').bind(mailboxId).first<MailboxRow>();
  if (!mb) return { read: 0, queued: 0, error: 'not found' };
  const settings = await getSettings(env);
  const mailboxes = await env.DB.prepare('select email from mailboxes').all<{ email: string }>();
  const isOwn = ownMatcher(settings.ownDomains, mailboxes.results.map(r => r.email));
  let read = 0;
  let error: string | null = null;
  try {
    const token = await accessToken(env, mb, budget);
    await discover(env, mb, token, budget);
    read = await readQueued(env, mb, token, budget, isOwn);
  } catch (e) {
    if (!(e instanceof GmailError && e.message === 'budget')) error = (e as Error).message;
  }
  await env.DB.prepare('update mailboxes set last_sync_at = ?, last_error = ? where id = ?').bind(nowIso(), error, mb.id).run();
  const left = await env.DB.prepare('select count(*) as n from sync_queue where mailbox_id = ?').bind(mb.id).first<{ n: number }>();
  return { read, queued: left?.n ?? 0, error };
};

export const syncAll = async (env: Env, budget: Budget) => {
  const rows = await env.DB.prepare('select id from mailboxes order by last_sync_at is not null, last_sync_at').all<{ id: number }>();
  for (const { id } of rows.results) {
    if (budget.left < 3) break;
    await syncMailbox(env, id, budget);
  }
};

// Try again to link mail that arrived before its site was imported
export const rematchUnlinked = async (env: Env) => {
  const settings = await getSettings(env);
  const mailboxes = await env.DB.prepare('select email from mailboxes').all<{ email: string }>();
  const isOwn = ownMatcher(settings.ownDomains, mailboxes.results.map(r => r.email));
  const rows = await env.DB.prepare(
    'select id, thread_id, direction, kind, from_addr, to_addr, subject, sent_at from messages where site_id is null order by sent_at limit 500'
  ).all<{ id: string; thread_id: string; direction: 'out' | 'in'; kind: MessageKind; from_addr: string; to_addr: string; subject: string; sent_at: string }>();
  const touched = new Set<number>();
  for (const m of rows.results) {
    const others = (m.direction === 'out' ? parseAddresses(m.to_addr) : parseAddresses(m.from_addr)).filter(a => !isOwn(a));
    const siteId = await findSiteFor(env, m.thread_id, others);
    if (!siteId) continue;
    const type = m.kind === 'sent' ? 'email_sent' : m.kind === 'reply' ? 'reply' : m.kind === 'auto' ? 'auto_reply' : 'bounce';
    await env.DB.batch([
      env.DB.prepare('update messages set site_id = ? where id = ?').bind(siteId, m.id),
      logActivity(env, siteId, type, { subject: m.subject, from: m.from_addr, to: m.to_addr, messageId: m.id }, null, m.sent_at)
    ]);
    touched.add(siteId);
  }
  for (const id of touched) await recountSite(env, id);
  return touched.size;
};
