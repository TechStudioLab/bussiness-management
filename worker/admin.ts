import { Hono } from 'hono';
import { isValidEmail } from '../shared/domain';
import type { Activity, Mailbox, Member, Message, Settings, Template } from '../shared/types';
import { seedTemplates } from '../shared/templates';
import { requireOwner } from './auth';
import type { AppEnv, Env } from './env';
import { budgetFor, rematchUnlinked, syncMailbox } from './gmail';
import { getStats } from './stats';
import { getSettings, logActivity, recountSite, saveSettings } from './store';
import { clampInt, nowIso, parseJson } from './util';

// Everything under /api except /api/sites

export const admin = new Hono<AppEnv>();

admin.get('/me', c => c.json(c.get('me')));

admin.get('/stats', async c => c.json(await getStats(c.env, clampInt(c.req.query('days'), 7, 365, 30))));

// ── Team activity ───────────────────────────────────────────────────

admin.get('/activities', async c => {
  const q = c.req.query();
  const where: string[] = ["a.type not in ('analyzed')"];
  const args: unknown[] = [];
  if (q.actor) {
    where.push('a.actor = ?');
    args.push(q.actor);
  }
  if (q.type) {
    where.push(`a.type in (${q.type.split(',').map(() => '?').join(',')})`);
    args.push(...q.type.split(','));
  }
  if (q.before) {
    where.push('a.id < ?');
    args.push(Number(q.before));
  }
  const rows = await c.env.DB.prepare(
    `select a.*, s.company, s.domain from activities a left join sites s on s.id = a.site_id
     where ${where.join(' and ')} order by a.id desc limit 100`
  )
    .bind(...args)
    .all<Activity & { detail: string }>();
  return c.json(rows.results.map(a => ({ ...a, detail: parseJson(a.detail, {}) })));
});

// ── Mail ────────────────────────────────────────────────────────────

admin.get('/messages', async c => {
  const filter = c.req.query('filter') ?? 'unmatched';
  const where =
    filter === 'unmatched'
      ? "m.site_id is null and m.direction = 'in' and m.kind = 'reply'"
      : filter === 'replies'
        ? "m.site_id is not null and m.kind = 'reply'"
        : filter === 'auto'
          ? "m.kind in ('auto', 'bounce')"
          : filter === 'sent'
            ? "m.direction = 'out' and m.site_id is not null"
            : '1 = 1';
  const rows = await c.env.DB.prepare(
    `select m.*, s.company, s.domain, b.email as mailbox_email from messages m
     left join sites s on s.id = m.site_id left join mailboxes b on b.id = m.mailbox_id
     where ${where} order by m.sent_at desc limit 200`
  ).all<Message>();
  return c.json(rows.results);
});

// Link a mail (and its whole thread) to a site, and remember the sender
admin.post('/messages/:id/link', async c => {
  const { siteId, remember = true } = await c.req.json<{ siteId: number; remember?: boolean }>();
  const msg = await c.env.DB.prepare('select * from messages where id = ?').bind(c.req.param('id')).first<Message>();
  if (!msg) return c.json({ error: 'not found' }, 404);
  const site = await c.env.DB.prepare('select id from sites where id = ?').bind(siteId).first();
  if (!site) return c.json({ error: 'site not found' }, 404);
  const thread = await c.env.DB.prepare('select * from messages where thread_id = ?').bind(msg.thread_id).all<Message>();
  const previous = new Set(thread.results.map(m => m.site_id).filter((x): x is number => !!x));
  const stmts = [c.env.DB.prepare('update messages set site_id = ? where thread_id = ?').bind(siteId, msg.thread_id)];
  for (const m of thread.results) {
    if (m.site_id === siteId) continue;
    const type = m.kind === 'sent' ? 'email_sent' : m.kind === 'reply' ? 'reply' : m.kind === 'auto' ? 'auto_reply' : 'bounce';
    stmts.push(logActivity(c.env, siteId, type, { subject: m.subject, from: m.from_addr, to: m.to_addr, messageId: m.id }, null, m.sent_at));
  }
  const address = (msg.direction === 'in' ? msg.from_addr : msg.to_addr).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0]?.toLowerCase();
  if (remember && address) {
    stmts.push(c.env.DB.prepare('insert or replace into site_addresses (address, site_id) values (?, ?)').bind(address, siteId));
    stmts.push(logActivity(c.env, siteId, 'linked', { address }, c.get('me').email));
  }
  await c.env.DB.batch(stmts);
  for (const id of new Set([siteId, ...previous])) await recountSite(c.env, id);
  // Other mail from the same sender
  if (remember) await rematchUnlinked(c.env);
  return c.json({ ok: true });
});

admin.post('/messages/rematch', async c => c.json({ linked: await rematchUnlinked(c.env) }));

