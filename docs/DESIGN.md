# Tech Studio Lab Business — design

Sales management for the outsourced outreach run by Tech Studio Lab: import a
target list from Excel, classify every site, work each one from a detail page,
and see sends, replies and contracts as they happen. Served at
`https://business.techstudiolab.jp`.

## 1. Goals

| # | Need (from the request) | How the system meets it |
|---|---|---|
| 1 | Import an Excel list and show the sites being targeted | Excel / CSV upload with column mapping, duplicate check by domain, preview before saving |
| 2 | Categorize sites automatically by type | Rules on industry text + a site check (title, platform, app-store links) set the outreach category (A–D) and industry; overrides are kept |
| 3 | Statuses: Sales Suspended / Pending / Completed | `営業停止` `営業保留` `営業完了`, plus the pipeline steps needed for the numbers: `未着手` `送信済み` `返信あり` `成約` |
| 4 | Click a site → details → find the contact point | Detail page with the site, its contact page, e-mail and phone found by the site check, and a warning when the site says 「営業お断り」 |
| 5 | Track who was contacted and how many messages went each way | Gmail sync matches sent and received mail to sites by domain, address and thread; per-site sent / received counts and a timeline |
| 6 | Google login, monitor the logged-in Google account | Google sign-in for the app; the sales mailbox is connected once with read-only Gmail access and synced every 5 minutes |
| 7 | Shared, real-time view for owner and sales agent: replies, conversions | Dashboard with funnel, goal progress (1,000 a month), daily chart, breakdown by category / industry / template / member; refreshes every 15 s |
| 8 | Organize by company type and web sector | Filters and statistics by category, industry and site platform (Shopify, WordPress, …) |

Ideas taken from comparable tools: pipeline stages per deal and threads grouped
per deal (Streak); duplicate-send prevention, excluded domains, 「営業お断り」
filtering, and a reply rate that leaves out auto-replies and bounces (Japanese
form-sales tools).

## 2. Architecture

```
Browser (React SPA)  ──/api, /auth──►  Cloudflare Worker (Hono)  ──►  D1 (SQLite)
                                          │  cron */5 min
                                          ├──►  Gmail API (read-only, sales mailbox)
                                          └──►  target websites (site check)
```

- **One Cloudflare Worker** serves the built SPA (static assets) and the API, on
  the custom domain `business.techstudiolab.jp`. Same platform as
  techstudiolab.jp, so one dashboard and one `wrangler deploy`.
- **D1** stores everything. No other backend to manage.
- **Cron trigger** every 5 minutes: Gmail sync, then site checks for new rows.
- **Real time**: the SPA re-fetches every 15 s; "今すぐ同期" runs a sync on demand.

Stack: Vite + React 18 + TypeScript + Tailwind (same as the portfolio),
TanStack Query, Recharts, SheetJS (from the SheetJS CDN — the npm `xlsx` package is
outdated), Hono on Workers, Vitest for the shared logic.

## 3. Google sign-in and Gmail

Two separate grants, so logging in never requires mailbox access:

1. **Login** — `openid email profile`. Only e-mails in the member list get in
   (the owner is bootstrapped from `OWNER_EMAIL`).
2. **Connect mailbox** (Settings) — `gmail.readonly`, offline access. The refresh
   token is encrypted (AES-GCM, key in a Worker secret) and stored in D1. Any
   member can connect the account they are signed in with; this is "monitor the
   logged-in Google account" from the request.

**Recommended setup:** a dedicated Workspace user such as `sales@techstudiolab.jp`.
The agent sends from it, replies arrive there, and the system watches it. The
Google Cloud OAuth app is set to **Internal** (techstudiolab.jp is on Google
Workspace), which avoids Google's review for the restricted Gmail scope and the
7-day token expiry of apps in "Testing". Owner and agent can each sign in with
their own Workspace account, or both with the shared one — the member list
decides who gets in either way. Separate logins show who did what in the
activity log; a shared login records everything under one name.

**Sync** (`worker/gmail.ts`)

- First run: messages from the last 90 days (`in:inbox OR in:sent`). Afterwards:
  `history.list` from the stored history id.
- Message ids go into a queue table; each run fetches up to 40 headers
  (`From, To, Cc, Subject, Date, Auto-Submitted, Precedence, X-Autoreply`) to stay
  within the Workers free-plan limit of 50 sub-requests. "今すぐ同期" repeats runs
  until the queue is empty.
- Matching, in order: thread already linked to a site → exact address in the
  site's address list → sender / recipient domain equals the site domain (also
  subdomains). Free-mail domains (gmail.com, yahoo.co.jp, …) only match by exact
  address or thread. Unmatched incoming mail goes to the **未紐付けの返信** queue, where
  one click links it (and remembers the address).
- Incoming mail is classified as `reply`, `auto` (auto-reply, form receipt) or
  `bounce`. Only `reply` counts as a reply and moves a site to `返信あり`.
- Mail between our own addresses is ignored.

## 4. Data model (D1)

