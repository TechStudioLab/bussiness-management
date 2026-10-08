import type { Category, Status } from './types';

export const statuses: { key: Status; label: string; hint: string; tone: string }[] = [
  { key: 'new', label: '未着手', hint: 'まだ送っていない', tone: 'slate' },
  { key: 'sent', label: '送信済み', hint: 'フォームかメールで送った', tone: 'blue' },
  { key: 'replied', label: '返信あり', hint: '相手から返信が来た', tone: 'amber' },
  { key: 'completed', label: '営業完了', hint: '商談・見積へ進んだ', tone: 'violet' },
  { key: 'won', label: '成約', hint: '受注が決まった', tone: 'green' },
  { key: 'pending', label: '営業保留', hint: '時期を見て再開', tone: 'orange' },
  { key: 'suspended', label: '営業停止', hint: '送らない（お断り・対象外）', tone: 'red' }
];

export const statusLabel = (s: Status) => statuses.find(x => x.key === s)?.label ?? s;
export const isStatus = (s: unknown): s is Status => statuses.some(x => x.key === s);

// Statuses the system may move forward on its own (sync, "フォーム送信済み");
// anything a person set (完了・成約・保留・停止) is never overridden
const order: Status[] = ['new', 'sent', 'replied'];
export const autoAdvance = (current: Status, next: 'sent' | 'replied'): Status => {
  const i = order.indexOf(current);
  if (i < 0) return current;
  return order.indexOf(next) > i ? next : current;
};

// Outreach categories = the four template families (A–D)
export const categories: { key: Category; letter: string; label: string; short: string }[] = [
  { key: 'ai', letter: 'A', label: 'AI活用・業務自動化', short: 'AI・自動化' },
  { key: 'system', letter: 'B', label: '紙・Excel業務のシステム化', short: 'システム化' },
  { key: 'app', letter: 'C', label: 'スマホアプリ', short: 'アプリ' },
  { key: 'ec', letter: 'D', label: 'ECサイト', short: 'EC' }
];
export const categoryOf = (c: string) => categories.find(x => x.key === c);
export const isCategory = (c: unknown): c is Category => categories.some(x => x.key === c);

export const industries = [
  '不動産',
  '人材',
  '士業',
  '広告・制作',
  '製造',
  '建設',
  '運送・物流',
  '卸・小売',
  'EC・通販',
  '飲食',
  '美容・サロン',
  '医療・介護',
  '教育',
  'IT',
  'その他'
] as const;

export const platforms = ['Shopify', 'MakeShop', 'EC-CUBE', 'BASE', 'STORES', 'futureshop', 'カラーミー', 'WordPress', 'Wix', 'STUDIO', 'Jimdo', 'ペライチ'];
export const cartPlatforms = new Set(['Shopify', 'MakeShop', 'EC-CUBE', 'BASE', 'STORES', 'futureshop', 'カラーミー']);
