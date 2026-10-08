// Local stand-in for Google sign-in and the Gmail API (development and tests only).
// Start: node scripts/mock-google.mjs  (port 8790), then in .dev.vars:
//   GMAIL_API_BASE=http://localhost:8790
//   GOOGLE_OAUTH_BASE=http://localhost:8790
//
// POST /_mail {from, to, subject, labelIds?, threadId?, autoSubmitted?}  adds a message
// GET  /_mail                                                              lists them
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8790);
const ACCOUNT = process.env.MOCK_EMAIL ?? 'sales@techstudiolab.jp';
const messages = [];
let historyId = 1000;
const history = [];

// Fake target sites for the site check: http://<name>.localtest.me:8790/
const fakeSites = {
  'shop-a': {
    '/': '<html><head><title>アパレル通販 SHOP A</title><meta name="description" content="オリジナルTシャツの通販サイト"><script src="//cdn.shopify.com/s/files/app.js"></script></head><body><a href="/pages/contact">お問い合わせ</a></body></html>',
    '/pages/contact': '<html><body><p>ご質問は <a href="mailto:info@shop-a.localtest.me">info@shop-a.localtest.me</a> まで</p><a href="tel:03-1234-5678">03-1234-5678</a></body></html>'
  },
  'fudosan-b': {
    '/': '<html><head><title>B不動産｜賃貸・売買仲介</title><link rel="stylesheet" href="/wp-content/themes/b/style.css"></head><body><a href="/contact/">お問い合わせ</a><p>営業時間 9:00〜18:00</p></body></html>',
    '/contact/': '<html><body><form></form><p>※営業目的のお問い合わせはご遠慮ください。</p></body></html>'
  },
  'kogyo-c': {
    '/': '<html><head><title>C工業株式会社｜金属加工・精密部品</title></head><body><p>FAX注文書はこちら</p><a href="/inquiry">お問合せ</a></body></html>',
    '/inquiry': '<html><body>お問い合わせフォーム</body></html>'
  },
  'app-d': {
    '/': '<html><head><title>D美容室</title></head><body><a href="https://apps.apple.com/jp/app/id123">公式アプリ</a></body></html>'
  }
};

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readBody = req =>
  new Promise(resolve => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => resolve(data));
  });

const addMessage = m => {
  const id = `m${(messages.length + 1).toString(16).padStart(6, '0')}`;
  historyId++;
  const msg = {
    id,
    threadId: m.threadId ?? `t${id}`,
    labelIds: m.labelIds ?? ['INBOX'],
    snippet: m.snippet ?? `${m.subject} の本文の冒頭です`,
    internalDate: String(m.date ? Date.parse(m.date) : Date.now()),
    historyId: String(historyId),
    payload: {
      headers: [
        { name: 'From', value: m.from },
        { name: 'To', value: m.to },
        { name: 'Subject', value: m.subject },
        ...(m.autoSubmitted ? [{ name: 'Auto-Submitted', value: m.autoSubmitted }] : [])
      ]
    }
  };
  messages.push(msg);
  history.push({ id: String(historyId), messagesAdded: [{ message: { id, threadId: msg.threadId, labelIds: msg.labelIds } }] });
  return msg;
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;
    const site = (req.headers.host ?? '').match(/^([\w-]+)\.localtest\.me/)?.[1];
    if (site) {
      const page = fakeSites[site]?.[p];
      res.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page ?? 'not found');
    }

    // OAuth: approve immediately and send the browser back with a code
    if (p === '/o/oauth2/v2/auth') {
      const back = new URL(url.searchParams.get('redirect_uri'));
      back.searchParams.set('code', `code-${url.searchParams.get('scope').includes('gmail') ? 'mailbox' : 'login'}-${url.searchParams.get('login_hint') ?? ''}`);
      back.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (p === '/token') {
      const body = new URLSearchParams(await readBody(req));
      if (body.get('grant_type') === 'refresh_token') return json(res, 200, { access_token: 'mock-access', expires_in: 3600 });
      const mailbox = (body.get('code') ?? '').startsWith('code-mailbox');
      return json(res, 200, {
        access_token: mailbox ? 'mock-access-mailbox' : 'mock-access-login',
        refresh_token: mailbox ? 'mock-refresh' : undefined,
        scope: mailbox ? 'openid email https://www.googleapis.com/auth/gmail.readonly' : 'openid email profile'
      });
    }
    if (p === '/userinfo') {
      const login = req.headers.authorization === 'Bearer mock-access-login';
      return json(res, 200, { email: login ? process.env.MOCK_LOGIN ?? 'owner@techstudiolab.jp' : ACCOUNT, email_verified: true, name: login ? 'オーナー' : '営業用', picture: '' });
    }

    // Test helpers
    if (p === '/_mail' && req.method === 'POST') return json(res, 200, addMessage(JSON.parse(await readBody(req))));
    if (p === '/_mail') return json(res, 200, messages);

    // Gmail API
    const base = '/gmail/v1/users/me';
    if (p === `${base}/profile`) return json(res, 200, { emailAddress: ACCOUNT, historyId: String(historyId) });
    if (p === `${base}/messages`) return json(res, 200, { messages: messages.map(m => ({ id: m.id, threadId: m.threadId })), resultSizeEstimate: messages.length });
    if (p === `${base}/history`) {
      const start = Number(url.searchParams.get('startHistoryId'));
      return json(res, 200, { history: history.filter(h => Number(h.id) > start), historyId: String(historyId) });
    }
    const one = p.match(/^\/gmail\/v1\/users\/me\/messages\/([\w]+)$/);
    if (one) {
      const m = messages.find(x => x.id === one[1]);
      return m ? json(res, 200, m) : json(res, 404, { error: 'not found' });
    }
    json(res, 404, { error: `no route ${p}` });
  })
  .listen(PORT, () => console.log(`mock google on http://localhost:${PORT}`));
