import { useSearchParams } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import type { Activity } from '@shared/types';
import { ActivityItem, actorName } from '@/components/ActivityItem';
import { Btn, Card, Empty, Loading, PageHeader, Select } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { api, fetchers, keys } from '@/lib/api';

const types: { key: string; label: MessageKey }[] = [
  { key: '', label: 'log.allTypes' },
  { key: 'form_sent,email_sent,followup', label: 'log.type.sent' },
  { key: 'reply', label: 'log.type.reply' },
  { key: 'status', label: 'log.type.status' },
  { key: 'note', label: 'log.type.note' },
  { key: 'import', label: 'log.type.import' }
];

export default function ActivityPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const actor = params.get('actor') ?? '';
  const type = params.get('type') ?? '';
  const members = useQuery({ queryKey: keys.members, queryFn: fetchers.members });
  const qs = new URLSearchParams({ ...(actor && { actor }), ...(type && { type }) }).toString();
  const feed = useInfiniteQuery({
    queryKey: keys.activities(qs),
    queryFn: ({ pageParam }) => api.get<Activity[]>(`/api/activities?${qs}${pageParam ? `&before=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: last => (last.length === 100 ? last[last.length - 1].id : undefined),
    refetchInterval: 15_000
  });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    v ? n.set(k, v) : n.delete(k);
    setParams(n, { replace: true });
  };
  const items = feed.data?.pages.flat() ?? [];

  return (
    <>
      <PageHeader title={t('nav.activity')} description={t('log.desc')} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={actor} onChange={e => set('actor', e.target.value)} className="w-64" aria-label={t('log.member')}>
          <option value="">{t('log.allMembers')}</option>
          {members.data?.map(m => (
            <option key={m.email} value={m.email}>
              {actorName(m.email, members.data)} ({m.email})
            </option>
          ))}
          <option value="system">{t('common.system')}</option>
        </Select>
        <Select value={type} onChange={e => set('type', e.target.value)} className="w-48" aria-label={t('log.kind')}>
          {types.map(x => (
            <option key={x.key} value={x.key}>
              {t(x.label)}
            </option>
          ))}
        </Select>
      </div>
      <Card>
        {feed.isLoading ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty icon={<History className="h-5 w-5" />} title={t('log.empty')} />
        ) : (
          <ul className="divide-y divide-line-soft px-5">
            {items.map(a => (
              <ActivityItem key={a.id} a={a} members={members.data} showSite />
            ))}
          </ul>
        )}
        {feed.hasNextPage && (
          <div className="border-t border-line-soft p-3 text-center">
            <Btn size="sm" onClick={() => feed.fetchNextPage()} busy={feed.isFetchingNextPage}>
              {t('common.loadMore')}
            </Btn>
          </div>
        )}
      </Card>
    </>
  );
}