| Table | Purpose | Key columns |
|---|---|---|
| `members` | who may sign in | email, name, role (`owner` / `agent`), last_login_at |
| `sessions` | login sessions (cookie) | id (random), email, expires_at |
| `oauth_states` | login / connect state + PKCE verifier | state, verifier, purpose, expires_at |
| `mailboxes` | connected Gmail accounts | email, refresh_token (encrypted), history_id, last_sync_at, last_error |
| `sync_queue` | Gmail message ids waiting to be read | mailbox_id, message_id |
| `imports` | Excel imports | filename, totals, created_by |
| `sites` | one row per target site (unique by domain) | company, url, domain, category, industry, platform, status, contact_url / email / phone, no_sales, counts, dates, deal_amount |
| `site_addresses` | addresses linked to a site | address, site_id |
| `messages` | synced Gmail messages | gmail id, thread_id, site_id, direction, kind, from, to, subject, snippet, sent_at |
| `activities` | timeline and audit log | site_id, type, detail (JSON), actor, created_at |
| `templates` | outreach texts (A–D × patterns, 500 / 200-character versions) | key, category, variant, subject, body |
| `settings` | monthly goal, excluded domains, own domains | key, value |

## 5. Statuses

| Status | Label | Set by |
|---|---|---|
| `new` | 未着手 | import |
| `sent` | 送信済み | "フォーム送信済み" button, or a sent e-mail found by sync |
| `replied` | 返信あり | a real reply found by sync, or by hand |
| `completed` | 営業完了 | by hand — the lead moved on to talks |
| `won` | 成約 | by hand, with optional amount |
| `pending` | 営業保留 | by hand |
| `suspended` | 営業停止 | by hand; automatically when the site says 「営業お断り」 and nothing was sent yet |

Automatic changes only move forward (`new → sent → replied`) and never override
`completed`, `won`, `pending` or `suspended`.

## 6. Classification

- **Category** (decides the template, A–D): `ec` when the site runs on a cart
  (Shopify, MakeShop, EC-CUBE, BASE, STORES, futureshop, カラーミー) or the industry
  says 通販 / EC; `app` when the site links to the App Store / Google Play or the
  industry says アプリ; `system` for manufacturing, construction, logistics,
  wholesale; otherwise `ai`. A category set by hand or in the Excel file is kept.
- **Industry** (for statistics): normalized list — 不動産, 人材, 士業, 広告・制作, 製造,
  建設, 運送・物流, 卸・小売, EC・通販, 飲食, 美容・サロン, 医療・介護, 教育, IT, その他 — from
  the Excel column or keywords in the site title / description.
- **Platform** (web sector): Shopify, MakeShop, EC-CUBE, BASE, STORES, WordPress,
  Wix, STUDIO, Jimdo, ペライチ, or blank.

**Site check** (`worker/analyze.ts`): fetches the top page (and the contact page
when found), at most 2 requests per site, 8-second timeout, first 600 KB. It reads
the title, meta description, platform signatures, App Store links, the contact page
link, `mailto:` / `tel:`, and phrases such as 「営業お断り」「営業目的のお問い合わせはご遠慮」.

## 7. Screens

| Screen | Content |
|---|---|
| ダッシュボード | KPIs (sites, sent this month vs goal, replies, reply rate, 営業完了, 成約), funnel, 30-day chart of sends and replies, breakdown by category / industry / template / member, follow-up due, latest activity |
| 営業リスト | Table with search and filters (status, category, industry, platform, お断り), sort, bulk status change, Excel export |
| サイト詳細 | Site and contact links, check results, status buttons, recommended template (copy / open in Gmail), "フォーム送信済み", notes, sent / received counts, timeline with Gmail links |
| インポート | Template download, upload, column mapping, preview with new / update / skip per row, run site checks with progress |
| 返信 | Synced mail, filter by matched / unmatched / auto-replies, link to a site |
| テンプレート | The outreach texts, editable, with reply rate per template |
| 設定 | Members (owner only), mailbox connection and sync, monthly goal, excluded domains |

## 8. Security

- Session cookie: random 32-byte id, `HttpOnly; Secure; SameSite=Lax`, 30 days, stored in D1.
- Every `/api` call checks the session; changes also check `Origin`.
- OAuth with `state` and PKCE; Gmail refresh tokens encrypted at rest.
- Member management and mailbox disconnect are owner-only.
- The development login (`/auth/dev`) works only with `DEV_LOGIN=1` **and** a
  localhost host name.

## 9. Free-plan limits

Cloudflare Workers Free: 100,000 requests a day, 50 sub-requests and 10 ms CPU
per invocation; D1 Free: 5 GB, 5 million row reads a day. The sync and site-check
batches are sized for these (40 messages / 10 sites per run). At ~1,000 sites a
month this fits comfortably; the Workers Paid plan (US$5 a month) lifts the
limits if the volume grows.

## 10. Build order

1. Scaffold, D1 schema, shared logic with tests (statuses, classification, domain
   matching, column mapping, mail classification).
2. Worker: auth, sites / imports / stats / members / templates API, site check,
   Gmail sync, cron.
3. SPA screens.
4. Local run with local D1, development login and a mock Gmail API; browser check.
5. README: Google Cloud setup, D1 creation, secrets, custom domain, deploy.
