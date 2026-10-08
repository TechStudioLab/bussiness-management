// End-to-end check against a local Worker + scripts/mock-google.mjs
//   npm run dev:api   (with the mock settings in .dev.vars)
//   node scripts/mock-google.mjs
//   node scripts/smoke.mjs
// Uses the fake sites of the mock (http://<name>.localtest.me:8790/).
import assert from 'node:assert/strict';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const MOCK = process.env.MOCK ?? 'http://localhost:8790';
const site = name => `http://${name}.localtest.me:8790/`;

const jar = new Map();
const call = async (method, path, body, { origin = BASE, as = 'owner' } = {}) => {
  const headers = { cookie: jar.get(as) ?? '' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (origin) headers.origin = origin;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, res };
};
const ok = async (...args) => {
  const r = await call(...args);
  assert.ok(r.status < 400, `${args[0]} ${args[1]} → ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};

// Follow redirects by hand, keeping the session cookie
const browse = async (url, as = 'owner') => {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { headers: { cookie: jar.get(as) ?? '' }, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) jar.set(as, set.split(';')[0]);
    const loc = res.headers.get('location');
    if (!loc) return url;
    url = new URL(loc, url).toString();
  }
  return url;
};

const step = (name) => console.log(`✓ ${name}`);

// 1. Sign in (development login) and the configured owner is created
await browse(`${BASE}/auth/dev?email=owner@techstudiolab.jp`);
const me = await ok('GET', '/api/me');
assert.equal(me.role, 'owner');
step('owner signs in');

assert.equal((await call('GET', '/api/me', undefined, { as: 'nobody' })).status, 401);
step('no session → 401');

// 2. Import
const rows = [
  { company: 'SHOP A', url: site('shop-a'), industry: '', category: '', contact_url: '', contact_email: '', phone: '', person: '', notes: '', status: '' },
  { company: 'B不動産', url: site('fudosan-b'), industry: '', category: '', contact_url: '', contact_email: '', phone: '', person: '', notes: '', status: '' },
  { company: 'C工業', url: site('kogyo-c'), industry: '製造業', category: '', contact_url: '', contact_email: '', phone: '', person: '', notes: '', status: '' },
  { company: 'D美容室', url: site('app-d'), industry: '', category: '', contact_url: '', contact_email: '', phone: '', person: '', notes: 'Excelの備考', status: '' },
  { company: '重複', url: site('shop-a'), industry: '', category: '', contact_url: '', contact_email: '', phone: '', person: '', notes: '', status: '' },
  { company: '自社', url: 'https://techstudiolab.jp', industry: '', category: '', contact_url: '', contact_email: '', phone: '', person: '', notes: '', status: '' },
  { company: '壊れたURL', url: 'not a url', industry: '', category: '', contact_url: '', contact_email: '', phone: '', person: '', notes: '', status: '' }
];
const preview = await ok('POST', '/api/sites/import/preview', { domains: ['shop-a.localtest.me'] });
assert.deepEqual(preview.existing, {});
const imp = await ok('POST', '/api/sites/import', { filename: 'test.xlsx', rows, mode: 'update', last: true });
assert.equal(imp.added, 4);
assert.equal(imp.skipped, 2); // duplicate row + own domain
assert.equal(imp.errors.length, 2); // own domain + broken URL
step('import: 4 added, duplicate and own domain skipped, broken URL reported');

// Re-import updates instead of duplicating
const again = await ok('POST', '/api/sites/import', { filename: 'again.xlsx', rows: rows.slice(0, 1), mode: 'update', last: true });
assert.equal(again.updated, 1);
assert.equal(again.added, 0);
step('re-import updates the existing row');

// 3. Site check
const list0 = await ok('GET', '/api/sites?sort=created&order=asc');
const id = Object.fromEntries(list0.items.map(s => [s.domain.split('.')[0], s.id]));
await ok('POST', '/api/sites/analyze', { ids: Object.values(id) });
const byName = async () => Object.fromEntries((await ok('GET', '/api/sites')).items.map(s => [s.domain.split('.')[0], s]));
let s = await byName();
assert.equal(s['shop-a'].platform, 'Shopify');
assert.equal(s['shop-a'].category, 'ec');
assert.equal(s['shop-a'].contact_email, 'info@shop-a.localtest.me');
assert.equal(s['shop-a'].phone, '03-1234-5678');
assert.match(s['shop-a'].contact_url, /\/pages\/contact$/);
assert.equal(s['fudosan-b'].status, 'suspended');
assert.equal(s['fudosan-b'].no_sales, 1);
assert.equal(s['fudosan-b'].industry, '不動産');
assert.equal(s['fudosan-b'].platform, 'WordPress');
assert.equal(s['kogyo-c'].industry, '製造');
assert.equal(s['kogyo-c'].category, 'system');
assert.equal(s['app-d'].category, 'app');
assert.equal(s['app-d'].industry, '美容・サロン');
step('site check: platform, contact, 営業お断り → 営業停止, categories');

// 4. Connect the mailbox (mock OAuth) and sync
const landed = await browse(`${BASE}/auth/mailbox`);
assert.match(landed, /mailbox=connected/);
const mailboxes = await ok('GET', '/api/mailboxes');
assert.equal(mailboxes[0].email, 'sales@techstudiolab.jp');
step('mailbox connected through OAuth');

const mail = m => fetch(`${MOCK}/_mail`, { method: 'POST', body: JSON.stringify(m) }).then(r => r.json());
const out = await mail({ from: 'sales@techstudiolab.jp', to: 'SHOP A <info@shop-a.localtest.me>', subject: 'ECサイトの改修のご提案', labelIds: ['SENT'] });
await mail({ from: 'info@shop-a.localtest.me', to: 'sales@techstudiolab.jp', subject: 'Re: ECサイトの改修のご提案', threadId: out.threadId });
await mail({ from: 'no-reply@kogyo-c.localtest.me', to: 'sales@techstudiolab.jp', subject: 'お問い合わせを受け付けました' });
const stray = await mail({ from: 'tanaka.c@gmail.com', to: 'sales@techstudiolab.jp', subject: 'Re: 紙・Excelの入力作業を減らすご提案' });
await mail({ from: 'owner@techstudiolab.jp', to: 'sales@techstudiolab.jp', subject: '社内連絡' });

let sync = await ok('POST', `/api/mailboxes/${mailboxes[0].id}/sync`, {});
while (sync.queued > 0) sync = await ok('POST', `/api/mailboxes/${mailboxes[0].id}/sync`, {});
assert.equal(sync.error, null);
s = await byName();
assert.equal(s['shop-a'].sent_count, 1);
assert.equal(s['shop-a'].received_count, 1);
assert.equal(s['shop-a'].status, 'replied');
assert.equal(s['kogyo-c'].auto_count, 1);
assert.equal(s['kogyo-c'].received_count, 0);
assert.equal(s['kogyo-c'].status, 'new');
step('sync: sent + reply matched by domain and thread; auto-reply kept apart; internal mail ignored');

const unmatched = await ok('GET', '/api/messages?filter=unmatched');
assert.equal(unmatched.length, 1);
assert.equal(unmatched[0].id, stray.id);
await ok('POST', `/api/messages/${stray.id}/link`, { siteId: id['kogyo-c'] });
s = await byName();
assert.equal(s['kogyo-c'].received_count, 1);
assert.equal(s['kogyo-c'].status, 'replied');
assert.equal((await ok('GET', '/api/messages?filter=unmatched')).length, 0);
step('unmatched reply linked by hand; sender remembered');

// Incremental sync (history) and the remembered address
await mail({ from: 'tanaka.c@gmail.com', to: 'sales@techstudiolab.jp', subject: '追加の質問です' });
sync = await ok('POST', `/api/mailboxes/${mailboxes[0].id}/sync`, {});
s = await byName();
assert.equal(s['kogyo-c'].received_count, 2);
step('incremental sync uses the remembered address');

// 5. Form send, status changes, deal
await ok('POST', `/api/sites/${id['app-d']}/sent`, { templateKey: 'c1', channel: 'form' });
s = await byName();
assert.equal(s['app-d'].status, 'sent');
assert.equal(s['app-d'].sent_count, 1);
assert.equal(s['app-d'].template_key, 'c1');
await ok('PATCH', `/api/sites/${id['shop-a']}`, { status: 'won', deal_amount: 300000 });
await ok('PATCH', `/api/sites/${id['kogyo-c']}`, { status: 'completed', notes: '見積もり送付済み' });
s = await byName();
assert.equal(s['shop-a'].status, 'won');
assert.ok(s['shop-a'].won_at);
step('form send, 成約 with amount, 営業完了');

// Automatic changes never override a manual status
await mail({ from: 'info@shop-a.localtest.me', to: 'sales@techstudiolab.jp', subject: 'Re: 追加のお願い', threadId: out.threadId });
await ok('POST', `/api/mailboxes/${mailboxes[0].id}/sync`, {});
s = await byName();
assert.equal(s['shop-a'].status, 'won');
assert.equal(s['shop-a'].received_count, 2);
step('a new reply does not move 成約 back');

// 6. Detail and stats
const detail = await ok('GET', `/api/sites/${id['shop-a']}`);
assert.equal(detail.messages.length, 3);
assert.ok(detail.activities.some(a => a.type === 'status' && a.detail.to === 'won'));
const stats = await ok('GET', '/api/stats?days=30');
assert.equal(stats.totals.sites, 4);
assert.equal(stats.totals.sentSites, 2);
assert.equal(stats.totals.repliedSites, 1); // C工業 replied without being sent to: not counted
assert.equal(stats.totals.won, 1);
assert.equal(stats.totals.completed, 2);
assert.equal(stats.totals.funnelCompleted, 1); // only SHOP A was sent to
assert.equal(stats.totals.funnelWon, 1);
assert.equal(stats.totals.wonAmount, 300000);
assert.equal(stats.totals.noSales, 1);
assert.equal(stats.month.goal, 1000);
assert.equal(stats.daily.length, 30);
assert.equal(stats.daily.at(-1).sent, 2);
assert.ok(stats.byCategory.find(r => r.key === 'ec').won === 1);
step('detail timeline and dashboard numbers');

// 7. Templates and settings
const templates = await ok('GET', '/api/templates');
assert.equal(templates.length, 23);
await ok('PUT', '/api/settings', { senderName: '山田', monthlyGoal: 800, excludedDomains: ['https://www.competitor.jp/'] });
const settings = await ok('GET', '/api/settings');
assert.equal(settings.monthlyGoal, 800);
assert.deepEqual(settings.excludedDomains, ['competitor.jp']);
step('templates seeded; settings saved and cleaned');

// 8. Permissions
await ok('POST', '/api/members', { email: 'agent@techstudiolab.jp', role: 'agent' });
await browse(`${BASE}/auth/dev?email=agent@techstudiolab.jp`, 'agent');
assert.equal((await ok('GET', '/api/me', undefined, { as: 'agent' })).role, 'agent');
assert.equal((await call('DELETE', `/api/sites/${id['app-d']}`, undefined, { as: 'agent' })).status, 403);
assert.equal((await call('PUT', '/api/settings', { monthlyGoal: 1 }, { as: 'agent' })).status, 403);
await ok('POST', `/api/sites/${id['app-d']}/notes`, { text: '担当者不在、来週再送' }, { as: 'agent' });
assert.equal((await call('POST', `/api/sites/${id['app-d']}/notes`, { text: 'x' }, { origin: 'https://evil.example' })).status, 403);
assert.equal((await call('POST', `/api/sites/${id['app-d']}/notes`, { text: 'x' }, { origin: null })).status, 403);
assert.equal((await call('GET', '/auth/dev?email=stranger@gmail.com', undefined, { as: 'x' })).status, 403);
const members = await ok('GET', '/api/stats?days=7', undefined, { as: 'agent' });
assert.ok(members.byMember.some(m => m.key === 'agent@techstudiolab.jp'));
step('agent limits, origin check, non-members refused');

// 9. Next-path safety on login
const evil = await call('GET', '/auth/dev?email=owner@techstudiolab.jp&next=//evil.example', undefined, { as: 'y' });
assert.equal(evil.res.headers.get('location'), '/');
step('login never redirects off-site');

console.log('\nall checks passed');
