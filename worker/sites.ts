import { Hono } from 'hono';
import { normalizeIndustry, parseCategory } from '../shared/classify';
import { domainOf, isValidEmail, normalizeUrl } from '../shared/domain';
import { isCategory, isStatus, statuses } from '../shared/statuses';
import type { Activity, ImportResult, ImportRow, Message, Site, Status } from '../shared/types';
import { analyzeSite } from './analyze';
import { requireOwner } from './auth';
import type { AppEnv, Env } from './env';
import { rematchUnlinked } from './gmail';
import { getSettings, logActivity, recountSite } from './store';
import { clampInt, nowIso, parseJson } from './util';

export const sites = new Hono<AppEnv>();

// ── List ─────────────────────────────────────────────────────────────

const sortable: Record<string, string> = {
  updated: 'updated_at',
  created: 'id',
  company: 'company',
  status: 'status',
  sent: 'last_sent_at',
  reply: 'last_reply_at',
  received: 'received_count'
};

sites.get('/', async c => {
  const q = c.req.query();
  const where: string[] = [];
  const args: unknown[] = [];
  if (q.q) {
    where.push('(company like ? or domain like ? or title like ? or notes like ?)');
    const like = `%${q.q.trim()}%`;
    args.push(like, like, like, like);
  }
  for (const key of ['status', 'category', 'industry', 'platform'] as const) {
    if (!q[key]) continue;
    const values = q[key].split(',').filter(Boolean);
    where.push(`${key} in (${values.map(() => '?').join(',')})`);
    args.push(...values);
  }
  if (q.noSales === '1') where.push('no_sales = 1');
  if (q.noSales === '0') where.push('no_sales = 0');
  if (q.unchecked === '1') where.push('analyzed_at is null');
  if (q.importId) {
    where.push('import_id = ?');
    args.push(Number(q.importId));
  }
  if (q.followup === '1') {
    const s = await getSettings(c.env);
    where.push("status = 'sent' and first_reply_at is null and followups = 0 and last_sent_at < ?");
    args.push(new Date(Date.now() - s.followupDays * 86_400_000).toISOString());
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const sort = sortable[q.sort] ?? 'updated_at';
  const dir = q.order === 'asc' ? 'asc' : 'desc';
  const all = q.all === '1';
  const pageSize = all ? 10_000 : clampInt(q.pageSize, 10, 200, 50);
  const page = all ? 1 : clampInt(q.page, 1, 100_000, 1);

  const [rows, total, facets] = await c.env.DB.batch([
    c.env.DB.prepare(`select * from sites ${whereSql} order by ${sort} ${dir} nulls last, id desc limit ? offset ?`).bind(
      ...args,
      pageSize,
      (page - 1) * pageSize
    ),
    c.env.DB.prepare(`select count(*) as n from sites ${whereSql}`).bind(...args),
    c.env.DB.prepare(
      `select 'industry' as f, industry as v, count(*) as n from sites group by industry
       union all select 'platform', platform, count(*) from sites where platform != '' group by platform`
    )
  ]);
  const f = facets.results as { f: string; v: string; n: number }[];
  return c.json({
    items: rows.results as unknown as Site[],
    total: (total.results[0] as { n: number }).n,
    page,
    pageSize,
    facets: {
      industries: f.filter(x => x.f === 'industry').map(x => ({ value: x.v, count: x.n })),
      platforms: f.filter(x => x.f === 'platform').map(x => ({ value: x.v, count: x.n }))
    }
  });
});

// ── One site with its mail and timeline ─────────────────────────────

sites.get('/:id{[0-9]+}', async c => {
  const id = Number(c.req.param('id'));
  const [site, messages, activities, mailboxes] = await c.env.DB.batch([
    c.env.DB.prepare('select * from sites where id = ?').bind(id),
    c.env.DB.prepare(
      'select m.*, b.email as mailbox_email from messages m left join mailboxes b on b.id = m.mailbox_id where m.site_id = ? order by m.sent_at desc limit 200'
    ).bind(id),
    c.env.DB.prepare('select * from activities where site_id = ? order by created_at desc, id desc limit 200').bind(id),
    c.env.DB.prepare('select address from site_addresses where site_id = ?').bind(id)
  ]);
  if (!site.results.length) return c.json({ error: 'not found' }, 404);
  return c.json({
    site: site.results[0] as unknown as Site,
    messages: messages.results as unknown as Message[],
    activities: (activities.results as unknown as (Activity & { detail: string })[]).map(a => ({ ...a, detail: parseJson(a.detail, {}) })),
    addresses: (mailboxes.results as { address: string }[]).map(r => r.address)
  });
});

// ── Create / edit ───────────────────────────────────────────────────

const editable = ['company', 'url', 'industry', 'category', 'contact_url', 'contact_email', 'phone', 'person', 'notes', 'deal_amount', 'status', 'status_reason'] as const;

sites.post('/', async c => {
  const body = await c.req.json<Partial<Site>>();
  const url = normalizeUrl(body.url ?? '');
  const domain = domainOf(url);
  if (!domain) return c.json({ error: 'URLが正しくありません' }, 400);
  if (await c.env.DB.prepare('select 1 from sites where domain = ?').bind(domain).first()) return c.json({ error: 'このサイトはすでに登録されています' }, 409);
  const me = c.get('me');
  const industry = normalizeIndustry(body.industry ?? '');
  const res = await c.env.DB.prepare(
    `insert into sites (company, url, domain, industry, industry_source, category, category_source, contact_url, contact_email, phone, person, notes, created_by)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id`
  )
    .bind(
      (body.company ?? '').trim(),
      url,
      domain,
      industry || 'その他',
      industry ? 'manual' : 'auto',
      isCategory(body.category) ? body.category : 'ai',
      isCategory(body.category) ? 'manual' : 'auto',
      normalizeUrl(body.contact_url ?? ''),
      isValidEmail(body.contact_email ?? '') ? body.contact_email!.toLowerCase() : '',
      (body.phone ?? '').trim(),
      (body.person ?? '').trim(),
      (body.notes ?? '').trim(),
      me.email
    )
    .first<{ id: number }>();
  c.executionCtx.waitUntil(analyzeSite(c.env, res!.id).then(() => rematchUnlinked(c.env)));
  return c.json({ id: res!.id });
});

const setStatus = (env: Env, site: Site, status: Status, reason: string, actor: string) => {
  const at = nowIso();
  return [
    env.DB.prepare(
      `update sites set status = ?, status_reason = ?, updated_at = ?,
         completed_at = case when ? in ('completed', 'won') and completed_at is null then ? else completed_at end,
         won_at = case when ? = 'won' then coalesce(won_at, ?) when ? != 'won' then null else won_at end
       where id = ?`
    ).bind(status, reason, at, status, at, status, at, status, site.id),
    logActivity(env, site.id, 'status', { from: site.status, to: status, reason }, actor)
  ];
};

sites.patch('/:id{[0-9]+}', async c => {
  const id = Number(c.req.param('id'));
  const site = await c.env.DB.prepare('select * from sites where id = ?').bind(id).first<Site>();
  if (!site) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<Partial<Site>>();
  const me = c.get('me');
  const sets: string[] = [];
  const args: unknown[] = [];
  const changed: Record<string, unknown> = {};
  for (const key of editable) {
    if (!(key in body) || key === 'status' || key === 'status_reason') continue;
    let v = body[key] as unknown;
    if (key === 'url') {
      v = normalizeUrl(String(v));
      if (!v) return c.json({ error: 'URLが正しくありません' }, 400);
      const domain = domainOf(String(v));
      if (domain !== site.domain) {
        if (await c.env.DB.prepare('select 1 from sites where domain = ? and id != ?').bind(domain, id).first()) {
          return c.json({ error: 'このドメインは別のサイトとして登録されています' }, 409);
        }
        sets.push('domain = ?', 'analyzed_at = null');
        args.push(domain);
      }
    }
    if (key === 'contact_url') v = String(v).trim() ? normalizeUrl(String(v)) : '';
    if (key === 'contact_email') v = String(v).trim().toLowerCase();
    if (key === 'category') {
      if (!isCategory(v)) return c.json({ error: 'カテゴリが正しくありません' }, 400);
      sets.push("category_source = 'manual'");
    }
    if (key === 'industry') {
      v = normalizeIndustry(String(v)) || 'その他';
      sets.push("industry_source = 'manual'");
    }
    if (key === 'deal_amount') v = v === null || v === '' ? null : Math.max(0, Math.round(Number(v)) || 0);
    if (typeof v === 'string') v = v.trim();
    if (v === (site as unknown as Record<string, unknown>)[key]) continue;
    sets.push(`${key} = ?`);
    args.push(v);
    changed[key] = v;
  }
  const stmts = [];
  if (sets.length) {
    stmts.push(c.env.DB.prepare(`update sites set ${sets.join(', ')}, updated_at = ? where id = ?`).bind(...args, nowIso(), id));
    if ('notes' in changed) stmts.push(logActivity(c.env, id, 'note', { text: changed.notes }, me.email));
    const other = Object.keys(changed).filter(k => k !== 'notes');
    if (other.length) stmts.push(logActivity(c.env, id, 'edit', { fields: other }, me.email));
  }
  if (body.status && body.status !== site.status) {
    if (!isStatus(body.status)) return c.json({ error: 'ステータスが正しくありません' }, 400);
    stmts.push(...setStatus(c.env, site, body.status, (body.status_reason ?? '').trim(), me.email));
  } else if ('status_reason' in body && body.status_reason !== site.status_reason) {
    stmts.push(c.env.DB.prepare('update sites set status_reason = ? where id = ?').bind((body.status_reason ?? '').trim(), id));
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

sites.delete('/:id{[0-9]+}', requireOwner, async c => {
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('delete from sites where id = ?').bind(id).run();
  return c.json({ ok: true });
});

// Several sites at once: status, category or delete
sites.post('/bulk', async c => {
  const body = await c.req.json<{ ids: number[]; status?: Status; reason?: string; category?: string; delete?: boolean }>();
  const ids = (body.ids ?? []).filter(Number.isInteger).slice(0, 1000);
  if (!ids.length) return c.json({ updated: 0 });
  const me = c.get('me');
  if (body.delete) {
    if (me.role !== 'owner') return c.json({ error: 'owner only' }, 403);
    await c.env.DB.prepare(`delete from sites where id in (${ids.map(() => '?').join(',')})`).bind(...ids).run();
    return c.json({ updated: ids.length });
  }
  const rows = await c.env.DB.prepare(`select * from sites where id in (${ids.map(() => '?').join(',')})`).bind(...ids).all<Site>();
  const stmts = [];
  for (const site of rows.results) {
    if (body.status && isStatus(body.status) && body.status !== site.status) stmts.push(...setStatus(c.env, site, body.status, body.reason ?? '', me.email));
    if (body.category && isCategory(body.category) && body.category !== site.category) {
      stmts.push(c.env.DB.prepare("update sites set category = ?, category_source = 'manual', updated_at = ? where id = ?").bind(body.category, nowIso(), site.id));
    }
  }
  for (let i = 0; i < stmts.length; i += 90) await c.env.DB.batch(stmts.slice(i, i + 90));
  return c.json({ updated: rows.results.length });
});

// ── Actions on one site ─────────────────────────────────────────────

// "フォーム送信済み" / "追伸を送った": a send outside Gmail, counted like a sent mail
sites.post('/:id{[0-9]+}/sent', async c => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ templateKey?: string; channel?: 'form' | 'email' | 'other'; followup?: boolean }>();
  const me = c.get('me');
  const type = body.followup ? 'followup' : 'form_sent';
  const stmts = [logActivity(c.env, id, type, { templateKey: body.templateKey ?? '', channel: body.channel ?? 'form' }, me.email)];
  if (body.templateKey) stmts.push(c.env.DB.prepare('update sites set template_key = ? where id = ?').bind(body.templateKey, id));
  await c.env.DB.batch(stmts);
  await recountSite(c.env, id);
  return c.json({ ok: true });
});

// Remember which template was used before opening Gmail (the sync logs the send)
sites.post('/:id{[0-9]+}/template', async c => {
  const id = Number(c.req.param('id'));
  const { templateKey } = await c.req.json<{ templateKey: string }>();
  await c.env.DB.prepare('update sites set template_key = ? where id = ?').bind(templateKey ?? '', id).run();
  return c.json({ ok: true });
});

sites.post('/:id{[0-9]+}/notes', async c => {
  const id = Number(c.req.param('id'));
  const { text } = await c.req.json<{ text: string }>();
  if (!text?.trim()) return c.json({ error: 'empty' }, 400);
  await c.env.DB.batch([
    logActivity(c.env, id, 'note', { text: text.trim().slice(0, 2000) }, c.get('me').email),
    c.env.DB.prepare('update sites set updated_at = ? where id = ?').bind(nowIso(), id)
  ]);
  return c.json({ ok: true });
});

// Undo a logged form send (mistaken click)
sites.delete('/:id{[0-9]+}/activities/:aid{[0-9]+}', async c => {
  const id = Number(c.req.param('id'));
  const aid = Number(c.req.param('aid'));
  const me = c.get('me');
  const row = await c.env.DB.prepare('select type, actor from activities where id = ? and site_id = ?').bind(aid, id).first<{ type: string; actor: string }>();
  if (!row || !['form_sent', 'followup', 'note'].includes(row.type)) return c.json({ error: 'not found' }, 404);
  if (row.actor !== me.email && me.role !== 'owner') return c.json({ error: 'forbidden' }, 403);
  await c.env.DB.prepare('delete from activities where id = ?').bind(aid).run();
  await recountSite(c.env, id);
  return c.json({ ok: true });
});

sites.post('/analyze', async c => {
  const { ids } = await c.req.json<{ ids: number[] }>();
  const list = (ids ?? []).filter(Number.isInteger).slice(0, 5);
  const results = await Promise.all(list.map(id => analyzeSite(c.env, id)));
  return c.json({ results });
});

// ── Import ──────────────────────────────────────────────────────────

const statusFromLabel = (raw: string): Status | null => {
  const s = raw.trim();
  if (!s) return null;
  return statuses.find(x => x.key === s || x.label === s)?.key ?? null;
};

// Which domains already exist (for the preview)
sites.post('/import/preview', async c => {
  const { domains } = await c.req.json<{ domains: string[] }>();
  const list = [...new Set((domains ?? []).filter(Boolean))].slice(0, 5000);
  const found: Record<string, { id: number; status: Status; company: string }> = {};
  for (let i = 0; i < list.length; i += 90) {
    const chunk = list.slice(i, i + 90);
    const rows = await c.env.DB.prepare(`select id, domain, status, company from sites where domain in (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk)
      .all<{ id: number; domain: string; status: Status; company: string }>();
    for (const r of rows.results) found[r.domain] = { id: r.id, status: r.status, company: r.company };
  }
  const settings = await getSettings(c.env);
  return c.json({ existing: found, excluded: settings.excludedDomains, own: settings.ownDomains });
});

sites.post('/import', async c => {
  const body = await c.req.json<{ importId?: number; filename?: string; rows: ImportRow[]; mode: 'update' | 'skip'; offset?: number; last?: boolean }>();
  const me = c.get('me');
  const rows = (body.rows ?? []).slice(0, 500);
  const settings = await getSettings(c.env);
  const blocked = [...settings.excludedDomains, ...settings.ownDomains].map(d => d.toLowerCase());
  const isBlocked = (d: string) => blocked.some(b => d === b || d.endsWith(`.${b}`));

  let importId = body.importId;
  if (!importId) {
    const r = await c.env.DB.prepare('insert into imports (filename, created_by) values (?, ?) returning id')
      .bind((body.filename ?? '').slice(0, 200), me.email)
      .first<{ id: number }>();
    importId = r!.id;
  }

  const result: ImportResult = { importId, added: 0, updated: 0, skipped: 0, errors: [], siteIds: [] };
  const offset = body.offset ?? 0;
  const seen = new Set<string>();
  const stmts: D1PreparedStatement[] = [];
  const newRows: { domain: string; row: number }[] = [];

  const existingRows = new Map<string, Site>();
  const domains = rows.map(r => domainOf(normalizeUrl(r.url))).filter(Boolean);
  for (let i = 0; i < domains.length; i += 90) {
    const chunk = domains.slice(i, i + 90);
    const found = await c.env.DB.prepare(`select * from sites where domain in (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<Site>();
    for (const s of found.results) existingRows.set(s.domain, s);
  }

  rows.forEach((r, i) => {
    const rowNo = offset + i + 1;
    const url = normalizeUrl(r.url);
    const domain = domainOf(url);
    if (!domain) {
      result.errors.push({ row: rowNo, reason: r.url ? `URLが正しくありません: ${r.url}` : 'URLがありません' });
      return;
    }
    if (isBlocked(domain)) {
      result.skipped++;
      result.errors.push({ row: rowNo, reason: `除外ドメイン: ${domain}` });
      return;
    }
    if (seen.has(domain)) {
      result.skipped++;
      return;
    }
    seen.add(domain);
    const industry = normalizeIndustry(r.industry);
    const category = parseCategory(r.category);
    const status = statusFromLabel(r.status);
    const email = isValidEmail(r.contact_email) ? r.contact_email.toLowerCase() : '';
    const contactUrl = r.contact_url ? normalizeUrl(r.contact_url) : '';
    const existing = existingRows.get(domain);
    if (existing) {
      if (body.mode === 'skip') {
        result.skipped++;
        return;
      }
      // Fill in what the file has; keep what was set by hand
      stmts.push(
        c.env.DB.prepare(
          `update sites set
             company = case when ? != '' then ? else company end,
             industry = case when ? != '' and industry_source != 'manual' then ? else industry end,
             industry_source = case when ? != '' and industry_source != 'manual' then 'import' else industry_source end,
             category = case when ? is not null and category_source != 'manual' then ? else category end,
             category_source = case when ? is not null and category_source != 'manual' then 'import' else category_source end,
             contact_url = case when ? != '' then ? else contact_url end,
             contact_email = case when ? != '' then ? else contact_email end,
             phone = case when ? != '' then ? else phone end,
             person = case when ? != '' then ? else person end,
             notes = case when ? != '' and instr(notes, ?) = 0 then trim(notes || char(10) || ?) else notes end,
             updated_at = ?
           where id = ?`
        ).bind(
          r.company, r.company,
          industry, industry, industry,
          category, category, category,
          contactUrl, contactUrl,
          email, email,
          r.phone, r.phone,
          r.person, r.person,
          r.notes, r.notes, r.notes,
          nowIso(),
          existing.id
        )
      );
      if (status && status !== existing.status) stmts.push(...setStatus(c.env, existing, status, 'インポート', me.email));
      result.updated++;
      result.siteIds.push(existing.id);
      return;
    }
    stmts.push(
      c.env.DB.prepare(
        `insert into sites (company, url, domain, industry, industry_source, category, category_source, contact_url, contact_email, phone, person, notes, status, import_id, created_by)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        r.company,
        url,
        domain,
        industry || 'その他',
        industry ? 'import' : 'auto',
        category ?? 'ai',
        category ? 'import' : 'auto',
        contactUrl,
        email,
        r.phone,
        r.person,
        r.notes,
        status ?? 'new',
        importId,
        me.email
      )
    );
    newRows.push({ domain, row: rowNo });
    result.added++;
  });

  for (let i = 0; i < stmts.length; i += 90) await c.env.DB.batch(stmts.slice(i, i + 90));

  if (newRows.length) {
    const ids = await c.env.DB.prepare('select id from sites where import_id = ? and domain in (' + newRows.map(() => '?').join(',') + ')')
      .bind(importId, ...newRows.map(r => r.domain))
      .all<{ id: number }>();
    result.siteIds.push(...ids.results.map(r => r.id));
  }

  await c.env.DB.prepare('update imports set total = total + ?, added = added + ?, updated = updated + ?, skipped = skipped + ? where id = ?')
    .bind(rows.length, result.added, result.updated, result.skipped + result.errors.filter(e => !e.reason.startsWith('除外')).length, importId)
    .run();
  if (body.last) {
    const totals = await c.env.DB.prepare('select * from imports where id = ?').bind(importId).first<{ filename: string; added: number; updated: number; skipped: number }>();
    await logActivity(c.env, null, 'import', { importId, filename: totals?.filename, added: totals?.added, updated: totals?.updated, skipped: totals?.skipped }, me.email).run();
    c.executionCtx.waitUntil(rematchUnlinked(c.env));
  }
  return c.json(result);
});

sites.get('/imports', async c => {
  const rows = await c.env.DB.prepare('select * from imports order by id desc limit 50').all();
  return c.json(rows.results);
});
