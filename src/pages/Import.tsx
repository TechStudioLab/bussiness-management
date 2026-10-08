import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { domainOf, normalizeUrl } from '@shared/domain';
import { applyMapping, findHeaderRow, guessMapping, importFields, type ImportField } from '@shared/importMap';
import type { ImportResult, ImportRow } from '@shared/types';
import { Btn, Card, PageHeader, Progress, Select, btnClass, cn } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { api, dataKeys } from '@/lib/api';
import { downloadTemplate, readWorkbook, type Sheet } from '@/lib/excel';
import { fmtNum } from '@/lib/format';
import { serverText, valueLabel } from '@/lib/labels';

type Step = 'pick' | 'map' | 'preview' | 'running' | 'done';
type RowState = 'new' | 'update' | 'dup' | 'excluded' | 'error';

interface PreviewRow {
  n: number;
  row: ImportRow;
  domain: string;
  state: RowState;
}

const stateTone: Record<RowState, string> = {
  new: 'bg-success-soft text-success',
  update: 'bg-info-soft text-info',
  dup: 'bg-paper text-ink-muted',
  excluded: 'bg-paper text-ink-muted',
  error: 'bg-danger-soft text-danger'
};

// Import field → label key (shared/importMap.ts keeps the Japanese aliases)
const fieldLabel: Record<ImportField, MessageKey> = {
  company: 'f.company',
  url: 'f.url',
  industry: 'f.industry',
  category: 'f.categoryAD',
  contact_url: 'f.contactUrl',
  contact_email: 'f.email',
  phone: 'f.phone',
  person: 'f.person',
  notes: 'f.notes',
  status: 'f.status'
};

const CHUNK = 300;
const order: Step[] = ['pick', 'map', 'preview', 'running', 'done'];

