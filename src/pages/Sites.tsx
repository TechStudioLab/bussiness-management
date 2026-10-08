import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Plus, Search, SearchX, X } from 'lucide-react';
import { categories, statuses } from '@shared/statuses';
import type { Site, Status } from '@shared/types';
import { CategoryBadge, StatusBadge } from '@/components/badges';
import { IndustryOptions } from '@/components/IndustryOptions';
import { Btn, Card, Chip, Empty, Field, Input, Loading, Modal, PageHeader, Select, Textarea, cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, dataKeys, fetchers, keys } from '@/lib/api';
import { fmtAgo, fmtNum } from '@/lib/format';
import { categoryFull, statusLabel, valueLabel } from '@/lib/labels';

const filterKeys = ['q', 'status', 'category', 'industry', 'platform', 'noSales', 'followup', 'unchecked', 'importId', 'sort', 'order', 'page'] as const;

const AddSite = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ company: '', url: '', industry: '', category: '', contact_url: '', contact_email: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await api.post<{ id: number }>('/api/sites', { ...form, category: form.category || undefined });
      for (const k of dataKeys) qc.invalidateQueries({ queryKey: k });
      toast.success(t('sites.added'));
      onClose();
      navigate(`/sites/${id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('sites.add.title')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('sites.add.url')}>
          <Input value={form.url} onChange={set('url')} placeholder="https://example.co.jp" required autoFocus />
        </Field>
        <Field label={t('f.company')}>
          <Input value={form.company} onChange={set('company')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('f.industry')}>
            <Input value={form.industry} onChange={set('industry')} list="industry-list" placeholder={t('sites.autoDetect')} />
            <IndustryOptions id="industry-list" />
          </Field>
          <Field label={t('f.category')}>
            <Select value={form.category} onChange={set('category')}>
              <option value="">{t('sites.autoOption')}</option>
              {categories.map(c => (
                <option key={c.key} value={c.key}>
                  {categoryFull(c.key)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('f.contactUrl')}>
          <Input value={form.contact_url} onChange={set('contact_url')} placeholder={t('sites.autoFind')} />
        </Field>
        <Field label={t('f.email')}>
          <Input value={form.contact_email} onChange={set('contact_email')} type="email" placeholder={t('sites.autoFind')} />
        </Field>
        <Field label={t('f.notes')}>
          <Textarea value={form.notes} onChange={set('notes')} rows={2} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Btn type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Btn>
          <Btn type="submit" variant="primary" busy={busy}>
            {t('sites.add.submit')}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

const BulkBar = ({ ids, onDone }: { ids: number[]; onDone: () => void }) => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: keys.me, queryFn: fetchers.me });
  const [busy, setBusy] = useState(false);
  const run = async (body: Record<string, unknown>, done: 'bulk.updated' | 'bulk.deleted') => {
    setBusy(true);
    try {
      const r = await api.post<{ updated: number }>('/api/sites/bulk', { ids, ...body });
      toast.success(t(done, { count: r.updated }));
      for (const k of dataKeys) qc.invalidateQueries({ queryKey: k });
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const dark = 'h-8 border-inverse-fg/20 bg-inverse-fg/10 text-inverse-fg shadow-none hover:border-inverse-fg/40';
  return (
    <div className="sticky bottom-4 z-20 mx-auto mt-4 flex max-w-3xl animate-fade-in flex-wrap items-center gap-2 rounded-2xl bg-inverse px-4 py-3 text-sm text-inverse-fg shadow-pop">
      <span className="font-semibold">{t('bulk.selected', { count: ids.length })}</span>
      <Select disabled={busy} className="w-44" selectClassName={dark} value="" onChange={e => e.target.value && run({ status: e.target.value }, 'bulk.updated')} aria-label={t('bulk.changeStatus')}>
        <option value="">{t('bulk.changeStatus')}</option>
        {statuses.map(s => (
          <option key={s.key} value={s.key}>
            {statusLabel(s.key)}
          </option>
        ))}
      </Select>
      <Select disabled={busy} className="w-52" selectClassName={dark} value="" onChange={e => e.target.value && run({ category: e.target.value }, 'bulk.updated')} aria-label={t('bulk.changeCategory')}>
        <option value="">{t('bulk.changeCategory')}</option>
        {categories.map(c => (
          <option key={c.key} value={c.key}>
            {categoryFull(c.key)}
          </option>
        ))}
      </Select>
      {me.data?.role === 'owner' && (
        <Btn size="sm" variant="danger" disabled={busy} onClick={() => confirm(t('bulk.confirmDelete', { count: ids.length })) && run({ delete: true }, 'bulk.deleted')}>
          {t('common.delete')}
        </Btn>
      )}
      <button onClick={onDone} className="ml-auto rounded-lg p-1.5 hover:bg-inverse-fg/10" aria-label={t('bulk.clear')}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default function SitesPage() {
  const { t, tx } = useI18n();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of filterKeys) if (params.get(k)) p.set(k, params.get(k)!);
    return p.toString();
  }, [params]);
  const list = useQuery({ queryKey: keys.sites(qs), queryFn: () => fetchers.sites(qs), placeholderData: keepPreviousData, refetchInterval: 15_000 });
  const stats = useQuery({ queryKey: keys.stats(30), queryFn: () => fetchers.stats(30) });

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
    setSelected([]);
  };
  const statusSet = new Set((params.get('status') ?? '').split(',').filter(Boolean));
  const toggleStatus = (s: Status) => {
    const n = new Set(statusSet);
    n.has(s) ? n.delete(s) : n.add(s);
    update({ status: [...n].join(',') || null });
  };
  const activeFilters = filterKeys.filter(k => !['sort', 'order', 'page', 'q'].includes(k) && params.get(k)).length;

  const doExport = async () => {
    setExporting(true);
    try {
      const p = new URLSearchParams(qs);
      p.set('all', '1');
      p.delete('page');
      const [all, { exportSites }] = await Promise.all([fetchers.sites(p.toString()), import('@/lib/excel')]);
      exportSites(all.items);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const allIds = data?.items.map(s => s.id) ?? [];
  const allChecked = allIds.length > 0 && allIds.every(id => selected.includes(id));

  return (
    <>
      <PageHeader
        title={t('nav.sites')}
        description={data ? t('sites.count', { count: data.total, n: fmtNum(data.total) }) : undefined}
        actions={
          <>
            <Btn onClick={doExport} busy={exporting}>
              {!exporting && <Download className="h-4 w-4" />}
              {t('sites.export')}
            </Btn>
            <Btn variant="primary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              {t('sites.addOne')}
            </Btn>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <form
          className="flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            update({ q: search.trim() || null });
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('sites.searchPh')} className="pl-9" />
          </div>
          <Btn type="submit">{t('common.search')}</Btn>
        </form>
        <div className="scrollbar-thin mt-3 flex gap-1.5 overflow-x-auto pb-1">
          <Chip active={!statusSet.size} onClick={() => update({ status: null })} count={stats.data?.totals.sites}>
            {t('sites.all')}
          </Chip>
          {statuses.map(s => (
            <Chip key={s.key} active={statusSet.has(s.key)} onClick={() => toggleStatus(s.key)} count={stats.data?.byStatus[s.key]}>
              {statusLabel(s.key)}
            </Chip>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
          <Select value={params.get('category') ?? ''} onChange={e => update({ category: e.target.value || null })} aria-label={t('f.category')}>
            <option value="">{t('sites.filter.category')}</option>
            {categories.map(c => (
              <option key={c.key} value={c.key}>
                {categoryFull(c.key)}
              </option>
            ))}
          </Select>
          <Select value={params.get('industry') ?? ''} onChange={e => update({ industry: e.target.value || null })} aria-label={t('f.industry')}>
            <option value="">{t('sites.filter.industry')}</option>
            {data?.facets.industries.map(f => (
              <option key={f.value} value={f.value}>
                {valueLabel(f.value)} ({f.count})
              </option>
            ))}
          </Select>
          <Select value={params.get('platform') ?? ''} onChange={e => update({ platform: e.target.value || null })} aria-label={t('f.platform')}>
            <option value="">{t('sites.filter.platform')}</option>
            {data?.facets.platforms.map(f => (
              <option key={f.value} value={f.value}>
                {valueLabel(f.value)} ({f.count})
              </option>
            ))}
          </Select>
          <Select
            value={params.get('followup') ? 'followup' : params.get('noSales') === '1' ? 'nosales' : params.get('unchecked') ? 'unchecked' : ''}
            onChange={e => update({ followup: e.target.value === 'followup' ? '1' : null, noSales: e.target.value === 'nosales' ? '1' : null, unchecked: e.target.value === 'unchecked' ? '1' : null })}
            aria-label={t('sites.filter.condLabel')}
          >
            <option value="">{t('sites.filter.cond')}</option>
            <option value="followup">{t('sites.filter.followup')}</option>
            <option value="nosales">{t('sites.filter.nosales')}</option>
            <option value="unchecked">{t('sites.filter.unchecked')}</option>
          </Select>
          <Select
            value={`${params.get('sort') ?? 'updated'}:${params.get('order') ?? 'desc'}`}
            onChange={e => {
              const [sort, order] = e.target.value.split(':');
              update({ sort, order });
            }}
            aria-label={t('sites.sort')}
          >
            <option value="updated:desc">{t('sites.sort.updated')}</option>
            <option value="created:desc">{t('sites.sort.createdDesc')}</option>
            <option value="created:asc">{t('sites.sort.createdAsc')}</option>
            <option value="reply:desc">{t('sites.sort.reply')}</option>
            <option value="sent:desc">{t('sites.sort.sentDesc')}</option>
            <option value="sent:asc">{t('sites.sort.sentAsc')}</option>
            <option value="company:asc">{t('sites.sort.company')}</option>
          </Select>
          {(activeFilters > 0 || params.get('q')) && (
            <Btn
              variant="ghost"
              onClick={() => {
                setSearch('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              <X className="h-4 w-4" />
              {t('sites.filter.clear')}
            </Btn>
          )}
        </div>
      </Card>

      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Card>
          <Empty icon={<SearchX className="h-5 w-5" />} title={t('sites.empty')}>
            {tx('sites.emptyHint', {
              link: (
                <Link to="/import" className="text-crimson underline underline-offset-2">
                  {t('sites.emptyLink')}
                </Link>
              )
            })}
          </Empty>
        </Card>
      ) : (
        <Card className={cn('overflow-hidden transition-opacity', list.isFetching && 'opacity-90')}>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-paper-light">
                <tr>
                  <th className="th w-10 px-4">
                    <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? [] : allIds)} aria-label={t('sites.selectAll')} />
                  </th>
                  <th className="th px-2">{t('sites.th.company')}</th>
                  <th className="th px-2">{t('sites.th.category')}</th>
                  <th className="th px-2">{t('sites.th.industry')}</th>
                  <th className="th px-2">{t('sites.th.status')}</th>
                  <th className="th px-2 text-right">{t('sites.th.sent')}</th>
                  <th className="th px-2 text-right">{t('sites.th.replies')}</th>
                  <th className="th px-4 text-right">{t('sites.th.last')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(s => (
                  <Row key={s.id} s={s} checked={selected.includes(s.id)} onCheck={() => setSelected(x => (x.includes(s.id) ? x.filter(i => i !== s.id) : [...x, s.id]))} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="divide-y divide-line-soft md:hidden">
            {data.items.map(s => (
              <li key={s.id}>
                <Link to={`/sites/${s.id}`} className="block px-4 py-3.5 active:bg-paper">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{s.company || s.title || s.domain}</p>
                      <p className="truncate text-xs text-ink-muted">{s.domain}</p>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <CategoryBadge category={s.category} />
                    <span>{valueLabel(s.industry)}</span>
                    <span className="tabular">{t('sites.mobileCounts', { s: s.sent_count, r: s.received_count })}</span>
                    {s.no_sales === 1 && <AlertTriangle className="h-3.5 w-3.5 text-danger" />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line-soft px-4 py-3 text-xs text-ink-muted">
            <span className="tabular">
              {t('sites.range', {
                from: fmtNum((data.page - 1) * data.pageSize + 1),
                to: fmtNum(Math.min(data.total, data.page * data.pageSize)),
                total: fmtNum(data.total)
              })}
            </span>
            <div className="flex items-center gap-1">
              <Btn size="sm" variant="ghost" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) })} aria-label={t('sites.prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Btn>
              <span className="tabular px-2">
                {data.page} / {pages}
              </span>
              <Btn size="sm" variant="ghost" disabled={data.page >= pages} onClick={() => update({ page: String(data.page + 1) })} aria-label={t('sites.next')}>
                <ChevronRight className="h-4 w-4" />
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {selected.length > 0 && <BulkBar ids={selected} onDone={() => setSelected([])} />}
      <AddSite open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

const Row = ({ s, checked, onCheck }: { s: Site; checked: boolean; onCheck: () => void }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const last = [s.last_reply_at, s.last_sent_at, s.updated_at].filter(Boolean).sort().at(-1);
  return (
    <tr className={cn('cursor-pointer border-t border-line-soft transition-colors hover:bg-paper-light', checked && 'bg-crimson-soft/50 hover:bg-crimson-soft/70')} onClick={() => navigate(`/sites/${s.id}`)}>
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={checked} onChange={onCheck} aria-label={t('sites.select', { name: s.company || s.domain })} />
      </td>
      <td className="max-w-[300px] px-2 py-3">
        <Link to={`/sites/${s.id}`} className="block truncate font-semibold text-ink hover:text-crimson" onClick={e => e.stopPropagation()}>
          {s.company || s.title || s.domain}
        </Link>
        <span className="flex items-center gap-1.5 truncate text-xs text-ink-muted">
          {s.domain}
          {s.no_sales === 1 && (
            <span className="inline-flex items-center gap-0.5 rounded bg-danger-soft px-1 text-danger" title={s.no_sales_text}>
              <AlertTriangle className="h-3 w-3" />
              {t('sites.noSalesShort')}
            </span>
          )}
          {!s.analyzed_at && <span className="text-ink-muted/70">· {t('sites.pendingCheck')}</span>}
        </span>
      </td>
      <td className="px-2 py-3">
        <CategoryBadge category={s.category} />
      </td>
      <td className="px-2 py-3 text-xs">
        <span className="block">{valueLabel(s.industry)}</span>
        <span className="text-ink-muted">{s.platform ? valueLabel(s.platform) : '—'}</span>
      </td>
      <td className="px-2 py-3">
        <StatusBadge status={s.status} />
      </td>
      <td className="tabular px-2 py-3 text-right">{s.sent_count || '—'}</td>
      <td className={cn('tabular px-2 py-3 text-right', s.received_count > 0 && 'font-semibold text-warn')}>{s.received_count || '—'}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-ink-muted">{fmtAgo(last)}</td>
    </tr>
  );
};
