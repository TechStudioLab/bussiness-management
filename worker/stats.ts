import type { Activity, CountRow, Stats, Status } from '../shared/types';
import type { Env } from './env';
import { getSettings } from './store';
import { parseJson } from './util';

// Dashboard numbers. Days and months are counted in Japan time.

const JST = '+9 hours';
const day = (col: string) => `date(${col}, '${JST}')`;

const jstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

const countRows = async (env: Env, column: string): Promise<CountRow[]> => {
  const rows = await env.DB.prepare(
    `select ${column} as key, count(*) as sites,
       sum(first_sent_at is not null) as sent,
       sum(first_reply_at is not null and first_sent_at is not null) as replied,
       sum(status in ('completed', 'won')) as completed,
       sum(status = 'won') as won
     from sites group by ${column} order by sites desc`
  ).all<CountRow>();
  return rows.results.map(r => ({ ...r, key: r.key ?? '' }));
};

export const getStats = async (env: Env, days: number): Promise<Stats> => {
  const settings = await getSettings(env);
  const today = jstToday();
  const from = new Date(Date.parse(`${today}T00:00:00+09:00`) - (days - 1) * 86_400_000);
  const fromIso = from.toISOString();
  const fromDay = new Date(from.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  const monthStart = new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00+09:00`)).toISOString();
  const followupBefore = new Date(Date.now() - settings.followupDays * 86_400_000).toISOString();

  const [totals, msgs, month, byStatus, sentDaily, replyDaily, members, recent] = await env.DB.batch([
    env.DB.prepare(
      `select count(*) as sites,
         coalesce(sum(first_sent_at is not null), 0) as sentSites,
         coalesce(sum(first_reply_at is not null and first_sent_at is not null), 0) as repliedSites,
         coalesce(sum(status in ('completed', 'won')), 0) as completed,
         coalesce(sum(status = 'won'), 0) as won,
         coalesce(sum(status in ('completed', 'won') and first_sent_at is not null), 0) as funnelCompleted,
         coalesce(sum(status = 'won' and first_sent_at is not null), 0) as funnelWon,
         coalesce(sum(case when status = 'won' then deal_amount end), 0) as wonAmount,
         coalesce(sum(no_sales), 0) as noSales,
         coalesce(sum(status = 'sent' and first_reply_at is null and followups = 0 and last_sent_at < ?), 0) as followupDue
       from sites`
    ).bind(followupBefore),
    env.DB.prepare(
      `select coalesce(sum(direction = 'out' and site_id is not null), 0) as messagesOut,
         coalesce(sum(kind = 'reply' and site_id is not null), 0) as messagesIn,
         coalesce(sum(kind = 'auto' and site_id is not null), 0) as autoReplies,
         (select count(*) from messages where kind = 'reply' and site_id is null) as unmatched
       from messages where sent_at >= ?`
    ).bind(fromIso),
    env.DB.prepare(
      `select coalesce(sum(first_sent_at >= ?1), 0) as sent, coalesce(sum(first_reply_at >= ?1 and first_sent_at is not null), 0) as replied, coalesce(sum(won_at >= ?1), 0) as won from sites`
    ).bind(monthStart),
    env.DB.prepare('select status, count(*) as n from sites group by status'),
    // Sends: form sends and follow-ups logged by hand + e-mails found by the sync
    env.DB.prepare(
      `select d, count(*) as n from (
         select ${day('created_at')} as d from activities where type in ('form_sent', 'followup') and created_at >= ?1
         union all select ${day('sent_at')} from messages where direction = 'out' and site_id is not null and sent_at >= ?1
       ) group by d`
    ).bind(fromIso),
    env.DB.prepare(`select ${day('sent_at')} as d, count(*) as n from messages where kind = 'reply' and site_id is not null and sent_at >= ? group by d`).bind(fromIso),
    env.DB.prepare(
      `select coalesce(actor, 'system') as key,
         sum(type in ('form_sent', 'followup', 'email_sent')) as sent,
         sum(type = 'status') as statusChanges,
         sum(type = 'note') as notes,
         max(created_at) as last
       from activities where created_at >= ? and coalesce(actor, 'system') != 'system' group by actor order by sent desc`
    ).bind(fromIso),
    env.DB.prepare(
      `select a.*, s.company, s.domain from activities a left join sites s on s.id = a.site_id
       where a.type not in ('analyzed', 'edit') order by a.created_at desc, a.id desc limit 25`
    )
  ]);

  const t = totals.results[0] as Record<string, number>;
  const m = msgs.results[0] as Record<string, number>;
  const mo = month.results[0] as Record<string, number>;
  const statusCounts = Object.fromEntries(['new', 'sent', 'replied', 'completed', 'won', 'pending', 'suspended'].map(s => [s, 0])) as Record<Status, number>;
  for (const r of byStatus.results as { status: Status; n: number }[]) statusCounts[r.status] = r.n;

  const sentMap = new Map((sentDaily.results as { d: string; n: number }[]).map(r => [r.d, r.n]));
  const replyMap = new Map((replyDaily.results as { d: string; n: number }[]).map(r => [r.d, r.n]));
  const daily: Stats['daily'] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.parse(`${fromDay}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    daily.push({ day: d, sent: sentMap.get(d) ?? 0, replies: replyMap.get(d) ?? 0 });
  }

  const [byCategory, byIndustry, byPlatform, byTemplate] = await Promise.all([
    countRows(env, 'category'),
    countRows(env, 'industry'),
    countRows(env, "case when platform = '' then '不明' else platform end"),
    countRows(env, "case when template_key = '' then '未記録' else template_key end")
  ]);

  return {
    range: { from: fromDay, to: today, days },
    totals: {
      sites: t.sites,
      sentSites: t.sentSites,
      repliedSites: t.repliedSites,
      completed: t.completed,
      won: t.won,
      funnelCompleted: t.funnelCompleted,
      funnelWon: t.funnelWon,
      wonAmount: t.wonAmount,
      messagesOut: m.messagesOut,
      messagesIn: m.messagesIn,
      autoReplies: m.autoReplies,
      noSales: t.noSales,
      unmatched: m.unmatched,
      followupDue: t.followupDue
    },
    month: { sent: mo.sent, goal: settings.monthlyGoal, replied: mo.replied, won: mo.won },
    byStatus: statusCounts,
    daily,
    byCategory,
    byIndustry,
    byPlatform,
    byTemplate: byTemplate.filter(r => r.sent > 0),
    byMember: members.results as Stats['byMember'],
    recent: (recent.results as unknown as (Activity & { detail: string })[]).map(a => ({ ...a, detail: parseJson(a.detail, {}) }))
  };
};
