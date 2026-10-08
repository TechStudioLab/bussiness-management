// Small helpers shared by the Worker modules

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
export const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export const sha256b64url = async (text: string) =>
  b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));

// AES-GCM with the TOKEN_KEY secret; output is base64(iv | ciphertext)
const key = (secret: string) => {
  const raw = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('TOKEN_KEY must be 32 bytes in base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

export const encrypt = async (secret: string, text: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + data.length);
  out.set(iv);
  out.set(data, iv.length);
  return btoa(String.fromCharCode(...out));
};

export const decrypt = async (secret: string, b64: string) => {
  const all = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await key(secret), all.slice(12));
  return new TextDecoder().decode(plain);
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};