export default function ImportPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Partial<Record<ImportField, number>>>({});
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [mode, setMode] = useState<'update' | 'skip'>('update');
  const [progress, setProgress] = useState<{ phase: 'import' | 'check'; done: number; total: number }>({ phase: 'import', done: 0, total: 0 });
  const [result, setResult] = useState<{ importId: number; added: number; updated: number; skipped: number; errors: ImportResult['errors']; checked: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const stop = useRef(false);

  const sheet = sheets[sheetIdx];
  const headers = sheet?.rows[headerRow] ?? [];
  const body = useMemo(() => sheet?.rows.slice(headerRow + 1).filter(r => r.some(c => String(c ?? '').trim())) ?? [], [sheet, headerRow]);

  const load = async (f: File) => {
    try {
      const all = (await readWorkbook(f)).filter(s => s.rows.length > 0);
      if (!all.length) return toast.error(t('imp.noData'));
      setFile(f);
      setSheets(all);
      pickSheet(all, 0);
      setStep('map');
    } catch {
      toast.error(t('imp.readFail'));
    }
  };
  const pickSheet = (all: Sheet[], i: number) => {
    setSheetIdx(i);
    const h = findHeaderRow(all[i].rows);
    setHeaderRow(h);
    setMapping(guessMapping(all[i].rows[h] ?? []));
  };

  const buildPreview = async () => {
    if (mapping.url === undefined) return toast.error(t('imp.needUrl'));
    const rows = body.map((r, i) => {
      const row = applyMapping(r, mapping);
      return { n: i + 1, row, domain: domainOf(normalizeUrl(row.url)) };
    });
    try {
      const res = await api.post<{ existing: Record<string, unknown>; excluded: string[]; own: string[] }>('/api/sites/import/preview', { domains: rows.map(r => r.domain).filter(Boolean) });
      const blocked = [...res.excluded, ...res.own];
      const seen = new Set<string>();
      setPreview(
        rows.map(r => {
          let state: RowState;
          if (!r.domain) state = 'error';
          else if (blocked.some(b => r.domain === b || r.domain.endsWith(`.${b}`))) state = 'excluded';
          else if (seen.has(r.domain)) state = 'dup';
          else state = res.existing[r.domain] ? 'update' : 'new';
          if (r.domain) seen.add(r.domain);
          return { ...r, state };
        })
      );
      setStep('preview');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const counts = useMemo(() => {
    const c: Record<RowState, number> = { new: 0, update: 0, dup: 0, excluded: 0, error: 0 };
    for (const r of preview) c[r.state]++;
    return c;
  }, [preview]);

  const run = async () => {
    setStep('running');
    stop.current = false;
    const rows = preview.map(p => p.row);
    let importId: number | undefined;
    const total = { added: 0, updated: 0, skipped: 0, errors: [] as ImportResult['errors'] };
    const newIds: number[] = [];
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        setProgress({ phase: 'import', done: i, total: rows.length });
        const r = await api.post<ImportResult>('/api/sites/import', {
          importId,
          filename: file?.name,
          rows: rows.slice(i, i + CHUNK),
          mode,
          offset: i,
          last: i + CHUNK >= rows.length
        });
        importId = r.importId;
        total.added += r.added;
        total.updated += r.updated;
        total.skipped += r.skipped;
        total.errors.push(...r.errors);
        if (r.added) newIds.push(...r.siteIds.slice(-r.added));
      }
      for (const k of dataKeys) qc.invalidateQueries({ queryKey: k });

      // Site check for the new rows, 5 at a time, two requests in parallel
      let checked = 0;
      const batches: number[][] = [];
      for (let i = 0; i < newIds.length; i += 5) batches.push(newIds.slice(i, i + 5));
      setProgress({ phase: 'check', done: 0, total: newIds.length });
      const worker = async () => {
        while (batches.length && !stop.current) {
          const b = batches.shift()!;
          await api.post('/api/sites/analyze', { ids: b }).catch(() => undefined);
          checked += b.length;
          setProgress({ phase: 'check', done: checked, total: newIds.length });
        }
      };
      await Promise.all([worker(), worker()]);
      for (const k of dataKeys) qc.invalidateQueries({ queryKey: k });
      setResult({ importId: importId!, ...total, checked });
      setStep('done');
    } catch (e) {
      toast.error((e as Error).message);
      setStep('preview');
    }
  };

  const reset = () => {
    setStep('pick');
    setFile(null);
    setSheets([]);
    setPreview([]);
    setResult(null);
  };

  const steps: [Step, MessageKey][] = [
    ['pick', 'imp.step.pick'],
    ['map', 'imp.step.map'],
    ['preview', 'imp.step.preview'],
    ['running', 'imp.step.running']
  ];

  return (
    <>
      <PageHeader
        title={t('nav.import')}
        description={t('imp.desc')}
        actions={
          <Btn onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            {t('imp.template')}
          </Btn>
        }
      />

      {/* Stepper */}
      <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        {steps.map(([k, label], i) => {
          const cur = order.indexOf(step);
          const done = cur > i;
          const active = cur === i;
          return (
            <li key={k} className="flex items-center gap-2">
              {i > 0 && <span className={cn('h-px w-6 sm:w-10', done || active ? 'bg-crimson' : 'bg-line')} />}
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                  done ? 'bg-crimson text-white' : active ? 'bg-crimson-soft text-crimson-fg ring-2 ring-crimson' : 'bg-paper text-ink-muted ring-1 ring-line'
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn('font-medium', active ? 'text-ink' : done ? 'text-ink-soft' : 'text-ink-muted')}>{t(label)}</span>
            </li>
          );
        })}
      </ol>

      {step === 'pick' && (
        <Card>
          <div
            onDragOver={e => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) load(f);
            }}
            className={cn('m-5 flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors', dragging ? 'border-crimson bg-crimson-soft/50' : 'border-line bg-paper-light')}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-crimson shadow-card ring-1 ring-line">
              <FileSpreadsheet className="h-7 w-7" />
            </span>
            <p className="mt-4 text-base font-semibold">{t('imp.drop')}</p>
            <p className="mt-1 text-xs text-ink-muted">{t('imp.formats')}</p>
            <p className="my-3 text-xs text-ink-muted">{t('imp.or')}</p>
            <Btn variant="primary" onClick={() => input.current?.click()}>
              <Upload className="h-4 w-4" />
              {t('imp.pick')}
            </Btn>
            <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && load(e.target.files[0])} />
          </div>
          <div className="border-t border-line-soft px-5 py-4 text-sm text-ink-soft">
            <p className="font-semibold text-ink">{t('imp.freeCols')}</p>
            <p className="mt-1 text-xs leading-relaxed">{t('imp.freeColsBody')}</p>
          </div>
        </Card>
      )}

      {step === 'map' && sheet && (
        <Card title={t('imp.rows', { file: file?.name ?? '', n: fmtNum(body.length) })}>
          <div className="space-y-4 p-5">
            {sheets.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-muted">{t('imp.sheet')}</span>
                <Select value={sheetIdx} onChange={e => pickSheet(sheets, Number(e.target.value))} className="w-64">
                  {sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {t('imp.sheetRows', { name: s.name, n: s.rows.length })}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr>
                    <th className="th pr-3">{t('imp.th.field')}</th>
                    <th className="th pr-3">{t('imp.th.col')}</th>
                    <th className="th">{t('imp.th.first')}</th>
                  </tr>
                </thead>
                <tbody>
                  {importFields.map(f => (
                    <tr key={f.key} className="border-t border-line-soft">
                      <td className="py-2.5 pr-3 font-medium">
                        {t(fieldLabel[f.key])}
                        {f.required && <span className="ml-1 text-crimson">*</span>}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Select
                          value={mapping[f.key] ?? ''}
                          onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                          className="w-60"
                        >
                          <option value="">{t('imp.unused')}</option>
                          {headers.map((h, i) => (
                            <option key={i} value={i}>
                              {String(h || t('imp.colN', { n: i + 1 }))}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="max-w-[260px] truncate py-2.5 text-xs text-ink-muted">{mapping[f.key] !== undefined ? String(body[0]?.[mapping[f.key]!] ?? '') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between border-t border-line-soft pt-4">
              <Btn variant="ghost" onClick={reset}>
                {t('imp.repick')}
              </Btn>
              <Btn variant="primary" onClick={buildPreview}>
                {t('imp.review')}
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {step === 'preview' && (
        <Card title={t('imp.contents')}>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(stateTone) as RowState[]).map(k => (
                <span key={k} className={cn('rounded-full px-3 py-1 text-xs font-medium', stateTone[k])}>
                  {t(`imp.state.${k}`)} <span className="tabular font-semibold">{fmtNum(counts[k])}</span>
                </span>
              ))}
            </div>
            {counts.update > 0 && (
              <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-line bg-paper-light px-4 py-3 text-sm">
                <span className="text-ink-muted">{t('imp.existing')}</span>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} />
                  {t('imp.modeUpdate')}
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="radio" checked={mode === 'skip'} onChange={() => setMode('skip')} />
                  {t('imp.modeSkip')}
                </label>
              </div>
            )}
            <div className="scrollbar-thin max-h-[420px] overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 border-b border-line bg-paper-light">
                  <tr>
                    <th className="th px-3">{t('imp.th.row')}</th>
                    <th className="th px-2">{t('imp.th.result')}</th>
                    <th className="th px-2">{t('f.company')}</th>
                    <th className="th px-2">{t('imp.th.domain')}</th>
                    <th className="th px-2">{t('f.industry')}</th>
                    <th className="th px-3">{t('imp.th.contact')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 300).map(p => (
                    <tr key={p.n} className="border-t border-line-soft">
                      <td className="tabular px-3 py-2 text-xs text-ink-muted">{p.n}</td>
                      <td className="px-2 py-2">
                        <span className={cn('whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium', stateTone[p.state])}>{t(`imp.state.${p.state}`)}</span>
                      </td>
                      <td className="max-w-[200px] truncate px-2 py-2">{p.row.company}</td>
                      <td className="max-w-[200px] truncate px-2 py-2 text-xs">{p.domain || p.row.url || '—'}</td>
                      <td className="px-2 py-2 text-xs">{p.row.industry ? valueLabel(p.row.industry) : <span className="text-ink-muted">{t('imp.auto')}</span>}</td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-xs text-ink-muted">{p.row.contact_url || p.row.contact_email || t('imp.autoFind')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 300 && <p className="px-3 py-2 text-center text-xs text-ink-muted">{t('imp.more', { n: fmtNum(preview.length - 300) })}</p>}
            </div>
            <div className="flex justify-between border-t border-line-soft pt-4">
              <Btn variant="ghost" onClick={() => setStep('map')}>
                {t('imp.backMap')}
              </Btn>
              <Btn variant="primary" onClick={run} disabled={counts.new + counts.update === 0}>
                {counts.update > 0 && mode === 'update' ? t('imp.runUpdate', { n: fmtNum(counts.new), m: fmtNum(counts.update) }) : t('imp.run', { n: fmtNum(counts.new) })}
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {step === 'running' && (
        <Card>
          <div className="space-y-4 p-10 text-center">
            <p className="text-sm font-semibold">
              {progress.phase === 'check' ? t('imp.checking') : t('imp.importing')}… <span className="tabular">{fmtNum(progress.done)} / {fmtNum(progress.total)}</span>
            </p>
            <Progress value={progress.done} max={progress.total} className="mx-auto max-w-md" />
            {progress.phase === 'check' && (
              <>
                <p className="text-xs text-ink-muted">{t('imp.checkingHint')}</p>
                <Btn variant="ghost" size="sm" onClick={() => (stop.current = true)}>
                  {t('imp.later')}
                </Btn>
              </>
            )}
          </div>
        </Card>
      )}

      {step === 'done' && result && (
        <Card>
          <div className="p-10 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <p className="mt-4 text-lg font-semibold">{t('imp.done')}</p>
            <p className="mt-1 text-sm text-ink-muted">{t('imp.summary', { a: fmtNum(result.added), u: fmtNum(result.updated), s: fmtNum(result.skipped), c: fmtNum(result.checked) })}</p>
            {result.errors.length > 0 && (
              <details className="mx-auto mt-5 max-w-lg rounded-xl border border-danger-line bg-danger-soft px-4 py-2.5 text-left text-xs text-danger">
                <summary className="cursor-pointer font-medium">{t('imp.errors', { n: result.errors.length })}</summary>
                <ul className="mt-2 space-y-0.5">
                  {result.errors.slice(0, 100).map(e => (
                    <li key={`${e.row}-${e.reason}`}>{t('imp.errRow', { row: e.row, reason: serverText(e.reason) })}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mt-6 flex justify-center gap-2">
              <Btn onClick={reset}>{t('imp.again')}</Btn>
              <Link to={`/sites?importId=${result.importId}`} className={btnClass('primary')}>
                {t('imp.viewImported')}
              </Link>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
