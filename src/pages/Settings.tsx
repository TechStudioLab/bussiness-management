import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, Mail, Monitor, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react';
import type { Me, Settings } from '@shared/types';
import { LanguageSwitch, ThemeSwitch } from '@/components/Preferences';
import { Btn, Card, Field, Input, Loading, Notice, PageHeader, Select, Textarea, btnClass } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, fetchers, keys } from '@/lib/api';
import { fmtAgo, fmtDateTime } from '@/lib/format';
import { serverText } from '@/lib/labels';
import { useSyncNow } from '@/lib/sync';

const PrefsCard = () => {
  const { t } = useI18n();
  return (
    <Card icon={<Monitor className="h-4 w-4" />} title={t('prefs.title')}>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-soft">{t('prefs.language')}</p>
          <LanguageSwitch />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-soft">{t('prefs.theme')}</p>
          <ThemeSwitch labels />
        </div>
        <p className="text-xs text-ink-muted sm:col-span-2">{t('prefs.help')}</p>
      </div>
    </Card>
  );
};

const MailboxCard = ({ me }: { me: Me }) => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const mailboxes = useQuery({ queryKey: keys.mailboxes, queryFn: fetchers.mailboxes, refetchInterval: 15_000 });
  const sync = useSyncNow();
  const remove = async (id: number, email: string) => {
    if (!confirm(t('set.disconnectConfirm', { email }))) return;
    await api.del(`/api/mailboxes/${id}`);
    qc.invalidateQueries({ queryKey: keys.mailboxes });
  };
  return (
    <Card
      icon={<Mail className="h-4 w-4" />}
      title={t('set.gmail')}
      action={
        <a href="/auth/mailbox?next=/settings" className={btnClass('primary', 'sm')}>
          <Mail className="h-3.5 w-3.5" />
          {t('set.connect')}
        </a>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-xs leading-relaxed text-ink-muted">{t('set.gmailHelp')}</p>
        {!mailboxes.data ? (
          <Loading />
        ) : mailboxes.data.length === 0 ? (
          <Notice tone="warn">{t('set.notConnected')}</Notice>
        ) : (
          <ul className="divide-y divide-line-soft rounded-xl border border-line">
            {mailboxes.data.map(m => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {m.last_error ? <AlertCircle className="h-4 w-4 text-danger" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.email}</p>
                  <p className="text-xs text-ink-muted">
                    {t('set.mbStatus', { ago: fmtAgo(m.last_sync_at), queued: m.queued > 0 ? t('set.queued', { n: m.queued }) : '', when: fmtDateTime(m.connected_at) })}
                  </p>
                  {m.last_error && <p className="text-xs text-danger">{serverText(m.last_error)}</p>}
                </div>
                {me.role === 'owner' && (
                  <Btn size="sm" variant="ghost" onClick={() => remove(m.id, m.email)} aria-label={t('set.disconnect')} title={t('set.disconnect')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Btn>
                )}
              </li>
            ))}
          </ul>
        )}
        <Btn size="sm" onClick={sync.run} busy={sync.busy}>
          {!sync.busy && <RefreshCw className="h-3.5 w-3.5" />}
          {t('common.syncNow')}
        </Btn>
      </div>
    </Card>
  );
};

