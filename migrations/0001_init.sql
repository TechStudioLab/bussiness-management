-- Tech Studio Lab Business: initial schema (see docs/DESIGN.md §4)
-- Times are ISO 8601 UTC strings, e.g. 2026-10-08T13:20:00Z

-- Who may sign in. The first owner comes from OWNER_EMAIL.
create table members (
  email text primary key,
  name text not null default '',
  picture text not null default '',
  role text not null check (role in ('owner', 'agent')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_login_at text
);

create table sessions (
  id text primary key,
  email text not null references members (email) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at text not null
);
create index sessions_email on sessions (email);

-- Pending Google sign-ins / mailbox connections (state + PKCE verifier)
create table oauth_states (
  state text primary key,
  verifier text not null,
  purpose text not null check (purpose in ('login', 'mailbox')),
  email text,
  expires_at text not null
);

-- Gmail accounts the system watches; refresh_token is AES-GCM encrypted
create table mailboxes (
  id integer primary key,
  email text not null unique,
  refresh_token text not null,
  history_id text,
  connected_by text,
  connected_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_sync_at text,
  last_error text
);

-- Gmail message ids waiting to be read (sync runs in small batches)
create table sync_queue (
  mailbox_id integer not null references mailboxes (id) on delete cascade,
  message_id text not null,
  primary key (mailbox_id, message_id)
);

create table imports (
  id integer primary key,
  filename text not null default '',
  total integer not null default 0,
  added integer not null default 0,
  updated integer not null default 0,
  skipped integer not null default 0,
  created_by text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- One row per target site, unique by domain
create table sites (
  id integer primary key,
  company text not null default '',
  url text not null,
  domain text not null unique,
  category text not null default 'ai' check (category in ('ai', 'system', 'app', 'ec')),
  category_source text not null default 'auto' check (category_source in ('auto', 'import', 'manual')),
  industry text not null default 'その他',
  industry_source text not null default 'auto' check (industry_source in ('auto', 'import', 'manual')),
  platform text not null default '',
  status text not null default 'new'
    check (status in ('new', 'sent', 'replied', 'completed', 'won', 'pending', 'suspended')),
  status_reason text not null default '',
  contact_url text not null default '',
  contact_email text not null default '',
  phone text not null default '',
  person text not null default '',
  notes text not null default '',
  title text not null default '',
  description text not null default '',
  no_sales integer not null default 0,
  no_sales_text text not null default '',
  has_app integer not null default 0,
  analyzed_at text,
  analyze_error text not null default '',
  template_key text not null default '',
  sent_count integer not null default 0,
  received_count integer not null default 0,
  auto_count integer not null default 0,
  followups integer not null default 0,
  first_sent_at text,
  last_sent_at text,
  first_reply_at text,
  last_reply_at text,
  completed_at text,
  won_at text,
  deal_amount integer,
  import_id integer references imports (id) on delete set null,
  created_by text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
create index sites_status on sites (status);
create index sites_category on sites (category);
create index sites_industry on sites (industry);
create index sites_first_sent on sites (first_sent_at);
create index sites_analyzed on sites (analyzed_at);

-- Extra addresses that belong to a site (e.g. a reply from a gmail.com address)
create table site_addresses (
  address text primary key,
  site_id integer not null references sites (id) on delete cascade
);

-- Synced Gmail messages
create table messages (
  id text primary key,
  thread_id text not null,
  mailbox_id integer references mailboxes (id) on delete set null,
  site_id integer references sites (id) on delete set null,
  direction text not null check (direction in ('out', 'in')),
  kind text not null check (kind in ('sent', 'reply', 'auto', 'bounce')),
  from_addr text not null default '',
  to_addr text not null default '',
  subject text not null default '',
  snippet text not null default '',
  sent_at text not null
);
create index messages_site on messages (site_id, sent_at);
create index messages_thread on messages (thread_id);
create index messages_sent_at on messages (sent_at);

-- Timeline per site and audit log for the whole team
create table activities (
  id integer primary key,
  site_id integer references sites (id) on delete cascade,
  type text not null,
  detail text not null default '{}',
  actor text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
create index activities_site on activities (site_id, created_at);
create index activities_created on activities (created_at);
create index activities_type on activities (type, created_at);

-- Outreach texts (seeded from shared/templates.ts on first use)
create table templates (
  key text primary key,
  category text not null check (category in ('ai', 'system', 'app', 'ec', 'common')),
  variant text not null,
  label text not null,
  subject text not null default '',
  body text not null,
  sort integer not null default 0,
  active integer not null default 1,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

create table settings (
  key text primary key,
  value text not null
);
