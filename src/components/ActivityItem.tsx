import { Link } from 'react-router';
import { AlertTriangle, ArrowRight, Bot, FileSpreadsheet, Link2, Mail, MailCheck, MessageSquareText, PencilLine, Send, StickyNote } from 'lucide-react';
import type { Activity, Member, Status } from '@shared/types';
import { t, useI18n } from '@/i18n';
import { fmtAgo, fmtDateTime } from '@/lib/format';
import { serverText, statusLabel, valueLabel } from '@/lib/labels';
import { cn } from './ui';

const d = (a: Activity, k: string) => String((a.detail as Record<string, unknown>)[k] ?? '');

export const actorName = (actor: string | null, members?: Member[]) => {
  if (!actor || actor === 'system') return t('common.system');
  const m = members?.find(x => x.email === actor);
  return m?.name || actor.split('@')[0];
};

const icon = (a: Activity) => {
  switch (a.type) {
    case 'import':
      return <FileSpreadsheet className="h-3.5 w-3.5" />;
    case 'status':
      return <ArrowRight className="h-3.5 w-3.5" />;
    case 'note':
      return <StickyNote className="h-3.5 w-3.5" />;
    case 'form_sent':
    case 'followup':
      return <Send className="h-3.5 w-3.5" />;
    case 'email_sent':
      return <Mail className="h-3.5 w-3.5" />;
    case 'reply':
      return <MailCheck className="h-3.5 w-3.5" />;
    case 'auto_reply':
      return <Bot className="h-3.5 w-3.5" />;
    case 'bounce':
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case 'linked':
      return <Link2 className="h-3.5 w-3.5" />;
    default:
      return <PencilLine className="h-3.5 w-3.5" />;
  }
};

const tone = (a: Activity) =>
  a.type === 'reply'
    ? 'bg-warn-soft text-warn ring-warn-line'
    : a.type === 'form_sent' || a.type === 'email_sent' || a.type === 'followup'
      ? 'bg-info-soft text-info ring-info-line'
      : a.type === 'status' && d(a, 'to') === 'won'
        ? 'bg-success-soft text-success ring-success-line'
        : a.type === 'bounce' || (a.type === 'status' && d(a, 'to') === 'suspended')
          ? 'bg-danger-soft text-danger ring-danger-line'
          : 'bg-paper text-ink-muted ring-line';

export const activityText = (a: Activity): string => {
  switch (a.type) {
    case 'import':
      return t('act.import', { file: d(a, 'filename') || 'Excel', added: d(a, 'added') || 0, updated: d(a, 'updated') || 0 });
    case 'status': {
      const reason = d(a, 'reason');
      return `${statusLabel(d(a, 'from') as Status)} → ${statusLabel(d(a, 'to') as Status)}${(a.detail as { auto?: boolean }).auto ? t('act.auto') : ''}${reason ? t('act.reason', { reason: valueLabel(reason) }) : ''}`;
    }
    case 'note':
      return d(a, 'text');
    case 'form_sent':
      return d(a, 'templateKey') ? t('act.formSentTpl', { key: d(a, 'templateKey').toUpperCase() }) : t('act.formSent');
    case 'followup':
      return t('act.followup');
    case 'email_sent':
      return t('act.emailSent', { subject: d(a, 'subject') });
    case 'reply':
      return t('act.reply', { subject: d(a, 'subject') });
    case 'auto_reply':
      return t('act.autoReply', { subject: d(a, 'subject') });
    case 'bounce':
      return t('act.bounce', { subject: d(a, 'subject') });
    case 'linked':
      return t('act.linked', { address: d(a, 'address') });
    case 'edit':
      return t('act.edit');
    default:
      return serverText(a.type);
  }
};

export const ActivityItem = ({ a, members, showSite, action }: { a: Activity; members?: Member[]; showSite?: boolean; action?: React.ReactNode }) => {
  useI18n();
  return (
    <li className="flex gap-3 py-3">
      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset', tone(a))}>{icon(a)}</span>
      <div className="min-w-0 flex-1">
        {showSite && a.site_id && (
          <Link to={`/sites/${a.site_id}`} className="block truncate text-xs font-semibold text-ink hover:text-crimson">
            {a.company || a.domain}
          </Link>
        )}
        <p className={cn('break-words text-sm text-ink-soft', a.type === 'note' && 'whitespace-pre-wrap text-ink')}>
          {a.type === 'note' && <MessageSquareText className="mr-1 inline h-3.5 w-3.5 text-ink-muted" />}
          {activityText(a)}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted" title={fmtDateTime(a.created_at)}>
          {actorName(a.actor, members)} · {fmtAgo(a.created_at)}
        </p>
      </div>
      {action}
    </li>
  );
};
