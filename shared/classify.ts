import type { Category } from './types';
import { cartPlatforms, industries } from './statuses';

// Automatic classification of a target site (docs/DESIGN.md §6)

// Industry by keywords in the Excel column or the site title / description.
// Order matters: the first match wins, most specific first.
const industryRules: [string, RegExp][] = [
  ['医療・介護', /病院|クリニック|医院|歯科|介護|訪問看護|薬局|整骨|接骨|鍼灸|福祉|デイサービス/],
  ['士業', /税理士|会計事務所|社労士|社会保険労務士|行政書士|司法書士|弁護士|法律事務所|弁理士|特許事務所|中小企業診断士|士業/],
  ['不動産', /不動産|賃貸|売買仲介|物件|マンション管理|住宅販売|分譲|土地活用/],
  ['人材', /人材|派遣|職業紹介|求人|採用支援|転職/],
  ['建設', /建設|工務店|リフォーム|建築|土木|設備工事|電気工事|塗装|内装|解体|外構|住宅会社|ハウスメーカー/],
  ['運送・物流', /運送|物流|配送|倉庫|運輸|引越|トラック|ロジスティクス/],
  ['製造', /製造|メーカー|工場|加工|金属|部品|製作所|鉄工|樹脂|精密|機械/],
  ['EC・通販', /通販|ネットショップ|オンラインショップ|オンラインストア|(^|[^A-Za-z])EC([^A-Za-z]|$)|Eコマース|D2C/i],
  ['卸・小売', /卸|商社|小売|販売店|問屋|専門店/],
  ['飲食', /飲食|レストラン|カフェ|居酒屋|ラーメン|焼肉|寿司|ベーカリー|パン屋|食堂|ダイニング/],
  ['美容・サロン', /美容|サロン|ヘアー?|ネイル|エステ|まつげ|脱毛|理容|整体|リラクゼーション/],
  ['教育', /学習塾|進学塾|スクール|教室|予備校|学校|保育|幼稚園|英会話|家庭教師/],
  ['広告・制作', /広告|制作会社|デザイン|映像|印刷|マーケティング|プロモーション|Web制作|ホームページ制作|PR会社/i],
  ['IT', /システム開発|ソフトウェア|SaaS|情報システム|ITサービス|IT企業|アプリ開発|受託開発|DX支援/i]
];

export const industryFromText = (text: string): string | null => {
  const t = (text ?? '').normalize('NFKC');
  for (const [industry, re] of industryRules) if (re.test(t)) return industry;
  return null;
};

// Excel value → one of the normalized industries; unknown values are kept as written
export const normalizeIndustry = (raw: string): string => {
  const s = (raw ?? '').normalize('NFKC').trim();
  if (!s) return '';
  if ((industries as readonly string[]).includes(s)) return s;
  return industryFromText(s) ?? s.slice(0, 30);
};

export const categoryFor = (a: { industry: string; platform: string; hasApp: boolean; text?: string }): Category => {
  const text = `${a.industry} ${a.text ?? ''}`.normalize('NFKC');
  if (cartPlatforms.has(a.platform) || a.industry === 'EC・通販') return 'ec';
  if (a.hasApp || /アプリ/.test(a.industry)) return 'app';
  if (['製造', '建設', '運送・物流', '卸・小売'].includes(a.industry)) return 'system';
  if (/FAX|ファックス|受発注|工程管理/.test(text)) return 'system';
  return 'ai';
};

// Excel "営業カテゴリ" column: A–D, the key, or the label
export const parseCategory = (raw: string): Category | null => {
  const s = (raw ?? '').normalize('NFKC').trim().toLowerCase();
  if (!s) return null;
  if (/^a$|^ai|自動化|業務効率/.test(s)) return 'ai';
  if (/^b$|^system|システム|excel|紙/.test(s)) return 'system';
  if (/^c$|^app|アプリ/.test(s)) return 'app';
  if (/^d$|^ec|通販|ショップ/.test(s)) return 'ec';
  return null;
};

// Site platform from the page HTML (lower-cased)
const platformSignatures: [string, RegExp][] = [
  ['Shopify', /cdn\.shopify\.com|myshopify\.com|shopify\.theme/],
  ['MakeShop', /makeshop\.jp|makeshop-multi-images|gigaplus\.makeshop/],
  ['EC-CUBE', /ec-cube|eccube|\/html\/user_data\//],
  ['BASE', /thebase\.in|base\.shop|baseec-img-mng|static\.thebase/],
  ['STORES', /stores\.jp|storesjp/],
  ['futureshop', /futureshop\.jp|future-shop/],
  ['カラーミー', /shop-pro\.jp|colorme/],
  ['WordPress', /wp-content|wp-includes/],
  ['Wix', /wixstatic\.com|static\.wix|wix\.com/],
  ['STUDIO', /studio\.design|studio\.site|studiocdn/],
  ['Jimdo', /jimdo|jimcdn\.com/],
  ['ペライチ', /peraichi/]
];

export const detectPlatform = (html: string): string => {
  const h = html.toLowerCase();
  for (const [name, re] of platformSignatures) if (re.test(h)) return name;
  return '';
};

export const hasAppLink = (html: string) => /apps\.apple\.com|itunes\.apple\.com\/[^"']*app|play\.google\.com\/store\/apps/i.test(html);

// 「営業お断り」 and similar notices. Returns the matched sentence, or ''.
// "営業" followed by 時間 / 日 / 所 etc. is about opening hours, not sales.
const noSalesPatterns: RegExp[] = [
  /営業(?!時間|日|所|部|中|カレンダー|担当|拠点|エリア|品目|許可)[^。\n]{0,16}?(お断り|ご遠慮|お控え|受け付けて(おりません|いません)|お受けして(おりません|いません)|お受けできません|返信(いたしません|しておりません|しません|できません|は(いたしかねます|致しかねます))|ご返答(いたしかねます|できません)|対応(いたしかねます|致しかねます|しておりません|できません))/,
  /(セールス|売り込み|勧誘|広告|宣伝)[^。\n]{0,12}?(お断り|ご遠慮|お控え|受け付けて(おりません|いません)|お受けして(おりません|いません))/
];

export const findNoSales = (text: string): string => {
  const t = (text ?? '').normalize('NFKC').replace(/\s+/g, ' ');
  for (const re of noSalesPatterns) {
    const m = re.exec(t);
    if (m) {
      const start = Math.max(0, m.index - 20);
      return t.slice(start, m.index + m[0].length + 10).trim();
    }
  }
  return '';
};

// A link that probably leads to the contact form
export const isContactLink = (href: string, text: string) =>
  /お問い?合わ?せ|問合せ|問い合せ|コンタクト|ご相談|資料請求/.test(text) || /contact|inquiry|toiawase|otoiawase|form/i.test(href);
