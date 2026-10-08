import type { Me } from '../shared/types';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  // base64 of 32 random bytes; encrypts Gmail refresh tokens
  TOKEN_KEY: string;
  // First owner; can sign in before anyone is added
  OWNER_EMAIL: string;
  // Local development only (see .dev.vars.example)
  DEV_LOGIN?: string;
  GMAIL_API_BASE?: string;
  GOOGLE_OAUTH_BASE?: string;
  // Outgoing requests per invocation (Workers Free: 50; Paid: 1000)
  SUBREQUEST_BUDGET?: string;
}

export type AppEnv = { Bindings: Env; Variables: { me: Me } };
