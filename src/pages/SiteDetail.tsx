import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Copy, ExternalLink, Globe, Mail, MailOpen, Pencil, Phone, RefreshCw, ScanSearch, Send, Trash2, Undo2, User } from 'lucide-react';
import { categories, categoryOf, statuses } from '@shared/statuses';
import { charCount, fillTemplate, needsSignature, signatureKeys } from '@shared/templates';
import type { Me, Message, Settings, Site, Status, Template } from '@shared/types';
import { ActivityItem } from '@/components/ActivityItem';
import { CategoryBadge, KindBadge, StatusBadge } from '@/components/badges';
import { IndustryOptions } from '@/components/IndustryOptions';
import { Btn, Card, Empty, Field, Input, Loading, Modal, Notice, Segmented, Select, Textarea, btnClass, cn } from '@/components/ui';
import { t, useI18n } from '@/i18n';
import { api, dataKeys, fetchers, keys } from '@/lib/api';
import { fmtAgo, fmtDateTime, fmtNum, fmtYen, gmailComposeUrl, gmailThreadUrl } from '@/lib/format';
import { categoryFull, serverText, statusHint, statusLabel, valueLabel } from '@/lib/labels';

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t('common.copied', { what }));
  } catch {
    toast.error(t('common.copyFailed'));
  }
};

const useRefresh = () => {
  const qc = useQueryClient();
  return () => {
    for (const k of dataKeys) qc.invalidateQueries({ queryKey: k });
  };
};

// ── Send panel: the right template for this site, ready to paste ─────

const variants = ['1', '2', '3', '500', '200'];
const variantLabel = (v: string) => (v.length === 1 ? t('detail.pattern', { n: v }) : t('detail.charsVariant', { n: v }));

