import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Info, RotateCcw, Save } from 'lucide-react';
import { categories } from '@shared/statuses';
import { charCount, fillTemplate } from '@shared/templates';
import type { CountRow, Settings, Template } from '@shared/types';
import { Btn, Card, Chip, Input, Loading, Notice, PageHeader, Textarea, cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, fetchers, keys } from '@/lib/api';
import { fmtNum, pct } from '@/lib/format';
import { categoryFull, templateLabel } from '@/lib/labels';

const TemplateCard = ({ tpl, settings, stat }: { tpl: Template; settings: Settings; stat?: CountRow }) => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSubject(tpl.subject);
    setBody(tpl.body);
  }, [tpl]);
  const dirty = subject !== tpl.subject || body !== tpl.body;
  const filled = fillTemplate(body, settings);
  const chars = charCount(filled);
  const crlf = chars + (filled.match(/\n/g)?.length ?? 0);
  const limit = tpl.variant === '500' || tpl.variant === '200' ? Number(tpl.variant) : null;

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/api/templates/${tpl.key}`, { subject, body });
      toast.success(t('common.saved'));
      qc.invalidateQueries({ queryKey: keys.templates });
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!confirm(t('tpl.resetConfirm'))) return;
    await api.post(`/api/templates/${tpl.key}/reset`);
    qc.invalidateQueries({ queryKey: keys.templates });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(filled);
      toast.success(t('common.copiedPlain'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  };

  return (
    <Card
      className={cn(dirty && 'ring-2 ring-crimson/20')}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {templateLabel(tpl)}
          {stat && stat.sent > 0 && (
            <span className="rounded-md bg-paper px-1.5 py-0.5 text-[11px] font-normal text-ink-soft">{t('tpl.stat', { sent: fmtNum(stat.sent), rate: pct(stat.replied, stat.sent) })}</span>
          )}
        </span>
      }
      action={
        <div className="flex gap-1">
          <Btn size="sm" variant="ghost" onClick={copy} title={t('tpl.copyTitle')} aria-label={t('tpl.copyTitle')}>
            <Copy className="h-3.5 w-3.5" />
          </Btn>
          <Btn size="sm" variant="ghost" onClick={reset} title={t('tpl.resetTitle')} aria-label={t('tpl.resetTitle')}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Btn>
          <Btn size="sm" variant={dirty ? 'primary' : 'secondary'} onClick={save} busy={busy} disabled={!dirty}>
            <Save className="h-3.5 w-3.5" />
            {t('common.save')}
          </Btn>
        </div>
      }
    >
      <div className="space-y-2 p-4" lang="ja">
        {tpl.variant !== '500' && tpl.variant !== '200' && tpl.variant !== 'signature' && <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t('f.subject')} />}
        <Textarea value={body} onChange={e => setBody(e.target.value)} rows={Math.min(18, body.split('\n').length + 1)} className="font-sans text-[13px]" />
        <p className={cn('tabular text-right text-xs', limit && crlf > limit ? 'font-semibold text-danger' : 'text-ink-muted')}>
          {t('tpl.chars', { chars: fmtNum(chars), crlf: fmtNum(crlf) })}
          {limit && t('tpl.limit', { n: limit })}
        </p>
      </div>
    </Card>
  );
};

export default function TemplatesPage() {
  const { t, tx } = useI18n();
  const templates = useQuery({ queryKey: keys.templates, queryFn: fetchers.templates });
  const settings = useQuery({ queryKey: keys.settings, queryFn: fetchers.settings });
  const stats = useQuery({ queryKey: keys.stats(30), queryFn: () => fetchers.stats(30) });
  const [group, setGroup] = useState('ai');
  if (!templates.data || !settings.data) return <Loading />;
  const groups = [...categories.map(c => ({ key: c.key, label: categoryFull(c.key) })), { key: 'common', label: t('tpl.groupCommon') }];
  const list = templates.data.filter(x => x.category === group);
  return (
    <>
      <PageHeader
        title={t('nav.templates')}
        description={tx('tpl.desc', {
          vars: <code className="rounded bg-paper px-1 py-0.5 text-xs text-ink-soft">{'{{送信者名}} {{連絡先}} {{称号}} {{住所}}'}</code>,
          settings: (
            <Link to="/settings" className="mx-0.5 text-crimson underline underline-offset-2">
              {t('nav.settings')}
            </Link>
          )
        })}
      />
      {t('tpl.langNote') && (
        <Notice tone="info" icon={<Info className="h-4 w-4" />} className="mb-4">
          {t('tpl.langNote')}
        </Notice>
      )}
      <div className="scrollbar-thin mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {groups.map(g => (
          <Chip key={g.key} active={group === g.key} onClick={() => setGroup(g.key)}>
            {g.label}
          </Chip>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {list.map(x => (
          <TemplateCard key={x.key} tpl={x} settings={settings.data} stat={stats.data?.byTemplate.find(r => r.key === x.key)} />
        ))}
      </div>
    </>
  );
}
