// Types shared by the Worker (worker/) and the SPA (src/)

export type Status = 'new' | 'sent' | 'replied' | 'completed' | 'won' | 'pending' | 'suspended';
export type Category = 'ai' | 'system' | 'app' | 'ec';
export type Source = 'auto' | 'import' | 'manual';
export type Role = 'owner' | 'agent';
export type MessageKind = 'sent' | 'reply' | 'auto' | 'bounce';

export interface Site {
  id: number;
  company: string;
  url: string;
  domain: string;
  category: Category;
  category_source: Source;
  industry: string;
  industry_source: Source;
  platform: string;
  status: Status;
  status_reason: string;
  contact_url: string;
  contact_email: string;
  phone: string;
  person: string;
  notes: string;
  title: string;
  description: string;
  no_sales: number;
  no_sales_text: string;
  has_app: number;
  analyzed_at: string | null;
  analyze_error: string;
  template_key: string;
  sent_count: number;
  received_count: number;
  auto_count: number;
  followups: number;
  first_sent_at: string | null;
  last_sent_at: string | null;
  first_reply_at: string | null;
  last_reply_at: string | null;
  completed_at: string | null;
  won_at: string | null;
  deal_amount: number | null;
  import_id: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  mailbox_id: number | null;
  site_id: number | null;
  direction: 'out' | 'in';
  kind: MessageKind;
  from_addr: string;
  to_addr: string;
  subject: string;
  snippet: string;
  sent_at: string;
  // Joined for lists
  company?: string;
  domain?: string;
  mailbox_email?: string;
}

export interface Activity {
  id: number;
  site_id: number | null;
  type: ActivityType;
  detail: Record<string, unknown>;
  actor: string | null;
  created_at: string;
  company?: string;
  domain?: string;
}

export type ActivityType =
  | 'import'
  | 'status'
  | 'note'
  | 'form_sent'
  | 'email_sent'
  | 'reply'
  | 'auto_reply'
  | 'bounce'
  | 'followup'
  | 'edit'
  | 'analyzed'
  | 'linked';

export interface Member {
  email: string;
  name: string;
  picture: string;
  role: Role;
  created_at: string;
  last_login_at: string | null;
}

export interface Mailbox {
  id: number;
  email: string;
  connected_by: string | null;
  connected_at: string;
  last_sync_at: string | null;
  last_error: string | null;
  queued: number;
}

export interface Template {
  key: string;
  category: Category | 'common';
  variant: string;
  label: string;
  subject: string;
  body: string;
  sort: number;
  active: number;
  updated_at: string;
}

export interface Settings {
  monthlyGoal: number;
  senderName: string;
  senderEmail: string;
  senderAddress: string;
  lancersTitle: string;
  mailboxForCompose: string;
  ownDomains: string[];
  excludedDomains: string[];
  followupDays: number;
}

export interface Me {
  email: string;
  name: string;
  picture: string;
  role: Role;
}

// One row of an Excel import, after column mapping
export interface ImportRow {
  company: string;
  url: string;
  industry: string;
  category: string;
  contact_url: string;
  contact_email: string;
  phone: string;
  person: string;
  notes: string;
  status: string;
}

export interface ImportResult {
  importId: number;
  added: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
  siteIds: number[];
}

export interface CountRow {
  key: string;
  sites: number;
  sent: number;
  replied: number;
  completed: number;
  won: number;
}

export interface Stats {
  range: { from: string; to: string; days: number };
  totals: {
    sites: number;
    sentSites: number;
    repliedSites: number;
    completed: number;
    won: number;
    // Of the sites that were sent to (the funnel)
    funnelCompleted: number;
    funnelWon: number;
    wonAmount: number;
    messagesOut: number;
    messagesIn: number;
    autoReplies: number;
    noSales: number;
    unmatched: number;
    followupDue: number;
  };
  month: { sent: number; goal: number; replied: number; won: number };
  byStatus: Record<Status, number>;
  daily: { day: string; sent: number; replies: number }[];
  byCategory: CountRow[];
  byIndustry: CountRow[];
  byPlatform: CountRow[];
  byTemplate: CountRow[];
  byMember: { key: string; sent: number; statusChanges: number; notes: number; last: string | null }[];
  recent: Activity[];
}
