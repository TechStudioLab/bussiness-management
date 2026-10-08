import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Inbox, Link2, MailOpen, RefreshCw, Search } from 'lucide-react';
import type { Message, Site } from '@shared/types';
import { KindBadge } from '@/components/badges';
import { Btn, Card, Chip, Empty, Input, Loading, Modal, PageHeader, btnClass } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { api, dataKeys, fetchers, keys } from '@/lib/api';
import { displayName, firstAddress, fmtDateTime, gmailThreadUrl } from '@/lib/format';
import { useSyncNow } from '@/lib/sync';

const tabs: { key: string; label: MessageKey; hint: MessageKey }[] = [
  { key: 'unmatched', label: 'replies.tab.unmatched', hint: 'replies.hint.unmatched' },
  { key: 'replies', label: 'replies.tab.replies', hint: 'replies.hint.replies' },
  { key: 'sent', label: 'replies.tab.sent', hint: 'replies.hint.sent' },
  { key: 'auto', label: 'replies.tab.auto', hint: 'replies.hint.auto' }
];

const LinkModal = ({ msg, onClose }: { msg: Message; onClose: () => void }) => {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const address = firstAddress(msg.from_addr);
  const domain = address.split('@')[1] ?? '';
  const [q, setQ] = useState(domain && !/gmail|yahoo|outlook|hotmail|icloud/.test(domain) ? domain.split('.')[0] : '');
  const [search, setSearch] = useState(q);
  const results = useQuery({ queryKey: keys.sites(`q=${search}&pageSize=20`), queryFn: () => fetchers.sites(`q=${encodeURIComponent(search)}&pageSize=20`), enabled: search.length > 0 });
  const [busy, setBusy] = useState<number | null>(null);
  const link = async (site: Site) => {
    setBusy(site.id);
    try {
      await api.post(`/api/messages/${msg.id}/link`, { siteId: site.id, remember: true });
      toast.success(t('replies.linked', { name: site.company || site.domain }));
      for (const k of dataKeys) qc.invalidateQueries({ queryKey: k });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal open onClose={onClose} title={t('replies.linkTitle')}>
      <p className="mb-4 text-sm text-ink-soft">{tx('replies.linkQ', { name: <b className="text-ink">{displayName(msg.from_addr)}</b>, address })}</p>
      <form
        onSubmit={e => {
          e.preventDefault();
          setSearch(q.trim());
        }}
        className="mb-3 flex gap-2"
      >
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t('replies.searchPh')} autoFocus />
        <Btn type="submit" aria-label={t('common.search')}>
          <Search className="h-4 w-4" />
        </Btn>
      </form>
      {results.isFetching ? (
        <Loading />
      ) : results.data?.items.length ? (
        <ul className="max-h-80 divide-y divide-line-soft overflow-y-auto rounded-xl border border-line">
          {results.data.items.map(s => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.company || s.domain}</p>
                <p className="truncate text-xs text-ink-muted">{s.domain}</p>
              </div>
              <Btn size="sm" variant="primary" busy={busy === s.id} onClick={() => link(s)}>
                {t('replies.link')}
              </Btn>
            </li>
          ))}
        </ul>
      ) : (
        search && <Empty title={t('replies.notFound')} />
      )}
      <p className="mt-4 text-xs text-ink-muted">{t('replies.remember')}</p>
    </Modal>
  );
};

export default function RepliesPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'unmatched';
  const messages = useQuery({ queryKey: keys.messages(tab), queryFn: () => fetchers.messages(tab), refetchInterval: 15_000 });
  const stats = useQuery({ queryKey: keys.stats(30), queryFn: () => fetchers.stats(30) });
  const sync = useSyncNow();
  const [linking, setLinking] = useState<Message | null>(null);
  const current = tabs.find(x => x.key === tab) ?? tabs[0];

  return (
    <>
      <PageHeader
        title={t('nav.replies')}
        description={t('replies.desc')}
        actions={
          <Btn onClick={sync.run} busy={sync.busy}>
            {!sync.busy && <RefreshCw className="h-4 w-4" />}
            {t('common.syncNow')}
          </Btn>
        }
      />
      <div className="scrollbar-thin mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(x => (
          <Chip key={x.key} active={tab === x.key} onClick={() => setParams({ tab: x.key }, { replace: true })} count={x.key === 'unmatched' ? stats.data?.totals.unmatched : undefined}>
            {t(x.label)}
          </Chip>
        ))}
      </div>
      <p className="mb-4 text-sm text-ink-muted">{t(current.hint)}</p>
      <Card>
        {!messages.data ? (
          <Loading />
        ) : messages.data.length === 0 ? (
          <Empty icon={<Inbox className="h-5 w-5" />} title={tab === 'unmatched' ? t('replies.emptyUnmatched') : t('replies.empty')} />
        ) : (
          <ul className="divide-y divide-line-soft">
            {messages.data.map(m => (
              <li key={m.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-paper-light sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindBadge kind={m.kind} />
                    <span className="truncate text-sm font-semibold">{m.direction === 'in' ? displayName(m.from_addr) : t('replies.to', { name: displayName(m.to_addr) })}</span>
                    <span className="text-xs text-ink-muted">{fmtDateTime(m.sent_at)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm">{m.subject || t('common.noSubject')}</p>
                  {m.snippet && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{m.snippet}</p>}
                  {m.site_id && (
                    <Link to={`/sites/${m.site_id}`} className="mt-1.5 inline-block text-xs font-medium text-crimson hover:underline">
                      {m.company || m.domain}
                    </Link>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <a href={gmailThreadUrl(m.mailbox_email, m.thread_id)} target="_blank" rel="noopener noreferrer" className={btnClass('secondary', 'sm')}>
                    <MailOpen className="h-3.5 w-3.5" />
                    {t('common.gmail')}
                  </a>
                  {!m.site_id && m.direction === 'in' && (
                    <Btn size="sm" variant="primary" onClick={() => setLinking(m)}>
                      <Link2 className="h-3.5 w-3.5" />
                      {t('replies.link')}
                    </Btn>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {linking && <LinkModal msg={linking} onClose={() => setLinking(null)} />}
    </>
  );
}