const MembersCard = ({ me }: { me: Me }) => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const members = useQuery({ queryKey: keys.members, queryFn: fetchers.members });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'agent' | 'owner'>('agent');
  const [busy, setBusy] = useState(false);
  const owner = me.role === 'owner';
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/members', { email, role });
      toast.success(t('set.memberAdded', { email }));
      setEmail('');
      qc.invalidateQueries({ queryKey: keys.members });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (e: string) => {
    if (!confirm(t('set.memberRemoveConfirm', { email: e }))) return;
    try {
      await api.del(`/api/members/${encodeURIComponent(e)}`);
      qc.invalidateQueries({ queryKey: keys.members });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  return (
    <Card icon={<Users className="h-4 w-4" />} title={t('set.members')}>
      <div className="space-y-4 p-5">
        <p className="text-xs leading-relaxed text-ink-muted">{t('set.membersHelp')}</p>
        <ul className="divide-y divide-line-soft rounded-xl border border-line">
          {members.data?.map(m => (
            <li key={m.email} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-xs font-semibold text-ink-soft">{(m.name || m.email)[0]?.toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name || m.email}
                  {m.email === me.email && <span className="text-xs font-normal text-ink-muted">{t('common.you')}</span>}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {m.email}
                  {t('common.sep')}
                  {m.role === 'owner' ? t('role.owner') : t('role.agent')}
                  {t('common.sep')}
                  {m.last_login_at ? t('set.lastLogin', { ago: fmtAgo(m.last_login_at) }) : t('set.neverLoggedIn')}
                </p>
              </div>
              {owner && m.email !== me.email && (
                <Btn size="sm" variant="ghost" onClick={() => remove(m.email)} aria-label={t('common.delete')} title={t('common.delete')}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Btn>
              )}
            </li>
          ))}
        </ul>
        {owner && (
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder={t('set.emailPh')} required className="min-w-[220px] flex-1" />
            <Select value={role} onChange={e => setRole(e.target.value as 'agent' | 'owner')} className="w-36">
              <option value="agent">{t('role.agent')}</option>
              <option value="owner">{t('role.owner')}</option>
            </Select>
            <Btn type="submit" variant="primary" busy={busy}>
              <UserPlus className="h-4 w-4" />
              {t('common.add')}
            </Btn>
          </form>
        )}
      </div>
    </Card>
  );
};

const SettingsForm = ({ me, settings }: { me: Me; settings: Settings }) => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...settings, own: settings.ownDomains.join('\n'), excluded: settings.excludedDomains.join('\n') });
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm({ ...settings, own: settings.ownDomains.join('\n'), excluded: settings.excludedDomains.join('\n') }), [settings]);
  const owner = me.role === 'owner';
  const set = (k: string) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/api/settings', {
        monthlyGoal: Number(form.monthlyGoal),
        followupDays: Number(form.followupDays),
        senderName: form.senderName,
        senderEmail: form.senderEmail,
        senderAddress: form.senderAddress,
        lancersTitle: form.lancersTitle,
        mailboxForCompose: form.mailboxForCompose,
        ownDomains: form.own.split(/[\s,]+/),
        excludedDomains: form.excluded.split(/[\s,]+/)
      });
      toast.success(t('common.saved'));
      qc.invalidateQueries({ queryKey: keys.settings });
      qc.invalidateQueries({ queryKey: ['stats'] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // Template placeholders stay in Japanese: they are written into the Japanese templates
  const ph = (label: string, token: string) => (
    <>
      {label} <code className="ml-1 rounded bg-paper px-1 py-px text-[11px] font-normal text-ink-muted">{token}</code>
    </>
  );
  return (
    <form onSubmit={save} className="space-y-4">
      <Card title={t('set.sender')}>
        <fieldset disabled={!owner} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label={ph(t('set.senderName'), '{{送信者名}}')} hint={t('set.senderNameHint')}>
            <Input value={form.senderName} onChange={set('senderName')} />
          </Field>
          <Field label={ph(t('set.senderEmail'), '{{連絡先}}')} hint={t('set.senderEmailHint')}>
            <Input value={form.senderEmail} onChange={set('senderEmail')} />
          </Field>
          <Field label={ph(t('set.lancers'), '{{称号}}')} hint={t('set.lancersHint')}>
            <Input value={form.lancersTitle} onChange={set('lancersTitle')} />
          </Field>
          <Field label={ph(t('set.address'), '{{住所}}')} hint={t('set.addressHint')}>
            <Input value={form.senderAddress} onChange={set('senderAddress')} />
          </Field>
          <Field label={t('set.composeAccount')} hint={t('set.composeAccountHint')}>
            <Input value={form.mailboxForCompose} onChange={set('mailboxForCompose')} placeholder="sales@techstudiolab.jp" />
          </Field>
        </fieldset>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('set.goals')}>
          <fieldset disabled={!owner} className="grid gap-4 p-5">
            <Field label={t('set.goal')}>
              <Input value={form.monthlyGoal} onChange={set('monthlyGoal')} inputMode="numeric" />
            </Field>
            <Field label={t('set.followupDays')} hint={t('set.followupDaysHint')}>
              <Input value={form.followupDays} onChange={set('followupDays')} inputMode="numeric" />
            </Field>
          </fieldset>
        </Card>
        <Card title={t('set.domains')}>
          <fieldset disabled={!owner} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label={t('set.excluded')} hint={t('set.excludedHint')}>
              <Textarea value={form.excluded} onChange={set('excluded')} rows={5} placeholder="example.co.jp" />
            </Field>
            <Field label={t('set.own')} hint={t('set.ownHint')}>
              <Textarea value={form.own} onChange={set('own')} rows={5} />
            </Field>
          </fieldset>
        </Card>
      </div>
      {owner ? (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <Btn type="submit" variant="primary" busy={busy} className="shadow-pop">
            {t('set.save')}
          </Btn>
        </div>
      ) : (
        <p className="text-right text-xs text-ink-muted">{t('set.ownerOnly')}</p>
      )}
    </form>
  );
};

export default function SettingsPage({ me }: { me: Me }) {
  const { t } = useI18n();
  const settings = useQuery({ queryKey: keys.settings, queryFn: fetchers.settings });
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const m = params.get('mailbox');
    if (!m) return;
    if (m === 'connected') toast.success(t('set.connected', { email: params.get('email') ?? 'Gmail' }));
    if (m === 'denied') toast.error(t('set.denied'));
    setParams({}, { replace: true });
  }, [params, setParams, t]);
  if (!settings.data) return <Loading />;
  return (
    <>
      <PageHeader title={t('nav.settings')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <MailboxCard me={me} />
        <MembersCard me={me} />
      </div>
      <div className="mt-4">
        <PrefsCard />
      </div>
      <div className="mt-4">
        <SettingsForm me={me} settings={settings.data} />
      </div>
    </>
  );
}
