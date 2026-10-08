# Tech Studio Lab Business

Sales management for Tech Studio Lab's outreach, at `https://business.techstudiolab.jp`.

- Import a target list from Excel / CSV (any column layout, Shift_JIS CSV too)
- Automatic site check: contact page, e-mail, phone, platform (Shopify, WordPress …), App Store links and 「営業お断り」 notices
- Automatic classification into the four template families (A AI・自動化 / B システム化 / C アプリ / D EC) and an industry
- Statuses 未着手 → 送信済み → 返信あり → 営業完了 → 成約, plus 営業保留 and 営業停止
- Gmail sync (read-only) every 5 minutes: sent mail and replies are matched to sites by domain, address and thread; auto-replies and bounces are kept apart
- Dashboard for the owner and the sales agent: monthly goal, funnel, daily chart, results by category / industry / template / platform / member, team history
- The outreach templates (3 patterns + 500- and 200-character versions per category) built in, with the right one chosen for each site

Design: [docs/DESIGN.md](docs/DESIGN.md). Stack: React + Vite (SPA) and a Cloudflare Worker (Hono) with D1.

## Deploy (first time)

### 1. Google Cloud (sign-in and Gmail)

1. Open <https://console.cloud.google.com/> with the techstudiolab.jp Workspace admin account and create a project, e.g. `techstudiolab-business`.
2. **APIs & Services → Library**: enable **Gmail API**.
3. **OAuth consent screen**: User type **Internal**; app name 「Tech Studio Lab 営業管理」; scopes `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.readonly`.
   Internal = only techstudiolab.jp Workspace accounts can sign in. No Google review is needed for the Gmail scope, and the connection does not expire after 7 days.
4. **Credentials → Create credentials → OAuth client ID** → Web application.
   Authorized redirect URIs:
   - `https://business.techstudiolab.jp/auth/callback`
   - `http://localhost:8787/auth/callback` (local development, optional)
5. Keep the client ID and client secret for step 2.

Recommended: a dedicated Workspace user such as `sales@techstudiolab.jp` that the agent sends from. That is the mailbox the system watches.

### 2. Cloudflare

```bash
npm install
npx wrangler login
npx wrangler d1 create techstudiolab-business     # copy the database_id into wrangler.jsonc
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put OWNER_EMAIL               # the first owner, e.g. watanabe@techstudiolab.jp
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npx wrangler secret put TOKEN_KEY                 # paste the value printed above
npm run deploy                                    # build + D1 migrations + deploy
```

`wrangler.jsonc` adds `business.techstudiolab.jp` as a custom domain; Cloudflare creates the DNS record because techstudiolab.jp is already on Cloudflare.

### 3. First sign-in

1. Open `https://business.techstudiolab.jp` and sign in with `OWNER_EMAIL`.
2. **設定 → Gmailを接続**: choose `sales@techstudiolab.jp` and allow read access.
3. **設定 → メンバー**: add the agent's Google account as 営業担当 (or let both use the shared account — only listed accounts can sign in).
4. **設定 → 送信者情報**: sender name, reply address, the Lancers title as shown on the profile, and the address used in e-mail signatures.
5. **インポート**: download the template or upload your own list.

## Daily use

| Who | What |
|---|---|
| Agent | Import lists → open a site → copy the text → send through the contact form → press 「フォームで送信した」. Mail sent from Gmail is recorded automatically. |
| Everyone | Replies appear within 5 minutes (or 今すぐ同期). Replies the system could not match go to 返信 → 未紐付けの返信; linking one remembers the sender. |
| Owner | Dashboard and チーム履歴 show sends, replies and status changes per member in near real time (15-second refresh). |

## Language and theme

The UI is available in Japanese and English, with light, dark and system themes. Switch them in the sidebar footer, on the login page, or under **設定 / Settings → 表示 / Display**. Both choices are stored per browser (`localStorage` keys `tsl.lang` and `tsl.theme`); on the first visit the language follows the browser and the theme follows the OS. Nothing needs to be configured on the server.

- Text lives in [src/i18n/ja.ts](src/i18n/ja.ts) (reference) and [src/i18n/en.ts](src/i18n/en.ts). `npm run typecheck` fails if a key is missing from `en.ts`. `{name}` is a placeholder; `<key>_one` is the English singular used when `count` is 1.
- Values stored in Japanese (industries, platforms, Worker error messages) are translated for display in [src/lib/labels.ts](src/lib/labels.ts); the database is unchanged.
- Not translated on purpose: the outreach templates (they are sent to Japanese companies) and the Excel import template / export, so exported files can be imported again.
- Colors are CSS variables in [src/index.css](src/index.css) (`:root` for light, `[data-theme='dark']` for dark). Fonts (Inter, Noto Sans JP) come from Google Fonts; allow `fonts.googleapis.com` and `fonts.gstatic.com` if you add a Content-Security-Policy.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars        # fill in; DEV_LOGIN=1 enables /auth/dev on localhost
npm run db:migrate:local
npm run build && npm run dev:api      # app + API on http://localhost:8787
npm run dev                           # optional: hot reload on http://localhost:5180 (proxies /api and /auth)
```

Without real Google credentials, use the mock (sign-in, Gmail API and four fake target sites):

```bash
# .dev.vars: GMAIL_API_BASE=http://localhost:8790 and GOOGLE_OAUTH_BASE=http://localhost:8790
node scripts/mock-google.mjs
```

Checks:

```bash
npm test                  # shared logic (classification, matching, import mapping, templates)
npm run typecheck
node scripts/smoke.mjs    # end-to-end against a fresh local DB + the mock
```

## Limits and notes

- Workers Free allows 50 outgoing requests per invocation; each sync reads up to ~40 messages and each site check uses 2 requests. "今すぐ同期" and the import screen repeat runs until done. With the Workers Paid plan set `SUBREQUEST_BUDGET` (e.g. 900) for larger batches.
- The site check fetches at most 2 pages per site (8 s, 400 KB each). Sites that block bots show an error and can be filled in by hand.
- The system reads From / To / Subject and Gmail's short snippet only; it never sends or deletes mail. Connect a mailbox used only for sales.
- `npm audit` lists advisories only in build tools (Tailwind 3's file watcher, the local Workers simulator); nothing in the deployed app.