// ── Mailboxes ───────────────────────────────────────────────────────

const listMailboxes = async (env: Env) =>
  (
    await env.DB.prepare(
      `select b.id, b.email, b.connected_by, b.connected_at, b.last_sync_at, b.last_error,
         (select count(*) from sync_queue q where q.mailbox_id = b.id) as queued
       from mailboxes b order by b.id`
    ).all<Mailbox>()
  ).results;

admin.get('/mailboxes', async c => c.json(await listMailboxes(c.env)));

// One sync run; the screen repeats it while mail is still queued
admin.post('/mailboxes/:id/sync', async c => {
  const result = await syncMailbox(c.env, Number(c.req.param('id')), budgetFor(c.env));
  return c.json(result);
});

admin.delete('/mailboxes/:id', requireOwner, async c => {
  await c.env.DB.prepare('delete from mailboxes where id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// ── Members ─────────────────────────────────────────────────────────

admin.get('/members', async c => c.json((await c.env.DB.prepare('select * from members order by role desc, created_at').all<Member>()).results));

admin.post('/members', requireOwner, async c => {
  const { email, role } = await c.req.json<{ email: string; role: 'owner' | 'agent' }>();
  const e = (email ?? '').trim().toLowerCase();
  if (!isValidEmail(e)) return c.json({ error: 'メールアドレスが正しくありません' }, 400);
  await c.env.DB.prepare('insert into members (email, role) values (?, ?) on conflict (email) do update set role = excluded.role')
    .bind(e, role === 'owner' ? 'owner' : 'agent')
    .run();
  return c.json({ ok: true });
});

admin.delete('/members/:email', requireOwner, async c => {
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  if (email === c.get('me').email) return c.json({ error: '自分自身は削除できません' }, 400);
  await c.env.DB.prepare('delete from members where email = ?').bind(email).run();
  return c.json({ ok: true });
});

// ── Settings ────────────────────────────────────────────────────────

admin.get('/settings', async c => c.json(await getSettings(c.env)));

admin.put('/settings', requireOwner, async c => {
  const body = await c.req.json<Partial<Settings>>();
  const clean: Partial<Settings> = {};
  if (body.monthlyGoal !== undefined) clean.monthlyGoal = clampInt(body.monthlyGoal, 0, 100_000, 1000);
  if (body.followupDays !== undefined) clean.followupDays = clampInt(body.followupDays, 1, 90, 7);
  for (const k of ['senderName', 'senderEmail', 'senderAddress', 'lancersTitle', 'mailboxForCompose'] as const) {
    if (body[k] !== undefined) clean[k] = String(body[k]).trim().slice(0, 200);
  }
  for (const k of ['ownDomains', 'excludedDomains'] as const) {
    if (body[k] !== undefined) {
      clean[k] = [...new Set((body[k] ?? []).map(d => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean))].slice(0, 500);
    }
  }
  await saveSettings(c.env, clean);
  return c.json(await getSettings(c.env));
});

// ── Templates ───────────────────────────────────────────────────────

const ensureTemplates = async (env: Env) => {
  const n = await env.DB.prepare('select count(*) as n from templates').first<{ n: number }>();
  if (n && n.n > 0) return;
  await env.DB.batch(
    seedTemplates.map(t =>
      env.DB.prepare('insert or ignore into templates (key, category, variant, label, subject, body, sort) values (?, ?, ?, ?, ?, ?, ?)').bind(
        t.key,
        t.category,
        t.variant,
        t.label,
        t.subject,
        t.body,
        t.sort
      )
    )
  );
};

admin.get('/templates', async c => {
  await ensureTemplates(c.env);
  const rows = await c.env.DB.prepare('select * from templates order by sort').all<Template>();
  return c.json(rows.results);
});

admin.put('/templates/:key', async c => {
  const body = await c.req.json<Partial<Template>>();
  const key = c.req.param('key');
  await c.env.DB.prepare(
    `update templates set label = coalesce(?, label), subject = coalesce(?, subject), body = coalesce(?, body),
       active = coalesce(?, active), updated_at = ? where key = ?`
  )
    .bind(body.label ?? null, body.subject ?? null, body.body ?? null, body.active === undefined ? null : body.active ? 1 : 0, nowIso(), key)
    .run();
  return c.json({ ok: true });
});

// Back to the original text
admin.post('/templates/:key/reset', async c => {
  const seed = seedTemplates.find(t => t.key === c.req.param('key'));
  if (!seed) return c.json({ error: 'not found' }, 404);
  await c.env.DB.prepare('update templates set label = ?, subject = ?, body = ?, active = 1, updated_at = ? where key = ?')
    .bind(seed.label, seed.subject, seed.body, nowIso(), seed.key)
    .run();
  return c.json({ ok: true });
});
