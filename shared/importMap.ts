import type { ImportRow } from './types';

// Excel headers → fields. Any header layout works: each column goes to the field
// whose alias it contains, the longest alias winning ("お問い合わせURL" is the
// contact page, not the site URL).

export type ImportField = keyof ImportRow;

export const importFields: { key: ImportField; label: string; required?: boolean; aliases: string[] }[] = [
  { key: 'company', label: '会社名', aliases: ['会社名', '企業名', '社名', '店舗名', '屋号', '名称', '会社', 'company', 'name'] },
  { key: 'url', label: 'サイトURL', required: true, aliases: ['サイトurl', 'url', 'ホームページ', 'hp', 'webサイト', 'ウェブサイト', 'website', 'サイト', 'domain', 'ドメイン'] },
  { key: 'industry', label: '業種', aliases: ['業種', '業界', 'industry', '事業内容'] },
  { key: 'category', label: '営業カテゴリ（A〜D）', aliases: ['営業カテゴリ', 'カテゴリ', 'カテゴリー', '区分', 'テンプレ', 'category'] },
  { key: 'contact_url', label: '問い合わせページ', aliases: ['問い合わせurl', '問い合わせ', '問合せ', 'お問合せ', 'フォームurl', 'フォーム', 'contact', 'form', 'inquiry'] },
  { key: 'contact_email', label: 'メールアドレス', aliases: ['メールアドレス', 'メール', 'email', 'e-mail', 'mail'] },
  { key: 'phone', label: '電話番号', aliases: ['電話番号', '電話', 'tel', 'phone'] },
  { key: 'person', label: '担当者', aliases: ['担当者', '担当', '代表者', '氏名', 'person'] },
  { key: 'notes', label: '備考', aliases: ['備考', 'メモ', 'notes', 'note', 'コメント'] },
  { key: 'status', label: 'ステータス', aliases: ['ステータス', '状態', '状況', 'status'] }
];

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_・:：()（）【】\[\]]/g, '');

// headers → { field: column index }
export const guessMapping = (headers: unknown[]): Partial<Record<ImportField, number>> => {
  const claims: { field: ImportField; col: number; score: number }[] = [];
  headers.forEach((h, col) => {
    const header = norm(h);
    if (!header) return;
    for (const f of importFields) {
      for (const alias of f.aliases) {
        const a = norm(alias);
        if (header === a) claims.push({ field: f.key, col, score: 100 + a.length });
        else if (header.includes(a)) claims.push({ field: f.key, col, score: a.length });
      }
    }
  });
  // Best claims first; each column and each field used once
  claims.sort((x, y) => y.score - x.score);
  const mapping: Partial<Record<ImportField, number>> = {};
  const usedCols = new Set<number>();
  for (const c of claims) {
    if (mapping[c.field] !== undefined || usedCols.has(c.col)) continue;
    mapping[c.field] = c.col;
    usedCols.add(c.col);
  }
  return mapping;
};

const cell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).normalize('NFKC').trim();
};

export const applyMapping = (row: unknown[], mapping: Partial<Record<ImportField, number>>): ImportRow => {
  const get = (f: ImportField) => (mapping[f] === undefined ? '' : cell(row[mapping[f]!]));
  return {
    company: get('company'),
    url: get('url'),
    industry: get('industry'),
    category: get('category'),
    contact_url: get('contact_url'),
    contact_email: get('contact_email'),
    phone: get('phone'),
    person: get('person'),
    notes: get('notes'),
    status: get('status')
  };
};

// The header row is the first row with at least two non-empty cells
export const findHeaderRow = (rows: unknown[][]) => {
  const i = rows.findIndex(r => r.filter(c => cell(c)).length >= 2);
  return i < 0 ? 0 : i;
};

// Columns of the downloadable template (営業リスト_テンプレート.xlsx)
export const templateHeaders = ['会社名', 'サイトURL', '業種', '営業カテゴリ（A〜D・空欄で自動）', '問い合わせURL', 'メールアドレス', '電話番号', '担当者', '備考'];
export const templateExample = [
  ['株式会社サンプル不動産', 'https://example.co.jp', '不動産', '', 'https://example.co.jp/contact', 'info@example.co.jp', '03-0000-0000', '', ''],
  ['サンプル工業株式会社', 'example-kogyo.jp', '製造', 'B', '', '', '', '', 'FAX注文あり']
];
