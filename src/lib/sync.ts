import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { api, dataKeys, fetchers } from './api';
import { serverText } from './labels';

// "今すぐ同期": runs the Gmail sync for every mailbox until nothing is queued
export const useSyncNow = () => {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const mailboxes = await fetchers.mailboxes();
      if (!mailboxes.length) {
        toast.info(t('sync.noMailbox'));
        return;
      }
      let read = 0;
      for (const mb of mailboxes) {
        for (let i = 0; i < 50; i++) {
          const r = await api.post<{ read: number; queued: number; error: string | null }>(`/api/mailboxes/${mb.id}/sync`);
          read += r.read;
          if (r.error) {
            toast.error(`${mb.email}: ${serverText(r.error)}`);
            break;
          }
          if (r.queued === 0) break;
        }
      }
      toast.success(read ? t('sync.read', { count: read }) : t('sync.none'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      for (const k of dataKeys) qc.invalidateQueries({ queryKey: k });
    }
  };
  return { run, busy };
};
