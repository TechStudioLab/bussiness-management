import { describe, expect, it } from 'vitest';
import { categoryFor, detectPlatform, findNoSales, hasAppLink, industryFromText, normalizeIndustry, parseCategory } from '@shared/classify';
import { domainCandidates, domainMatches, domainOf, normalizeUrl, parseAddresses } from '@shared/domain';
import { applyMapping, findHeaderRow, guessMapping } from '@shared/importMap';
import { classifyIncoming } from '@shared/mail';
import { autoAdvance } from '@shared/statuses';
import { charCount, fillTemplate, seedTemplates } from '@shared/templates';

describe('domain', () => {
  it('normalizes URLs written in many ways', () => {
    expect(normalizeUrl('example.co.jp')).toBe('https://example.co.jp/');
    expect(normalizeUrl(' https://www.Example.co.jp/about#top ')).toBe('https://www.example.co.jp/about');
    expect(normalizeUrl('http://shop.example.jp')).toBe('http://shop.example.jp/');
    expect(normalizeUrl('not a url')).toBe('');
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('mailto:a@b.jp')).toBe('');
  });
  it('keys sites by host without www', () => {
    expect(domainOf('https://www.example.co.jp/x')).toBe('example.co.jp');
    expect(domainOf('https://shop.example.co.jp/')).toBe('shop.example.co.jp');
  });
  it('matches mail domains to site domains both ways', () => {
    expect(domainMatches('example.co.jp', 'example.co.jp')).toBe(true);
    expect(domainMatches('mail.example.co.jp', 'example.co.jp')).toBe(true);
    expect(domainMatches('example.co.jp', 'shop.example.co.jp')).toBe(true);
    expect(domainMatches('other.co.jp', 'example.co.jp')).toBe(false);
    expect(domainMatches('co.jp', 'example.co.jp')).toBe(true); // callers never pass bare suffixes
  });
  it('lists lookup candidates without bare suffixes', () => {
    expect(domainCandidates('mail.example.co.jp')).toEqual(['mail.example.co.jp', 'example.co.jp']);
    expect(domainCandidates('example.com')).toEqual(['example.com']);
    expect(domainCandidates('a.b.example.jp')).toEqual(['a.b.example.jp', 'b.example.jp', 'example.jp']);
  });
  it('parses address headers', () => {
    expect(parseAddresses('山田 <Info@Example.co.jp>, b@x.jp, info@example.co.jp')).toEqual(['info@example.co.jp', 'b@x.jp']);
  });
});

describe('classification', () => {
  it('finds the industry from free text', () => {
    expect(industryFromText('税理士事務所')).toBe('士業');
    expect(industryFromText('賃貸管理・売買仲介')).toBe('不動産');
    expect(industryFromText('金属加工')).toBe('製造');
    expect(industryFromText('ネイルサロン')).toBe('美容・サロン');
    expect(industryFromText('アパレルのEC運営')).toBe('EC・通販');
    expect(industryFromText('ECOな暮らし')).toBe(null);
    expect(industryFromText('')).toBe(null);
  });
  it('keeps unknown industries as written', () => {
    expect(normalizeIndustry('製造')).toBe('製造');
    expect(normalizeIndustry('人材派遣業')).toBe('人材');
    expect(normalizeIndustry('宇宙開発')).toBe('宇宙開発');
    expect(normalizeIndustry('')).toBe('');
  });
  it('chooses the outreach category', () => {
    expect(categoryFor({ industry: 'その他', platform: 'Shopify', hasApp: false })).toBe('ec');
    expect(categoryFor({ industry: '飲食', platform: '', hasApp: true })).toBe('app');
    expect(categoryFor({ industry: '建設', platform: 'WordPress', hasApp: false })).toBe('system');
    expect(categoryFor({ industry: '不動産', platform: '', hasApp: false })).toBe('ai');
    expect(categoryFor({ industry: 'その他', platform: '', hasApp: false, text: 'FAX注文書はこちら' })).toBe('system');
  });
  it('reads the category column', () => {
    expect(parseCategory('B')).toBe('system');
    expect(parseCategory('ｄ')).toBe('ec');
    expect(parseCategory('アプリ')).toBe('app');
    expect(parseCategory('AI・自動化')).toBe('ai');
    expect(parseCategory('')).toBe(null);
    expect(parseCategory('xyz')).toBe(null);
  });
  it('detects site platforms and app links', () => {
    expect(detectPlatform('<script src="//cdn.shopify.com/s/x.js">')).toBe('Shopify');
    expect(detectPlatform('<link href="/wp-content/themes/a.css">')).toBe('WordPress');
    expect(detectPlatform('<img src="https://static.wixstatic.com/a.png">')).toBe('Wix');
    expect(detectPlatform('<html></html>')).toBe('');
    expect(hasAppLink('<a href="https://apps.apple.com/jp/app/id1">')).toBe(true);
    expect(hasAppLink('<a href="https://play.google.com/store/apps/details?id=a">')).toBe(true);
    expect(hasAppLink('<a href="https://apple.com">')).toBe(false);
  });
  it('finds 「営業お断り」 notices but not opening hours', () => {
    expect(findNoSales('※営業目的のお問い合わせはご遠慮ください。')).toContain('ご遠慮');
    expect(findNoSales('営業のご連絡はお断りしております')).toContain('お断り');
    expect(findNoSales('営業メールには返信いたしません。')).toContain('返信いたしません');
    expect(findNoSales('セールスのお電話はお断りします')).toContain('お断り');
    expect(findNoSales('営業時間外のお電話はご遠慮ください')).toBe('');
    expect(findNoSales('営業日は平日です。土日はお休みをいただいております')).toBe('');
    expect(findNoSales('お気軽にお問い合わせください')).toBe('');
  });
});

