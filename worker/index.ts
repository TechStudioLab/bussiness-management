import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { admin } from './admin';
import { analyzePending } from './analyze';
import { auth, requireSession } from './auth';
import type { AppEnv, Env } from './env';
import { budgetFor, syncAll } from './gmail';
import { sites } from './sites';
import { HttpError } from './util';

// Tech Studio Lab Business — Worker entry (docs/DESIGN.md §2)
// /auth/*  Google sign-in, mailbox connection, logout
// /api/*   the app's data (signed-in members only)
// anything else: the SPA from dist/ (wrangler.jsonc "assets")

const app = new Hono<AppEnv>();

app.use(
  '*',
  secureHeaders({
    xFrameOptions: 'DENY',
    referrerPolicy: 'strict-origin-when-cross-origin',
    crossOriginOpenerPolicy: false
  })
);

app.route('/auth', auth);

const api = new Hono<AppEnv>();
api.use('*', requireSession());
api.route('/sites', sites);
api.route('/', admin);
app.route('/api', api);

app.notFound(c => (c.req.path.startsWith('/api/') || c.req.path.startsWith('/auth/') ? c.json({ error: 'not found' }, 404) : c.env.ASSETS.fetch(c.req.raw)));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  console.error(err);
  return c.json({ error: 'サーバーでエラーが発生しました' }, 500);
});

export default {
  fetch: app.fetch,
  // Every 5 minutes: Gmail first, then site checks with what is left of the budget
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const budget = budgetFor(env);
    ctx.waitUntil(
      (async () => {
        await syncAll(env, budget);
        await analyzePending(env, budget);
      })()
    );
  }
} satisfies ExportedHandler<Env>;