const SendPanel = ({ site, templates, settings }: { site: Site; templates: Template[]; settings: Settings }) => {
  const { t, tx } = useI18n();
  const refresh = useRefresh();
  const letter = categoryOf(site.category)?.letter.toLowerCase() ?? 'a';
  const used = templates.find(x => x.key === site.template_key);
  // Rotate patterns 1–3 across sites so each gets a fair share
  const [variant, setVariant] = useState(used?.category === site.category ? used.variant : ['1', '2', '3'][site.id % 3]);
  const [channel, setChannel] = useState<'form' | 'mail'>('form');
  const [busy, setBusy] = useState(false);
  const followupDue = site.status === 'sent' && site.received_count === 0 && site.sent_count > 0;
  const [mode, setMode] = useState<'first' | 'followup'>(followupDue ? 'followup' : 'first');
  useEffect(() => setMode(followupDue ? 'followup' : 'first'), [followupDue]);

  const tpl = mode === 'followup' ? templates.find(x => x.key === 'followup') : templates.find(x => x.key === `${letter}${variant}`);
  const sig = templates.find(x => x.key === (channel === 'mail' ? signatureKeys.mail : signatureKeys.form));
  const body = tpl ? fillTemplate(tpl.body, settings) + (needsSignature(tpl) && sig ? `\n\n${fillTemplate(sig.body, settings)}` : '') : '';
  const subject = tpl ? fillTemplate(tpl.subject, settings) : '';
  const chars = charCount(body);
  const charsCrlf = chars + (body.match(/\n/g)?.length ?? 0);
  const missing = !settings.senderName || !settings.senderEmail;
  const overLimit = (variant === '200' && charsCrlf > 200) || (variant === '500' && charsCrlf > 500);

  const markSent = async () => {
    if (site.no_sales && !confirm(t('detail.confirmNoSalesMark'))) return;
    setBusy(true);
    try {
      await api.post(`/api/sites/${site.id}/sent`, { templateKey: tpl?.key, channel: 'form', followup: mode === 'followup' });
      toast.success(mode === 'followup' ? t('detail.followupRecorded') : t('detail.sentRecorded'));
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openGmail = async () => {
    if (site.no_sales && !confirm(t('detail.confirmNoSalesSend'))) return;
    if (tpl) await api.post(`/api/sites/${site.id}/template`, { templateKey: tpl.key }).catch(() => undefined);
    window.open(gmailComposeUrl({ mailbox: settings.mailboxForCompose, to: site.contact_email, subject, body }), '_blank', 'noopener');
    toast.info(t('detail.gmailInfo'));
  };

  return (
    <Card
      icon={<Send className="h-4 w-4" />}
      title={mode === 'followup' ? t('detail.sendFollowup') : t('detail.send')}
      action={
        followupDue && (
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'first', label: t('detail.first') },
              { value: 'followup', label: t('detail.followup') }
            ]}
          />
        )
      }
    >
      <div className="space-y-4 p-5">
        {site.no_sales === 1 && (
          <Notice tone="danger" icon={<AlertTriangle className="h-4 w-4" />}>
            {t('detail.noSalesWarn')}
          </Notice>
        )}
        {missing && (
          <Notice tone="warn" className="text-xs">
            {tx('detail.missingSender', {
              link: (
                <Link to="/settings" className="font-medium underline">
                  {t('nav.settings')}
                </Link>
              )
            })}
          </Notice>
        )}
        {mode === 'first' && (
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={site.category} full />
            <Segmented size="sm" value={variant} onChange={setVariant} options={variants.map(v => ({ value: v, label: variantLabel(v) }))} />
          </div>
        )}
        {tpl && needsSignature(tpl) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
            <span className="font-medium">{t('detail.signature')}</span>
            {(['form', 'mail'] as const).map(c => (
              <label key={c} className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" checked={channel === c} onChange={() => setChannel(c)} />
                {c === 'form' ? t('detail.sigForm') : t('detail.sigMail')}
              </label>
            ))}
          </div>
        )}
        {subject && (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper-light px-3 py-2">
            <span className="text-xs font-medium text-ink-muted">{t('f.subject')}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{subject}</span>
            <button onClick={() => copy(subject, t('f.subject'))} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" aria-label={t('detail.copySubject')}>
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="relative">
          <pre lang="ja" className="scrollbar-thin max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-paper-light p-4 pb-8 font-sans text-[13px] leading-relaxed text-ink">
            {body || t('detail.noTemplate')}
          </pre>
          <span className={cn('tabular absolute bottom-2 right-3 rounded-md bg-surface/90 px-1.5 py-0.5 text-[11px] shadow-sm', overLimit ? 'font-semibold text-danger' : 'text-ink-muted')}>
            {t('detail.chars', { chars: fmtNum(chars), crlf: fmtNum(charsCrlf) })}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="primary" onClick={() => copy(body, t('f.body'))}>
            <Copy className="h-4 w-4" />
            {t('detail.copyBody')}
          </Btn>
          {(site.contact_url || site.url) && (
            <a href={site.contact_url || site.url} target="_blank" rel="noopener noreferrer" className={btnClass('secondary')}>
              <ExternalLink className="h-4 w-4" />
              {site.contact_url ? t('detail.openContact') : t('detail.openSite')}
            </a>
          )}
          {site.contact_email && (
            <Btn onClick={openGmail}>
              <Mail className="h-4 w-4" />
              {t('detail.compose')}
            </Btn>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
          <Btn variant="info" onClick={markSent} busy={busy}>
            <Send className="h-4 w-4" />
            {mode === 'followup' ? t('detail.markFollowup') : t('detail.markSent')}
          </Btn>
          <span className="flex-1 text-xs text-ink-muted">{t('detail.markHint')}</span>
        </div>
      </div>
    </Card>
  );
};

// ── Status ───────────────────────────────────────────────────────────

const StatusPanel = ({ site }: { site: Site }) => {
  const { t } = useI18n();
  const refresh = useRefresh();
  const [next, setNext] = useState<Status | null>(null);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(site.deal_amount ? String(site.deal_amount) : '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!next) return;
    setBusy(true);
    try {
      await api.patch(`/api/sites/${site.id}`, { status: next, status_reason: reason, ...(next === 'won' ? { deal_amount: amount === '' ? null : Number(amount) } : {}) });
      toast.success(t('detail.statusChanged'));
      setNext(null);
      setReason('');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t('f.status')} action={<StatusBadge status={site.status} />}>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2">
          {statuses.map(s => (
            <button
              key={s.key}
              onClick={() => setNext(s.key === site.status ? null : s.key)}
              disabled={s.key === site.status}
              className={cn(
                'rounded-xl border px-3 py-2 text-left text-xs transition-all',
                s.key === site.status
                  ? 'border-inverse bg-inverse text-inverse-fg'
                  : next === s.key
                    ? 'border-crimson bg-crimson-soft ring-2 ring-crimson/15'
                    : 'border-line bg-surface hover:border-ink-muted/50 hover:bg-paper-light'
              )}
            >
              <span className="block font-semibold">{statusLabel(s.key)}</span>
              <span className={cn('mt-0.5 block text-[11px] leading-snug', s.key === site.status ? 'text-inverse-fg/70' : 'text-ink-muted')}>{statusHint(s.key)}</span>
            </button>
          ))}
        </div>
        {site.status_reason && !next && <p className="mt-3 text-xs text-ink-muted">{t('detail.reason', { reason: valueLabel(site.status_reason) })}</p>}
        {site.status === 'won' && !next && site.deal_amount !== null && <p className="mt-1 text-xs text-ink-muted">{t('detail.amount', { amount: fmtYen(site.deal_amount) })}</p>}
        {next && (
          <div className="mt-3 animate-fade-in space-y-3 rounded-xl border border-line bg-paper-light p-3">
            <Field label={t('detail.reasonField')}>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder={next === 'suspended' ? t('detail.reasonPhSuspended') : next === 'pending' ? t('detail.reasonPhPending') : ''} />
            </Field>
            {next === 'won' && (
              <Field label={t('detail.amountField')}>
                <Input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="300000" />
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <Btn size="sm" variant="ghost" onClick={() => setNext(null)}>
                {t('detail.cancelChange')}
              </Btn>
              <Btn size="sm" variant="primary" onClick={save} busy={busy}>
                {t('detail.setStatus', { label: statusLabel(next) })}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

// ── Edit ─────────────────────────────────────────────────────────────

const EditModal = ({ site, open, onClose }: { site: Site; open: boolean; onClose: () => void }) => {
  const { t } = useI18n();
  const refresh = useRefresh();
  const [form, setForm] = useState(site);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(site), [site, open]);
  const set = (k: keyof Site) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const patch: Record<string, unknown> = {};
    for (const k of ['company', 'url', 'industry', 'category', 'contact_url', 'contact_email', 'phone', 'person', 'notes'] as const) if (form[k] !== site[k]) patch[k] = form[k];
    try {
      if (Object.keys(patch).length) await api.patch(`/api/sites/${site.id}`, patch);
      toast.success(t('common.saved'));
      refresh();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('detail.editTitle')}>
      <form onSubmit={save} className="space-y-4">
        <Field label={t('f.company')}>
          <Input value={form.company} onChange={set('company')} />
        </Field>
        <Field label={t('f.url')}>
          <Input value={form.url} onChange={set('url')} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('f.industry')}>
            <Input value={form.industry} onChange={set('industry')} list="industry-edit" />
            <IndustryOptions id="industry-edit" />
          </Field>
          <Field label={t('f.category')}>
            <Select value={form.category} onChange={set('category')}>
              {categories.map(c => (
                <option key={c.key} value={c.key}>
                  {categoryFull(c.key)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('f.contactUrl')}>
          <Input value={form.contact_url} onChange={set('contact_url')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('f.email')}>
            <Input value={form.contact_email} onChange={set('contact_email')} type="email" />
          </Field>
          <Field label={t('f.phone')}>
            <Input value={form.phone} onChange={set('phone')} />
          </Field>
        </div>
        <Field label={t('f.person')}>
          <Input value={form.person} onChange={set('person')} />
        </Field>
        <Field label={t('f.notes')}>
          <Textarea value={form.notes} onChange={set('notes')} rows={3} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Btn type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Btn>
          <Btn type="submit" variant="primary" busy={busy}>
            {t('common.save')}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

// ── Page ─────────────────────────────────────────────────────────────

const ContactRow = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-paper text-ink-muted">{icon}</span>
    <div className="min-w-0 flex-1 pt-1">{children}</div>
  </div>
);

export default function SiteDetailPage({ me }: { me: Me }) {
  const { t } = useI18n();
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const refresh = useRefresh();
  const detail = useQuery({ queryKey: keys.site(id), queryFn: () => fetchers.site(id), refetchInterval: 15_000 });
  const templates = useQuery({ queryKey: keys.templates, queryFn: fetchers.templates });
  const settings = useQuery({ queryKey: keys.settings, queryFn: fetchers.settings });
  const members = useQuery({ queryKey: keys.members, queryFn: fetchers.members });
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const byMessage = useMemo(() => new Map((detail.data?.messages ?? []).map(m => [m.id, m])), [detail.data]);

  if (detail.isError) return <Empty title={t('detail.notFound')} />;
  if (!detail.data || !templates.data || !settings.data) return <Loading />;
  const { site, activities } = detail.data;

  const recheck = async () => {
    setBusy('check');
    try {
      await api.post('/api/sites/analyze', { ids: [site.id] });
      toast.success(t('detail.rechecked'));
      refresh();
    } finally {
      setBusy(null);
    }
  };
  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy('note');
    try {
      await api.post(`/api/sites/${site.id}/notes`, { text: note });
      setNote('');
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const undo = async (aid: number) => {
    if (!confirm(t('detail.undoConfirm'))) return;
    await api.del(`/api/sites/${site.id}/activities/${aid}`);
    refresh();
  };
  const remove = async () => {
    if (!confirm(t('detail.deleteConfirm', { name: site.company || site.domain }))) return;
    await api.del(`/api/sites/${site.id}`);
    refresh();
    navigate('/sites');
  };

  const mailOf = (a: { detail: Record<string, unknown> }): Message | undefined => byMessage.get(String(a.detail.messageId ?? ''));
  const iconBtn = 'rounded-md p-1.5 text-ink-muted transition-colors hover:bg-paper hover:text-ink';

  return (
    <>
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm text-ink-muted transition-colors hover:bg-paper hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')}
      </button>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{site.company || site.title || site.domain}</h1>
            <StatusBadge status={site.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <a href={site.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-crimson">
              <Globe className="h-3.5 w-3.5" />
              {site.domain}
            </a>
            <span className="text-line">|</span>
            <CategoryBadge category={site.category} full />
            {site.industry && <span className="rounded-md bg-paper px-1.5 py-0.5 text-xs">{valueLabel(site.industry)}</span>}
            {site.platform && <span className="rounded-md bg-paper px-1.5 py-0.5 text-xs">{valueLabel(site.platform)}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Btn onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            {t('detail.edit')}
          </Btn>
          {me.role === 'owner' && (
            <Btn variant="danger" onClick={remove} aria-label={t('common.delete')} title={t('common.delete')}>
              <Trash2 className="h-4 w-4" />
            </Btn>
          )}
        </div>
      </div>

      {site.no_sales === 1 && (
        <Notice tone="danger" icon={<AlertTriangle className="h-4 w-4" />} className="mb-4">
          <b>{t('detail.noSalesBanner')}</b>
          <span lang="ja" className="mt-0.5 block text-xs opacity-90">「{site.no_sales_text}」</span>
        </Notice>
      )}

      {/* Phones: status and contact first; desktop: two columns */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-start-3 lg:row-start-1">
          <StatusPanel key={site.status} site={site} />

          <Card title={t('detail.contact')}>
            <dl className="space-y-3 p-4 text-sm">
              <ContactRow icon={<ExternalLink className="h-3.5 w-3.5" />}>
                {site.contact_url ? (
                  <a href={site.contact_url} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-crimson hover:underline">
                    {t('detail.contactPage')}
                  </a>
                ) : (
                  <span className="text-ink-muted">{t('detail.contactPageMissing')}</span>
                )}
              </ContactRow>
              <ContactRow icon={<Mail className="h-3.5 w-3.5" />}>
                {site.contact_email ? (
                  <button onClick={() => copy(site.contact_email, t('f.email'))} className="break-all text-left hover:text-crimson">
                    {site.contact_email}
                  </button>
                ) : (
                  <span className="text-ink-muted">{t('detail.emailMissing')}</span>
                )}
              </ContactRow>
              <ContactRow icon={<Phone className="h-3.5 w-3.5" />}>
                {site.phone ? <a href={`tel:${site.phone}`}>{site.phone}</a> : <span className="text-ink-muted">{t('detail.phoneMissing')}</span>}
              </ContactRow>
              {site.person && <ContactRow icon={<User className="h-3.5 w-3.5" />}>{site.person}</ContactRow>}
              {detail.data.addresses.length > 0 && <p className="border-t border-line-soft pt-3 text-xs text-ink-muted">{t('detail.linkedAddresses', { list: detail.data.addresses.join(t('common.listSep')) })}</p>}
            </dl>
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <SendPanel key={`${site.id}-${site.category}`} site={site} templates={templates.data} settings={settings.data} />
          <Card title={t('detail.log')}>
            <form onSubmit={addNote} className="flex gap-2 border-b border-line-soft p-4">
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={1} placeholder={t('detail.notePh')} className="min-h-9 flex-1" />
              <Btn type="submit" busy={busy === 'note'} disabled={!note.trim()}>
                {t('common.add')}
              </Btn>
            </form>
            {activities.length ? (
              <ul className="divide-y divide-line-soft px-5">
                {activities.map(a => {
                  const mail = mailOf(a);
                  const canUndo = ['form_sent', 'followup', 'note'].includes(a.type) && (a.actor === me.email || me.role === 'owner');
                  return (
                    <div key={a.id}>
                      <ActivityItem
                        a={a}
                        members={members.data}
                        action={
                          <div className="flex shrink-0 items-start gap-1">
                            {mail && (
                              <a href={gmailThreadUrl(mail.mailbox_email, mail.thread_id)} target="_blank" rel="noopener noreferrer" className={iconBtn} title={t('detail.openGmail')}>
                                <MailOpen className="h-4 w-4" />
                              </a>
                            )}
                            {canUndo && (
                              <button onClick={() => undo(a.id)} className={iconBtn} title={t('detail.undo')}>
                                <Undo2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        }
                      />
                      {mail?.snippet && <p className="-mt-1 mb-3 ml-10 line-clamp-2 rounded-lg border border-line-soft bg-paper-light px-2.5 py-1.5 text-xs text-ink-muted">{mail.snippet}</p>}
                    </div>
                  );
                })}
              </ul>
            ) : (
              <Empty title={t('common.noRecords')} />
            )}
          </Card>
        </div>
        <div className="space-y-4 lg:col-start-3 lg:row-start-2">
          <Card title={t('detail.mail')}>
            <div className="grid grid-cols-3 divide-x divide-line-soft text-center">
              {[
                [t('detail.cnt.sent'), site.sent_count],
                [t('detail.cnt.reply'), site.received_count],
                [t('detail.cnt.auto'), site.auto_count]
              ].map(([label, n]) => (
                <div key={label} className="py-4">
                  <p className="tabular text-2xl font-bold">{n}</p>
                  <p className="text-xs text-ink-muted">{label}</p>
                </div>
              ))}
            </div>
            <dl className="space-y-1.5 border-t border-line-soft px-4 py-3 text-xs">
              {[
                [t('detail.firstSent'), site.first_sent_at],
                [t('detail.lastSent'), site.last_sent_at],
                [t('detail.lastReply'), site.last_reply_at]
              ].map(([label, at]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="tabular">{fmtDateTime(at)}</dd>
                </div>
              ))}
            </dl>
            {detail.data.messages.length > 0 && (
              <ul className="divide-y divide-line-soft border-t border-line-soft">
                {detail.data.messages.slice(0, 5).map(m => (
                  <li key={m.id}>
                    <a href={gmailThreadUrl(m.mailbox_email, m.thread_id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 text-xs transition-colors hover:bg-paper-light hover:text-crimson">
                      <KindBadge kind={m.kind} />
                      <span className="min-w-0 flex-1 truncate">{m.subject || t('common.noSubject')}</span>
                      <span className="shrink-0 text-ink-muted">{fmtAgo(m.sent_at)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            icon={<ScanSearch className="h-4 w-4" />}
            title={t('detail.check')}
            action={
              <Btn size="sm" variant="ghost" onClick={recheck} busy={busy === 'check'}>
                {busy !== 'check' && <RefreshCw className="h-3.5 w-3.5" />}
                {t('detail.recheck')}
              </Btn>
            }
          >
            <div className="space-y-1.5 p-4 text-sm">
              {site.analyzed_at ? (
                <>
                  {site.title && <p className="font-medium">{site.title}</p>}
                  {site.description && <p className="text-xs text-ink-muted">{site.description}</p>}
                  {site.analyze_error && <p className="text-xs text-danger">{t('detail.fetchFailed', { error: serverText(site.analyze_error) })}</p>}
                  <p className="pt-1 text-[11px] text-ink-muted">{t('detail.checkedAt', { when: fmtDateTime(site.analyzed_at) })}</p>
                </>
              ) : (
                <p className="text-xs text-ink-muted">{t('detail.notChecked')}</p>
              )}
              {site.notes && <p className="whitespace-pre-wrap border-t border-line-soft pt-2 text-xs">{site.notes}</p>}
            </div>
          </Card>
        </div>
      </div>
      <EditModal site={site} open={editing} onClose={() => setEditing(false)} />
    </>
  );
}
