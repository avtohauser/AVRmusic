import type { AuthTokens } from '@avrmusic/shared';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}

type Tokens = Pick<AuthTokens, 'accessToken' | 'refreshToken' | 'mediaToken'>;

const STORAGE_KEY = 'avr.auth';

export function loadStoredAuth(): (Tokens & { user: AuthTokens['user'] }) | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function storeAuth(a: (Tokens & { user: AuthTokens['user'] }) | null) {
  try {
    if (a) localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

let tokens: Tokens | null = loadStoredAuth();
let onAuthChange: ((t: AuthTokens | null) => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export function setTokens(t: Tokens | null) {
  tokens = t;
}
export function getMediaToken(): string | null {
  return tokens?.mediaToken ?? null;
}
export function onAuthUpdate(cb: (t: AuthTokens | null) => void) {
  onAuthChange = cb;
}

async function refresh(): Promise<boolean> {
  if (!tokens?.refreshToken) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: tokens!.refreshToken }) });
        if (!res.ok) throw new Error('refresh failed');
        const data = (await res.json()) as AuthTokens;
        tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken, mediaToken: data.mediaToken };
        onAuthChange?.(data);
        return true;
      } catch {
        tokens = null;
        onAuthChange?.(null);
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (tokens?.accessToken) headers.authorization = `Bearer ${tokens.accessToken}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(path, { method, headers, body: payload });
  if (res.status === 401 && retry && tokens?.refreshToken) {
    const ok = await refresh();
    if (ok) return request<T>(method, path, body, false);
  }
  if (!res.ok) {
    let msg = res.statusText;
    let code = 'error';
    try { const j = await res.json(); msg = j.message ?? msg; code = j.error ?? code; } catch { /* ignore */ }
    throw new ApiError(res.status, msg, code);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('json') ? await res.json() : await res.text()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  /** Upload with progress (XHR). */
  upload<T>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', path);
      if (tokens?.accessToken) xhr.setRequestHeader('authorization', `Bearer ${tokens.accessToken}`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = async () => {
        if (xhr.status === 401 && (await refresh())) return this.upload<T>(path, form, onProgress).then(resolve, reject);
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { resolve(xhr.responseText as unknown as T); }
        } else {
          let msg = xhr.statusText;
          try { msg = JSON.parse(xhr.responseText).message ?? msg; } catch { /* ignore */ }
          reject(new ApiError(xhr.status, msg));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, 'Сеть недоступна'));
      xhr.send(form);
    });
  },
};

/** URL for <audio>/<video>/<img> that must carry auth: uses the long-lived media token. */
export function mediaUrl(path: string): string {
  const t = getMediaToken();
  return t ? `${path}${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(t)}` : path;
}
export const streamUrl = (trackId: string) => mediaUrl(`/api/stream/${trackId}`);
export const downloadUrl = (trackId: string) => mediaUrl(`/api/download/${trackId}`);
export const albumZipUrl = (albumId: string) => mediaUrl(`/api/download/album/${albumId}`);
export const playlistZipUrl = (playlistId: string) => mediaUrl(`/api/download/playlist/${playlistId}`);
export const canvasUrl = (trackId: string) => mediaUrl(`/api/canvas/${trackId}`);
