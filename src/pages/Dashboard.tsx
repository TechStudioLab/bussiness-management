import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, ArrowUpRight, Briefcase, Globe2, Inbox, MessageSquareReply, RefreshCw, Send, Trophy } from 'lucide-react';
import { categories, statuses } from '@shared/statuses';
import type { CountRow } from '@shared/types';
import { ActivityItem, actorName } from '@/components/ActivityItem';
import { CategoryBadge, statusDot } from '@/components/badges';
import { Btn, Card, Empty, Loading, Notice, PageHeader, Progress, Select, cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { fetchers, keys } from '@/lib/api';
import { fmtAgo, fmtDay, fmtNum, fmtYen, pct } from '@/lib/format';
import { categoryFull, serverText, statusLabel, templateLabel, valueLabel } from '@/lib/labels';
import { useSyncNow } from '@/lib/sync';
import { chartColors, useTheme } from '@/lib/theme';

const Kpi = ({ label, value, sub, to, icon, tone = 'slate' }: { label: string; value: string; sub?: React.ReactNode; to?: string; icon: React.ReactNode; tone?: 'slate' | 'violet' | 'green' | 'blue' }) => {
  const iconTone = { slate: 'bg-paper text-ink-soft', violet: 'bg-violet-soft text-violet', green: 'bg-success-soft text-success', blue: 'bg-info-soft text-info' }[tone];
  const body = (
    <div className={cn('group h-full rounded-2xl border border-line bg-surface p-5 shadow-card transition-all', to && 'hover:-translate-y-0.5 hover:border-ink-muted/40')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconTone)}>{icon}</span>
      </div>
      <p className="tabular mt-2 flex items-center gap-1 text-[28px] font-bold leading-none tracking-tight text-ink">
        {value}
        {to && <ArrowUpRight className="h-4 w-4 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100" />}
      </p>
      {sub && <div className="mt-2 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

// Rows of a breakdown with sent / reply rate / won
const Breakdown = ({ rows, label, linkParam }: { rows: CountRow[]; label: (k: string) => React.ReactNode; linkParam?: string }) => {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map(r => r.sites));
  if (!rows.length) return <Empty title={t('common.noData')} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr>
            <th className="th px-5">{t('th.segment')}</th>
            <th className="th px-2 text-right">{t('th.sites')}</th>
            <th className="th px-2 text-right">{t('th.sent')}</th>
            <th className="th px-2 text-right">{t('th.replyRate')}</th>
            <th className="th px-5 text-right">{t('th.won')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className="border-t border-line-soft transition-colors hover:bg-paper-light">
              <td className="px-5 py-2.5">
                {linkParam ? (
                  <Link to={`/sites?${linkParam}=${encodeURIComponent(r.key)}`} className="font-medium hover:text-crimson">
                    {label(r.key)}
                  </Link>
                ) : (
                  <span className="font-medium">{label(r.key)}</span>
                )}
                <Progress value={r.sites} max={max} className="mt-1.5 h-1" tone="ink" />
              </td>
              <td className="tabular px-2 py-2.5 text-right">{fmtNum(r.sites)}</td>
              <td className="tabular px-2 py-2.5 text-right">{fmtNum(r.sent)}</td>
              <td className="tabular px-2 py-2.5 text-right">{r.sent ? `${pct(r.replied, r.sent)}%` : '—'}</td>
              <td className="tabular px-5 py-2.5 text-right font-semibold">{fmtNum(r.won)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Funnel = ({ steps }: { steps: { label: string; value: number }[] }) => {
  const { t } = useI18n();
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div className="space-y-4 p-5">
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="font-medium">{s.label}</span>
            <span className="tabular">
              <b className="text-base">{fmtNum(s.value)}</b>
              {i > 0 && <span className="ml-2 text-xs text-ink-muted">{t('dash.ofSent', { pct: pct(s.value, steps[0].value) })}</span>}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-paper">
            <div className="h-full rounded-full bg-crimson transition-[width] duration-500" style={{ width: `${(s.value / max) * 100}%`, opacity: 1 - i * 0.18 }} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const { t, tx } = useI18n();
  const { resolved } = useTheme();
  const c = chartColors(resolved);
  const [days, setDays] = useState(30);
  const stats = useQuery({ queryKey: keys.stats(days), queryFn: () => fetchers.stats(days), refetchInterval: 15_000 });
  const mailboxes = useQuery({ queryKey: keys.mailboxes, queryFn: fetchers.mailboxes, refetchInterval: 60_000 });
  const members = useQuery({ queryKey: keys.members, queryFn: fetchers.members });
  const templates = useQuery({ queryKey: keys.templates, queryFn: fetchers.templates });
  const sync = useSyncNow();

  if (!stats.data) return <Loading />;
  const s = stats.data;
  const tot = s.totals;
  const lastSync = mailboxes.data?.map(m => m.last_sync_at).filter(Boolean).sort().at(-1);
  const syncError = mailboxes.data?.find(m => m.last_error);
  const tplLabel = (k: string) => templateLabel(templates.data?.find(x => x.key === k), k);

  return (
    <>
      <PageHeader
        title={t('nav.dashboard')}
        description={
          mailboxes.data?.length ? (
            <span className="inline-flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-solid opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success-solid" />
              </span>
              {t('dash.lastSync', { ago: fmtAgo(lastSync) })}
            </span>
          ) : (
            <Link to="/settings" className="text-crimson underline underline-offset-2">
              {t('dash.notConnected')}
            </Link>
          )
        }
        actions={
          <>
            <Select value={days} onChange={e => setDays(Number(e.target.value))} className="w-36" aria-label={t('dash.period')}>
              {[7, 30, 90].map(n => (
                <option key={n} value={n}>
                  {t('dash.days', { n })}
                </option>
              ))}
            </Select>
            <Btn onClick={sync.run} busy={sync.busy}>
              {!sync.busy && <RefreshCw className="h-4 w-4" />}
              {t('common.syncNow')}
            </Btn>
          </>
        }
      />

      {syncError && (
        <Notice tone="danger" icon={<AlertCircle className="h-4 w-4" />} className="mb-4">
          {syncError.email}: {serverText(syncError.last_error ?? '')}{' '}
          <Link to="/settings" className="font-medium underline">
            {t('dash.openSettings')}
          </Link>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {/* Monthly goal */}
        <div className="relative col-span-2 overflow-hidden rounded-2xl bg-gradient-to-br from-crimson to-crimson-dark p-5 text-white shadow-card md:col-span-3 xl:col-span-2">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <p className="text-xs font-medium text-white/80">{t('dash.kpi.month')}</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
              <Send className="h-4 w-4" />
            </span>
          </div>
          <p className="tabular relative mt-2 text-[28px] font-bold leading-none tracking-tight">
            {fmtNum(s.month.sent)}
            <span className="text-lg font-semibold text-white/60"> / {fmtNum(s.month.goal)}</span>
          </p>
          <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${Math.min(100, pct(s.month.sent, s.month.goal))}%` }} />
          </div>
          <p className="relative mt-2 text-xs text-white/80">{t('dash.kpi.monthSub', { pct: pct(s.month.sent, s.month.goal), replied: fmtNum(s.month.replied), won: fmtNum(s.month.won) })}</p>
        </div>
        <Kpi
          icon={<MessageSquareReply className="h-4 w-4" />}
          tone="blue"
          label={t('dash.kpi.replyRate')}
          value={`${pct(tot.repliedSites, tot.sentSites)}%`}
          sub={t('dash.kpi.replyRateSub', { a: fmtNum(tot.repliedSites), b: fmtNum(tot.sentSites) })}
        />
        <Kpi icon={<Briefcase className="h-4 w-4" />} tone="violet" label={statusLabel('completed')} value={fmtNum(tot.completed)} sub={t('dash.kpi.completedSub')} to="/sites?status=completed,won" />
        <Kpi icon={<Trophy className="h-4 w-4" />} tone="green" label={statusLabel('won')} value={fmtNum(tot.won)} sub={tot.wonAmount ? fmtYen(tot.wonAmount) : t('dash.kpi.wonSub')} to="/sites?status=won" />
        <Kpi icon={<Globe2 className="h-4 w-4" />} label={t('dash.kpi.sites')} value={fmtNum(tot.sites)} sub={t('dash.kpi.sitesSub', { n: fmtNum(tot.noSales) })} to="/sites" />
      </div>

      {(tot.unmatched > 0 || tot.followupDue > 0) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {tot.unmatched > 0 && (
            <Link to="/replies" className="flex items-center gap-3 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn transition-colors hover:border-warn-solid/60">
              <Inbox className="h-4 w-4" />
              <span className="flex-1">{tx('dash.unmatched', { n: <b>{t('dash.unmatchedCount', { count: tot.unmatched })}</b> })}</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
          {tot.followupDue > 0 && (
            <Link to="/sites?followup=1" className="flex items-center gap-3 rounded-xl border border-info-line bg-info-soft px-4 py-3 text-sm text-info transition-colors hover:border-info-solid/60">
              <RefreshCw className="h-4 w-4" />
              <span className="flex-1">{tx('dash.followup', { n: <b>{t('dash.followupCount', { count: tot.followupDue })}</b> })}</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title={t('dash.chart', { n: s.range.days })} className="lg:col-span-2">
          <div className="h-72 px-3 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={s.daily} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: c.text }} tickLine={false} axisLine={{ stroke: c.axis }} minTickGap={16} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: c.text }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: c.grid, opacity: 0.6 }}
                  labelFormatter={v => fmtDay(String(v))}
                  formatter={(v: number, n: string) => [fmtNum(v), n]}
                  contentStyle={{ borderRadius: 10, borderColor: c.tooltipBorder, background: c.tooltipBg, color: c.tooltipText, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: c.text }} iconType="circle" iconSize={8} />
                <Bar dataKey="sent" name={t('dash.chartSent')} fill={c.bar} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                <Line dataKey="replies" name={t('dash.chartReplies')} stroke={c.line} strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title={t('dash.funnel')}>
          <Funnel
            steps={[
              { label: t('dash.f.sent'), value: tot.sentSites },
              { label: t('dash.f.replied'), value: tot.repliedSites },
              { label: statusLabel('completed'), value: tot.funnelCompleted },
              { label: statusLabel('won'), value: tot.funnelWon }
            ]}
          />
          <div className="border-t border-line-soft px-5 py-4">
            <p className="mb-2 text-xs font-medium text-ink-muted">{t('dash.statusMix')}</p>
            <div className="flex h-2.5 gap-px overflow-hidden rounded-full bg-paper">
              {statuses.map(st => (
                <div key={st.key} style={{ width: `${pct(s.byStatus[st.key], tot.sites)}%`, background: statusDot[st.tone] }} title={`${statusLabel(st.key)} ${s.byStatus[st.key]}`} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
              {statuses.map(st => (
                <Link key={st.key} to={`/sites?status=${st.key}`} className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ background: statusDot[st.tone] }} />
                  {statusLabel(st.key)} <span className="tabular font-semibold">{s.byStatus[st.key]}</span>
                </Link>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={t('dash.byCategory')}>
          <Breakdown rows={s.byCategory} label={k => <CategoryBadge category={k} full />} linkParam="category" />
        </Card>
        <Card title={t('dash.byIndustry')}>
          <Breakdown rows={s.byIndustry.slice(0, 10)} label={valueLabel} linkParam="industry" />
        </Card>
        <Card title={t('dash.byTemplate')}>
          <Breakdown rows={s.byTemplate} label={tplLabel} />
          <p className="border-t border-line-soft px-5 py-3 text-xs text-ink-muted">{t('dash.byTemplateNote')}</p>
        </Card>
        <Card title={t('dash.byPlatform')}>
          <Breakdown rows={s.byPlatform.slice(0, 10)} label={valueLabel} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title={t('dash.byMember', { n: s.range.days })}>
          {s.byMember.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th px-5">{t('th.member')}</th>
                  <th className="th px-2 text-right">{t('th.sent')}</th>
                  <th className="th px-2 text-right">{t('th.updates')}</th>
                  <th className="th px-5 text-right">{t('th.lastAction')}</th>
                </tr>
              </thead>
              <tbody>
                {s.byMember.map(m => (
                  <tr key={m.key} className="border-t border-line-soft hover:bg-paper-light">
                    <td className="px-5 py-2.5">
                      <Link to={`/activity?actor=${encodeURIComponent(m.key)}`} className="font-medium hover:text-crimson">
                        {actorName(m.key, members.data)}
                      </Link>
                    </td>
                    <td className="tabular px-2 py-2.5 text-right font-semibold">{fmtNum(m.sent)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{fmtNum(m.statusChanges + m.notes)}</td>
                    <td className="px-5 py-2.5 text-right text-xs text-ink-muted">{fmtAgo(m.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty title={t('dash.noActions')} />
          )}
        </Card>
        <Card
          title={t('dash.recent')}
          className="lg:col-span-2"
          action={
            <Link to="/activity" className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink">
              {t('dash.seeAll')}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {s.recent.length ? (
            <ul className="divide-y divide-line-soft px-5">
              {s.recent.slice(0, 12).map(a => (
                <ActivityItem key={a.id} a={a} members={members.data} showSite />
              ))}
            </ul>
          ) : (
            <Empty title={t('common.noRecords')}>{t('dash.recentEmpty')}</Empty>
          )}
        </Card>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-ink-muted">{t('dash.footnote', { list: categories.map(x => categoryFull(x.key)).join(' / ') })}</p>
    </>
  );
}