describe('import mapping', () => {
  it('maps common Japanese headers', () => {
    const m = guessMapping(['No', '会社名', 'サイトURL', '業種', 'お問い合わせURL', 'メールアドレス', 'TEL', '備考']);
    expect(m).toEqual({ company: 1, url: 2, industry: 3, contact_url: 4, contact_email: 5, phone: 6, notes: 7 });
  });
  it('handles English and spaced headers', () => {
    const m = guessMapping(['Company', 'Website', 'E-mail', 'Contact Form', 'Status']);
    expect(m.company).toBe(0);
    expect(m.url).toBe(1);
    expect(m.contact_email).toBe(2);
    expect(m.contact_url).toBe(3);
    expect(m.status).toBe(4);
  });
  it('builds rows and finds the header row', () => {
    const rows = [['営業リスト'], [], ['会社名', 'URL'], ['A社', 'a.jp']];
    const h = findHeaderRow(rows);
    expect(h).toBe(2);
    const m = guessMapping(rows[h]);
    expect(applyMapping(rows[3], m)).toMatchObject({ company: 'A社', url: 'a.jp', industry: '' });
  });
});

describe('incoming mail', () => {
  it('separates replies, auto-replies and bounces', () => {
    expect(classifyIncoming({ from: 'info@a.jp', subject: 'Re: 毎日の転記作業について' })).toBe('reply');
    expect(classifyIncoming({ from: 'info@a.jp', subject: 'ご連絡ありがとうございます' })).toBe('reply');
    expect(classifyIncoming({ from: 'no-reply@a.jp', subject: 'お問い合わせを受け付けました' })).toBe('auto');
    expect(classifyIncoming({ from: 'info@a.jp', subject: '【自動返信】お問い合わせありがとうございます' })).toBe('auto');
    expect(classifyIncoming({ from: 'info@a.jp', subject: 'お知らせ', autoSubmitted: 'auto-replied' })).toBe('auto');
    expect(classifyIncoming({ from: 'info@a.jp', subject: 'Re: ご提案', autoSubmitted: 'auto-replied' })).toBe('auto');
    expect(classifyIncoming({ from: 'MAILER-DAEMON@mx.a.jp', subject: 'Undelivered Mail Returned to Sender' })).toBe('bounce');
  });
});

describe('statuses', () => {
  it('only moves forward on its own', () => {
    expect(autoAdvance('new', 'sent')).toBe('sent');
    expect(autoAdvance('sent', 'replied')).toBe('replied');
    expect(autoAdvance('replied', 'sent')).toBe('replied');
    expect(autoAdvance('suspended', 'sent')).toBe('suspended');
    expect(autoAdvance('won', 'replied')).toBe('won');
    expect(autoAdvance('pending', 'replied')).toBe('pending');
  });
});

describe('templates', () => {
  const s = { senderName: '山田太郎', senderEmail: 'sales.yamada@techstudiolab.jp', lancersTitle: '認定ランサー', senderAddress: '東京都' };
  it('keeps the short versions within their limits once filled', () => {
    for (const tpl of seedTemplates.filter(x => x.variant === '500' || x.variant === '200')) {
      const text = fillTemplate(tpl.body, s);
      const crlf = charCount(text) + (text.match(/\n/g)?.length ?? 0);
      expect(crlf, tpl.key).toBeLessThanOrEqual(Number(tpl.variant));
    }
  });
  it('fills every placeholder', () => {
    for (const tpl of seedTemplates) expect(fillTemplate(tpl.body, s)).not.toMatch(/\{\{/);
  });
});
