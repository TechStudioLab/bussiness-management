import type { Activity, Mailbox, Me, Member, Message, Settings, Site, Stats, Template } from '@shared/types';
import { t } from '@/i18n';
import { serverText } from './labels';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (res.status === 401) {
    if (!location.pathname.startsWith('/login')) location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new ApiError(401, t('api.login'));
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const error = (data as { error?: string } | null)?.error;
    throw new ApiError(res.status, error ? serverText(error) : t('api.error', { status: res.status }));
  }
  return data as T;
};

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T = { ok: true }>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T = { ok: true }>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T = { ok: true }>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T = { ok: true }>(path: string) => request<T>('DELETE', path)
};

export interface SiteList {
  items: Site[];
  total: number;
  page: number;
  pageSize: number;
  facets: { industries: { value: string; count: number }[]; platforms: { value: string; count: number }[] };
}

export interface SiteDetail {
  site: Site;
  messages: Message[];
  activities: Activity[];
  addresses: string[];
}

export const fetchers = {
  me: () => api.get<Me>('/api/me'),
  stats: (days: number) => api.get<Stats>(`/api/stats?days=${days}`),
  sites: (qs: string) => api.get<SiteList>(`/api/sites?${qs}`),
  site: (id: number) => api.get<SiteDetail>(`/api/sites/${id}`),
  messages: (filter: string) => api.get<Message[]>(`/api/messages?filter=${filter}`),
  activities: (qs: string) => api.get<Activity[]>(`/api/activities?${qs}`),
  mailboxes: () => api.get<Mailbox[]>('/api/mailboxes'),
  members: () => api.get<Member[]>('/api/members'),
  settings: () => api.get<Settings>('/api/settings'),
  templates: () => api.get<Template[]>('/api/templates')
};

// Query keys in one place, so changes refresh every screen that shows them
export const keys = {
  me: ['me'] as const,
  stats: (days: number) => ['stats', days] as const,
  sites: (qs: string) => ['sites', qs] as const,
  site: (id: number) => ['site', id] as const,
  messages: (filter: string) => ['messages', filter] as const,
  activities: (qs: string) => ['activities', qs] as const,
  mailboxes: ['mailboxes'] as const,
  members: ['members'] as const,
  settings: ['settings'] as const,
  templates: ['templates'] as const
};

// Everything that depends on sites or mail
export const dataKeys = [['stats'], ['sites'], ['site'], ['messages'], ['activities'], ['mailboxes']];
