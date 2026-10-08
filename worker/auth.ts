import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Me, Member } from '../shared/types';
import type { AppEnv, Env } from './env';
import { encrypt, isoIn, nowIso, randomToken, sha256b64url } from './util';

// Google sign-in (openid email profile) and mailbox connection (gmail.readonly,
// offline) — two grants, so signing in never asks for mailbox access.
// docs/DESIGN.md §3

const COOKIE = 'tsl_bs';
const SESSION_DAYS = 30;
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const oauthBase = (env: Env) => env.GOOGLE_OAUTH_BASE ?? 'https://accounts.google.com';
const tokenUrl = (env: Env) => (env.GOOGLE_OAUTH_BASE ? `${env.GOOGLE_OAUTH_BASE}/token` : 'https://oauth2.googleapis.com/token');
const userinfoUrl = (env: Env) =>
  env.GOOGLE_OAUTH_BASE ? `${env.GOOGLE_OAUTH_BASE}/userinfo` : 'https://openidconnect.googleapis.com/v1/userinfo';

const isLocal = (url: URL) => ['localhost', '127.0.0.1'].includes(url.hostname);
const callbackUrl = (c: Context<AppEnv>) => `${new URL(c.req.url).origin}/auth/callback`;
// Only paths inside this app (never "//evil.com" or "/\evil.com")
const safeNext = (next: string | undefined) => (next && /^\/(?![/\\])/.test(next) ? next : '/');

const startOAuth = async (c: Context<AppEnv>, purpose: 'login' | 'mailbox', scope: string, extra: Record<string, string>, email?: string) => {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const next = safeNext(c.req.query('next'));
  await c.env.DB.prepare('insert into oauth_states (state, verifier, purpose, email, expires_at) values (?, ?, ?, ?, ?)')
    .bind(state, verifier, purpose, JSON.stringify({ email: email ?? null, next }), isoIn(10 * 60_000))
    .run();
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(c),
    response_type: 'code',
    scope,
    state,
    code_challenge: await sha256b64url(verifier),
    code_challenge_method: 'S256',
    ...extra
  });
  return c.redirect(`${oauthBase(c.env)}/o/oauth2/v2/auth?${params}`);
};

export const createSession = async (c: Context<AppEnv>, email: string) => {
  const id = randomToken(32);
  await c.env.DB.batch([
    c.env.DB.prepare('insert into sessions (id, email, expires_at) values (?, ?, ?)').bind(id, email, isoIn(SESSION_DAYS * 86_400_000)),
    c.env.DB.prepare('update members set last_login_at = ? where email = ?').bind(nowIso(), email),
    // Housekeeping
    c.env.DB.prepare('delete from sessions where expires_at < ?').bind(nowIso()),
    c.env.DB.prepare('delete from oauth_states where expires_at < ?').bind(nowIso())
  ]);
  setCookie(c, COOKIE, id, {
    path: '/',
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    maxAge: SESSION_DAYS * 86_400
  });
};

// The member row for this Google account; the configured owner is created on first sign-in
const memberFor = async (env: Env, email: string): Promise<Member | null> => {
  const row = await env.DB.prepare('select * from members where email = ?').bind(email).first<Member>();
  if (row) return row;
  if (env.OWNER_EMAIL && email === env.OWNER_EMAIL.trim().toLowerCase()) {
    await env.DB.prepare("insert into members (email, role) values (?, 'owner')").bind(email).run();
    return env.DB.prepare('select * from members where email = ?').bind(email).first<Member>();
  }
  return null;
};

export const auth = new Hono<AppEnv>();

auth.get('/login', c =>
  startOAuth(c, 'login', 'openid email profile', { prompt: 'select_account' })
);

auth.get('/mailbox', requireSession(), c =>
  startOAuth(
    c,
    'mailbox',
    `openid email ${GMAIL_SCOPE}`,
    { access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'true' },
    c.get('me').email
  )
);

