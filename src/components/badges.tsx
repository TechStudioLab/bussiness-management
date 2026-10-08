import { categoryOf, statuses } from '@shared/statuses';
import type { MessageKind, Status } from '@shared/types';
import { useI18n } from '@/i18n';
import { categoryLabel, categoryShort, kindLabel, statusLabel } from '@/lib/labels';
import { cn } from './ui';

const tones: Record<string, string> = {
  slate: 'bg-paper text-ink-soft ring-line',
  blue: 'bg-info-soft text-info ring-info-line',
  amber: 'bg-warn-soft text-warn ring-warn-line',
  violet: 'bg-violet-soft text-violet ring-violet-line',
  green: 'bg-success-soft text-success ring-success-line',
  orange: 'bg-orange-soft text-orange ring-orange-line',
  red: 'bg-danger-soft text-danger ring-danger-line'
};

export const statusTone = (s: Status) => statuses.find(x => x.key === s)?.tone ?? 'slate';
// Solid colors for dots and the status bar; readable on both themes
export const statusDot: Record<string, string> = {
  slate: '#9ca3af',
  blue: '#0ea5e9',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  green: '#10b981',
  orange: '#f97316',
  red: '#ef4444'
};

export const StatusBadge = ({ status, className }: { status: Status; className?: string }) => {
  useI18n();
  const tone = statusTone(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusDot[tone] }} />
      {statusLabel(status)}
    </span>
  );
};

const categoryTone: Record<string, string> = {
  ai: 'bg-crimson-soft text-crimson-fg',
  system: 'bg-info-soft text-info',
  app: 'bg-violet-soft text-violet',
  ec: 'bg-warn-soft text-warn'
};

export const CategoryBadge = ({ category, full }: { category: string; full?: boolean }) => {
  useI18n();
  const c = categoryOf(category);
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium', categoryTone[category] ?? 'bg-paper text-ink-soft')}>
      <span className="font-bold">{c?.letter}</span>
      {full ? categoryLabel(category) : categoryShort(category)}
    </span>
  );
};

const kindTone: Record<MessageKind, string> = {
  sent: 'bg-info-soft text-info',
  reply: 'bg-warn-soft text-warn',
  auto: 'bg-paper text-ink-muted',
  bounce: 'bg-danger-soft text-danger'
};

export const KindBadge = ({ kind }: { kind: MessageKind }) => {
  useI18n();
  return <span className={cn('inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium', kindTone[kind])}>{kindLabel(kind)}</span>;
};
