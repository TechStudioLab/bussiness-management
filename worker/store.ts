import type { ActivityType, Settings, Site } from '../shared/types';
import { autoAdvance } from '../shared/statuses';
import type { Env } from './env';
import { nowIso, parseJson } from './util';

// Settings, activity log and per-site counters

export const defaultSettings: Settings = {
  monthlyGoal: 1000,
  senderName: '',
  senderEmail: '',
  senderAddress: '',
  lancersTitle: '',
  mailboxForCompose: '',
  ownDomains: ['techstudiolab.jp'],
  excludedDomains: [],
  followupDays: 7
};

export const getSettings = async (env: Env): Promise<Settings> => {
  const rows = await env.DB.prepare('select key, value from settings').all<{ key: string; value: string }>();
  const saved = Object.fromEntries(rows.results.map(r => [r.key, parseJson(r.value, null)]));
  return { ...defaultSettings, ...Object.fromEntries(Object.entries(saved).filter(([k, v]) => k in defaultSettings && v !== null)) };
};

export const saveSettings = async (env: Env, patch: Partial<Settings>) => {
  const allowed = Object.entries(patch).filter(([k]) => k in defaultSettings);
  if (!allowed.length) return;
  await env.DB.batch(
    allowed.map(([k, v]) =>
      env.DB.prepare('insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value').bind(k, JSON.stringify(v))
    )
  );
};

export const logActivity = (
  env: Env,
  siteId: number | null,
  type: ActivityType,
  detail: Record<string, unknown>,
  actor: string | null,
  at = nowIso()
) => env.DB.prepare('insert into activities (site_id, type, detail, actor, created_at) values (?, ?, ?, ?, ?)').bind(siteId, type, JSON.stringify(detail), actor, at);

// Counters and dates from the source of truth (messages + logged form sends),
// then move the status forward if it is still automatic
export const recountSite = async (env: Env, siteId: number) => {
  const c = await env.DB.prepare(
    `select
       (select count(*) from messages where site_id = ?1 and direction = 'out') +
       (select count(*) from activities where site_id = ?1 and type in ('form_sent', 'followup')) as sent,
       (select count(*) from messages where site_id = ?1 and kind = 'reply') as received,
       (select count(*) from messages where site_id = ?1 and kind = 'auto') as auto,
       (select count(*) from activities where site_id = ?1 and type = 'followup') as followups,
       (select min(t) from (select sent_at as t from messages where site_id = ?1 and direction = 'out'
                            union all select created_at from activities where site_id = ?1 and type in ('form_sent', 'followup'))) as first_sent,
       (select max(t) from (select sent_at as t from messages where site_id = ?1 and direction = 'out'
                            union all select created_at from activities where site_id = ?1 and type in ('form_sent', 'followup'))) as last_sent,
       (select min(sent_at) from messages where site_id = ?1 and kind = 'reply') as first_reply,
       (select max(sent_at) from messages where site_id = ?1 and kind = 'reply') as last_reply`
  )
    .bind(siteId)
    .first<{ sent: number; received: number; auto: number; followups: number; first_sent: string | null; last_sent: string | null; first_reply: string | null; last_reply: string | null }>();
  const site = await env.DB.prepare('select status from sites where id = ?').bind(siteId).first<Pick<Site, 'status'>>();
  if (!c || !site) return;
  let status = site.status;
  if (c.sent > 0) status = autoAdvance(status, 'sent');
  if (c.received > 0) status = autoAdvance(status, 'replied');
  const stmts = [
    env.DB.prepare(
      `update sites set sent_count = ?, received_count = ?, auto_count = ?, followups = ?, first_sent_at = ?, last_sent_at = ?,
         first_reply_at = ?, last_reply_at = ?, status = ?, updated_at = ? where id = ?`
    ).bind(c.sent, c.received, c.auto, c.followups, c.first_sent, c.last_sent, c.first_reply, c.last_reply, status, nowIso(), siteId)
  ];
  if (status !== site.status) stmts.push(logActivity(env, siteId, 'status', { from: site.status, to: status, auto: true }, 'system'));
  await env.DB.batch(stmts);
};
