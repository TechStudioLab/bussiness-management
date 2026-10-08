import { categoryOf } from '@shared/statuses';
import type { MessageKind, Status, Template } from '@shared/types';
import { getLocale, t, type MessageKey } from '@/i18n';

// Display labels for values that are stored in Japanese (D1, shared/ rules) or
// come from the Worker. The stored values never change; only what is shown does.

export const statusLabel = (s: Status) => t(`status.${s}` as MessageKey);
export const statusHint = (s: Status) => t(`status.${s}.hint` as MessageKey);

export const categoryLabel = (c: string) => (categoryOf(c) ? t(`category.${c}` as MessageKey) : c);
export const categoryShort = (c: string) => (categoryOf(c) ? t(`category.${c}.short` as MessageKey) : c);
export const categoryFull = (c: string) => `${categoryOf(c)?.letter ?? ''} ${categoryLabel(c)}`.trim();

export const kindLabel = (k: MessageKind) => t(`kind.${k}` as MessageKey);

// Industries, platforms and fixed server values → English
const enValues: Record<string, string> = {
  不動産: 'Real estate',
  人材: 'Staffing',
  士業: 'Professional services',
  '広告・制作': 'Advertising & creative',
  製造: 'Manufacturing',
  建設: 'Construction',
  '運送・物流': 'Transport & logistics',
  '卸・小売': 'Wholesale & retail',
  'EC・通販': 'E-commerce',
  飲食: 'Food & beverage',
  '美容・サロン': 'Beauty & salons',
  '医療・介護': 'Healthcare',
  教育: 'Education',
  IT: 'IT',
  その他: 'Other',
  カラーミー: 'Color Me Shop',
  ペライチ: 'Peraichi',
  不明: 'Unknown',
  未記録: 'Not recorded',
  インポート: 'Import',
  営業お断りの表記: 'No-solicitation notice',
  営業お断りの表記があります: 'The site has a no-solicitation notice',
  HTMLではありません: 'Not an HTML page',
  '応答がありません（8秒）': 'No response (8 s)'
};

/** A stored value (industry, platform, …) in the current language; unknown values as written. */
export const valueLabel = (v: string) => (getLocale() === 'en' ? (enValues[v] ?? v) : v);

// Built-in template names (shared/templates.ts) → English
const variantNames: Record<string, string> = { '1': 'Problem', '2': 'Case study', '3': 'Short' };
export const templateLabel = (tpl: Pick<Template, 'key' | 'label'> | undefined, fallback = '') => {
  if (!tpl) return valueLabel(fallback);
  if (getLocale() !== 'en') return tpl.label;
  const m = /^([abcd])(1|2|3|500|200)$/.exec(tpl.key);
  if (m) {
    const letter = m[1].toUpperCase();
    return variantNames[m[2]] ? `${letter}-${m[2]} ${variantNames[m[2]]}` : `${letter} ${m[2]} chars`;
  }
  if (tpl.key === 'followup') return 'Follow-up (no reply, once only)';
  if (tpl.key === 'sig-form') return 'Signature (contact forms)';
  if (tpl.key === 'sig-mail') return 'Signature (email, with legal notice)';
  return tpl.label;
};

// Worker error messages (worker/*.ts) → English
const enErrors: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^メールアドレスが正しくありません$/, () => 'The email address is not valid'],
  [/^自分自身は削除できません$/, () => "You can't remove yourself"],
  [/^サーバーでエラーが発生しました$/, () => 'A server error occurred'],
  [/^Googleとの接続が切れました。設定から再接続してください。$/, () => 'The Google connection was lost. Reconnect it in Settings.'],
  [/^URLが正しくありません: (.*)$/, m => `Invalid URL: ${m[1]}`],
  [/^URLが正しくありません$/, () => 'The URL is not valid'],
  [/^URLがありません$/, () => 'No URL'],
  [/^このサイトはすでに登録されています$/, () => 'This site is already in the list'],
  [/^このドメインは別のサイトとして登録されています$/, () => 'This domain is already registered as another site'],
  [/^カテゴリが正しくありません$/, () => 'Invalid category'],
  [/^ステータスが正しくありません$/, () => 'Invalid status'],
  [/^除外ドメイン: (.*)$/, m => `Excluded domain: ${m[1]}`]
];

export const serverText = (msg: string) => {
  if (getLocale() !== 'en') return msg;
  for (const [re, fn] of enErrors) {
    const m = msg.match(re);
    if (m) return fn(m);
  }
  return valueLabel(msg);
};
