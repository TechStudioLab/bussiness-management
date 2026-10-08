import * as XLSX from 'xlsx';
import { categoryOf, statusLabel } from '@shared/statuses';
import { templateExample, templateHeaders } from '@shared/importMap';
import type { Site } from '@shared/types';

// Excel in the browser (SheetJS): reading imports, writing the template and exports

export interface Sheet {
  name: string;
  rows: unknown[][];
}

// CSV from Japanese Excel is often Shift_JIS; UTF-8 is tried first
const decodeCsv = (bytes: ArrayBuffer) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
};

export const readWorkbook = async (file: File): Promise<Sheet[]> => {
  const data = await file.arrayBuffer();
  const wb = /\.(csv|tsv|txt)$/i.test(file.name)
    ? XLSX.read(decodeCsv(data).replace(/^﻿/, ''), { type: 'string', cellDates: true })
    : XLSX.read(data, { type: 'array', cellDates: true });
  return wb.SheetNames.map(name => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '', blankrows: false, raw: false })
  }));
};

const save = (rows: unknown[][], sheet: string, filename: string, widths?: number[]) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (widths) ws['!cols'] = widths.map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, filename);
};

export const downloadTemplate = () =>
  save([templateHeaders, ...templateExample], '営業リスト', '営業リスト_テンプレート.xlsx', [26, 32, 14, 22, 36, 28, 16, 12, 24]);

const jst = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ') : '');

export const exportSites = (sites: Site[]) => {
  const header = [
    '会社名', 'サイトURL', 'ドメイン', '営業カテゴリ', '業種', 'サイトの種類', 'ステータス', '理由',
    '問い合わせURL', 'メールアドレス', '電話番号', '担当者', '送信数', '返信数', '自動返信',
    '初回送信', '最終送信', '最終返信', '成約額', '営業お断り', '備考'
  ];
  const rows = sites.map(s => [
    s.company, s.url, s.domain, `${categoryOf(s.category)?.letter} ${categoryOf(s.category)?.label}`, s.industry, s.platform,
    statusLabel(s.status), s.status_reason, s.contact_url, s.contact_email, s.phone, s.person,
    s.sent_count, s.received_count, s.auto_count, jst(s.first_sent_at), jst(s.last_sent_at), jst(s.last_reply_at),
    s.deal_amount ?? '', s.no_sales ? s.no_sales_text || 'あり' : '', s.notes
  ]);
  const day = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  save([header, ...rows], '営業リスト', `営業リスト_${day}.xlsx`, [26, 32, 22, 20, 12, 12, 10, 18, 32, 26, 14, 10, 8, 8, 8, 16, 16, 16, 10, 20, 30]);
};
