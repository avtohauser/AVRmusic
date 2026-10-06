// Last.fm scrobbling: a listener connects their Last.fm account once (Профиль → Last.fm), then what they
// play goes there — "now playing" as it starts and a scrobble once it was heard long enough (Last.fm's
// rule: half the song or four minutes). The API key and secret are the admin's (Админка → Last.fm).
import crypto from 'node:crypto';
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { getMeta, setMeta } from './meta.js';

const API = 'https://ws.audioscrobbler.com/2.0/';

export function lastfmApp(db: DB): { key: string; secret: string } | null {
  const key = getMeta(db, 'lastfm.key'), secret = getMeta(db, 'lastfm.secret');
  return key && secret ? { key, secret } : null;
}

export function setLastfmApp(db: DB, key: string, secret: string | null) {
  setMeta(db, 'lastfm.key', key.trim());
  if (secret) setMeta(db, 'lastfm.secret', secret.trim());
}

/** Last.fm's signature: every parameter but format/callback, sorted, glued, the secret at the end, md5. */
export function lastfmSign(params: Record<string, string>, secret: string): string {
  const body = Object.keys(params).filter((k) => k !== 'format' && k !== 'callback').sort().map((k) => k + params[k]).join('');
  return crypto.createHash('md5').update(body + secret, 'utf8').digest('hex');
}

async function call(app: { key: string; secret: string }, method: string, params: Record<string, string>): Promise<any> {
  const p: Record<string, string> = { ...params, method, api_key: app.key };
  p.api_sig = lastfmSign(p, app.secret);
  p.format = 'json';
  const r = await fetch(API, { method: 'POST', body: new URLSearchParams(p), signal: AbortSignal.timeout(15_000) });
  const j = (await r.json().catch(() => null)) as any;
  if (!j || j.error) throw Object.assign(new Error(j?.message ?? `Last.fm ответил ${r.status}`), { code: j?.error ?? r.status });
  return j;
}

/* ---------- connecting an account ---------- */

const states = new Map<string, { userId: string; at: number }>();

export function lastfmAuthUrl(db: DB, userId: string): string {
  const app = lastfmApp(db);
  if (!app) throw new Error('Администратор ещё не подключил Last.fm (Админка → Last.fm)');
  for (const [k, v] of states) if (Date.now() - v.at > 15 * 60_000) states.delete(k);
  const state = crypto.randomBytes(16).toString('hex');
  states.set(state, { userId, at: Date.now() });
  const cb = `${config.publicUrl}/api/lastfm/callback?s=${state}`;
  return `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(app.key)}&cb=${encodeURIComponent(cb)}`;
}

/** Last.fm sends the listener back with a token: it becomes a session kept for them. */
export async function lastfmCallback(db: DB, token: string, state: string): Promise<string> {
  const s = states.get(state);
  if (!s || Date.now() - s.at > 15 * 60_000) throw new Error('Ссылка устарела — подключите Last.fm из приложения ещё раз');
  states.delete(state);
  const app = lastfmApp(db);
  if (!app) throw new Error('Last.fm не настроен');
  const j = await call(app, 'auth.getSession', { token });
  const key = j?.session?.key, name = j?.session?.name;
  if (!key) throw new Error('Last.fm не выдал доступ');
  db.prepare(`INSERT INTO lastfm_links (user_id, session_key, username) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET session_key = excluded.session_key, username = excluded.username, linked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(s.userId, key, name ?? null);
  return String(name ?? '');
}

export function lastfmLink(db: DB, userId: string): { username: string | null } | null {
  const l = db.prepare('SELECT username FROM lastfm_links WHERE user_id = ?').get(userId) as any;
  return l ? { username: l.username ?? null } : null;
}

export function unlinkLastfm(db: DB, userId: string) {
  db.prepare('DELETE FROM lastfm_links WHERE user_id = ?').run(userId);
}

/* ---------- what is played ---------- */

function trackParams(db: DB, trackId: string): Record<string, string> | null {
  const t = db.prepare(`SELECT t.title, t.duration_ms, ar.name artist, al.title album, aa.name album_artist FROM tracks t
    JOIN artists ar ON ar.id = t.artist_id LEFT JOIN albums al ON al.id = t.album_id LEFT JOIN artists aa ON aa.id = al.artist_id WHERE t.id = ?`).get(trackId) as any;
  if (!t) return null;
  const p: Record<string, string> = { artist: t.artist, track: t.title };
  if (t.album) p.album = t.album;
  if (t.album_artist && t.album_artist !== t.artist) p.albumArtist = t.album_artist;
  if (t.duration_ms) p.duration = String(Math.round(t.duration_ms / 1000));
  return p;
}

function session(db: DB, userId: string) {
  const app = lastfmApp(db);
  const l = app ? db.prepare('SELECT session_key FROM lastfm_links WHERE user_id = ?').get(userId) as any : null;
  return app && l ? { app, sk: l.session_key as string } : null;
}

/** A revoked session (error 9) unlinks the account; anything else is simply skipped. */
function failed(db: DB, userId: string) {
  return (e: any) => { if (e?.code === 9) unlinkLastfm(db, userId); };
}

const lastNow = new Map<string, string>();

export function lastfmNowPlaying(db: DB, userId: string, trackId: string | null, playing: boolean) {
  if (!trackId || !playing || lastNow.get(userId) === trackId) return;
  const s = session(db, userId);
  if (!s) return;
  lastNow.set(userId, trackId);
  const p = trackParams(db, trackId);
  if (p) call(s.app, 'track.updateNowPlaying', { ...p, sk: s.sk }).catch(failed(db, userId));
}

/** Last.fm's rule: a song over 30 s, heard for half of it or four minutes. */
export function scrobbleWorthy(durationMs: number, msPlayed: number): boolean {
  return durationMs > 30_000 && (msPlayed >= durationMs / 2 || msPlayed >= 240_000);
}

export function lastfmScrobble(db: DB, userId: string, trackId: string, msPlayed: number) {
  const s = session(db, userId);
  if (!s) return;
  const p = trackParams(db, trackId);
  if (!p || !scrobbleWorthy(Number(p.duration ?? 0) * 1000, msPlayed)) return;
  if (lastNow.get(userId) === trackId) lastNow.delete(userId);
  const timestamp = String(Math.floor((Date.now() - msPlayed) / 1000));
  call(s.app, 'track.scrobble', { ...p, timestamp, sk: s.sk }).catch(failed(db, userId));
}