auth.get('/callback', async c => {
  const { code, state, error } = c.req.query();
  if (error || !code || !state) return c.redirect(`/login?error=${encodeURIComponent(error ?? 'cancelled')}`);
  const st = await c.env.DB.prepare('delete from oauth_states where state = ? and expires_at > ? returning *')
    .bind(state, nowIso())
    .first<{ verifier: string; purpose: 'login' | 'mailbox'; email: string }>();
  if (!st) return c.redirect('/login?error=expired');
  const { email: startedBy, next } = JSON.parse(st.email) as { email: string | null; next: string };

  const tokenRes = await fetch(tokenUrl(c.env), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(c),
      grant_type: 'authorization_code',
      code_verifier: st.verifier
    })
  });
  if (!tokenRes.ok) return c.redirect('/login?error=token');
  const token = (await tokenRes.json()) as { access_token: string; refresh_token?: string; scope?: string };
  const infoRes = await fetch(userinfoUrl(c.env), { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!infoRes.ok) return c.redirect('/login?error=userinfo');
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean; name?: string; picture?: string };
  const email = (info.email ?? '').toLowerCase();
  if (!email || info.email_verified === false) return c.redirect('/login?error=unverified');

  if (st.purpose === 'login') {
    const member = await memberFor(c.env, email);
    if (!member) return c.redirect(`/login?error=not_member&email=${encodeURIComponent(email)}`);
    await c.env.DB.prepare('update members set name = ?, picture = ? where email = ?')
      .bind(info.name ?? member.name, info.picture ?? member.picture, email)
      .run();
    await createSession(c, email);
    return c.redirect(safeNext(next));
  }

  // Mailbox connection: the person who started it must still be a member
  if (!startedBy || !(await c.env.DB.prepare('select 1 from members where email = ?').bind(startedBy).first())) {
    return c.redirect('/login?error=session');
  }
  if (!token.refresh_token || !(token.scope ?? '').includes(GMAIL_SCOPE)) return c.redirect('/settings?mailbox=denied');
  const sealed = await encrypt(c.env.TOKEN_KEY, token.refresh_token);
  await c.env.DB.prepare(
    `insert into mailboxes (email, refresh_token, connected_by) values (?, ?, ?)
     on conflict (email) do update set refresh_token = excluded.refresh_token, connected_by = excluded.connected_by,
       connected_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), last_error = null`
  )
    .bind(email, sealed, startedBy)
    .run();
  return c.redirect(`/settings?mailbox=connected&email=${encodeURIComponent(email)}`);
});

auth.post('/logout', async c => {
  const id = getCookie(c, COOKIE);
  if (id) await c.env.DB.prepare('delete from sessions where id = ?').bind(id).run();
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// Local development: sign in without Google (DEV_LOGIN=1 and localhost only)
auth.get('/dev', async c => {
  const url = new URL(c.req.url);
  if (c.env.DEV_LOGIN !== '1' || !isLocal(url)) return c.notFound();
  const email = (c.req.query('email') ?? c.env.OWNER_EMAIL ?? '').toLowerCase();
  const member = await memberFor(c.env, email);
  if (!member) return c.text(`not a member: ${email}`, 403);
  await createSession(c, email);
  return c.redirect(safeNext(c.req.query('next')));
});

// Session check for /api and /auth/mailbox; changes must come from this site
export function requireSession(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const id = getCookie(c, COOKIE);
    const me = id
      ? await c.env.DB.prepare(
          `select m.email, m.name, m.picture, m.role from sessions s join members m on m.email = s.email
           where s.id = ? and s.expires_at > ?`
        )
          .bind(id, nowIso())
          .first<Me>()
      : null;
    if (!me) return c.json({ error: 'unauthorized' }, 401);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      const host = c.req.header('host');
      // Local development through the Vite proxy (port 5180 → 8787) is also accepted
      const devProxy = c.env.DEV_LOGIN === '1' && isLocal(new URL(c.req.url)) && !!origin && isLocal(new URL(origin));
      if (!devProxy && (!origin || !host || new URL(origin).host !== host)) return c.json({ error: 'bad origin' }, 403);
    }
    c.set('me', me);
    await next();
  };
}

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('me').role !== 'owner') return c.json({ error: 'owner only' }, 403);
  await next();
};
