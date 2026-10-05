// Moving a whole music library here from another service:
//  - Spotify: the listener signs in to Spotify (the admin sets up a Spotify app once); the liked songs,
//    every playlist, the followed artists and the saved albums come over — songs found by their ISRC;
//  - Yandex Music: by the listener's public profile — every public playlist and "Мне нравится";
//  - any service: a pasted list ("Artist — Title" per line) or a CSV export (e.g. Exportify).
// Liked songs become likes, playlists become playlists, followed artists are followed here (their new
// releases come in). Songs not in the library are fetched from the catalogue. Runs as one fetch job.
import crypto from 'node:crypto';
import type { DB } from '../lib/db.js';
import type { Job, JobApi } from './jobs.js';
import { findLibraryTrack, rawSearchArtists } from './catalog.js';
import { acquireTrack, type AcquireOutcome } from './acquire.js';
import { addTracks, createPlaylist } from './playlists.js';
import { indexPlaylist } from './search.js';
import { findInCatalogue, getJson, type LinkTrack } from './linkImport.js';

export interface TransferPlaylist { title: string; tracks: LinkTrack[] }
export interface TransferPayload {
  kind: 'transfer';
  source: 'spotify' | 'yandex' | 'list';
  userId: string;
  canAcquire: boolean;
  liked?: LinkTrack[];
  playlists?: TransferPlaylist[];
  artists?: string[];
  albums?: Array<{ title: string; artist: string }>;
}

const SOURCE_NAME = { spotify: 'Spotify', yandex: 'Яндекс Музыки', list: 'списка' } as const;

/* ---------- settings: the admin's Spotify app ---------- */

export function spotifyApp(db: DB): { clientId: string; secret: string } | null {
  const get = (k: string) => (db.prepare('SELECT value FROM app_meta WHERE key = ?').get(k) as any)?.value as string | undefined;
  const clientId = get('spotify.client_id'), secret = get('spotify.client_secret');
  return clientId && secret ? { clientId, secret } : null;
}

export function setSpotifyApp(db: DB, clientId: string, secret: string | null) {
  const put = db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  put.run('spotify.client_id', clientId.trim());
  if (secret) put.run('spotify.client_secret', secret.trim());
}

/* ---------- Spotify sign-in ---------- */

const states = new Map<string, { userId: string; at: number; redirect: string }>();

export function spotifyAuthorizeUrl(db: DB, userId: string, redirect: string): string {
  const app = spotifyApp(db);
  if (!app) throw new Error('Администратор ещё не подключил Spotify (Админка → Spotify)');
  for (const [k, v] of states) if (Date.now() - v.at > 15 * 60_000) states.delete(k);
  const state = crypto.randomBytes(16).toString('hex');
  states.set(state, { userId, at: Date.now(), redirect });
  const q = new URLSearchParams({
    client_id: app.clientId, response_type: 'code', redirect_uri: redirect, state,
    scope: 'user-library-read playlist-read-private playlist-read-collaborative user-follow-read',
    show_dialog: 'true',
  });
  return `https://accounts.spotify.com/authorize?${q}`;
}

async function spotifyGet(token: string, url: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url.startsWith('http') ? url : `https://api.spotify.com/v1${url}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    // rate limited: wait as asked
    if (r.status === 429) { await new Promise((res) => setTimeout(res, (Number(r.headers.get('retry-after') ?? 2) + 1) * 1000)); continue; }
    if (!r.ok) throw new Error(`Spotify ответил ${r.status}`);
    return r.json();
  }
  throw new Error('Spotify просит подождать — попробуйте позже');
}

/** Every page of a Spotify list. */
async function spotifyAll(token: string, first: string, cap = 10_000): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = first;
  while (next && out.length < cap) {
    const page: any = await spotifyGet(token, next);
    const box = page.artists ?? page;
    out.push(...(box.items ?? []));
    next = box.next ?? null;
  }
  return out;
}

const spTrack = (t: any): LinkTrack | null => t && t.name && t.artists?.length
  ? { title: t.name, artist: t.artists[0].name, durationSec: t.duration_ms ? Math.round(t.duration_ms / 1000) : null, isrc: t.external_ids?.isrc ?? null }
  : null;

/** The sign-in came back: read the whole library and start moving it. */
export async function spotifyCallback(db: DB, code: string, state: string): Promise<{ userId: string; payload: Omit<TransferPayload, 'canAcquire'> }> {
  const s = states.get(state);
  if (!s) throw new Error('Ссылка входа устарела — начните перенос заново');
  states.delete(state);
  const app = spotifyApp(db)!;
  const tr = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${app.clientId}:${app.secret}`).toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: s.redirect }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!tr.ok) throw new Error(`Spotify не пустил (${tr.status})`);
  const token = (await tr.json() as any).access_token as string;
  const liked = (await spotifyAll(token, '/me/tracks?limit=50')).map((x) => spTrack(x.track)).filter((x): x is LinkTrack => !!x);
  const me = await spotifyGet(token, '/me').catch(() => ({}));
  const playlists: TransferPlaylist[] = [];
  for (const p of await spotifyAll(token, '/me/playlists?limit=50', 500)) {
    if (!p?.id) continue;
    const items = await spotifyAll(token, `/playlists/${p.id}/tracks?limit=100&fields=items(track(name,duration_ms,artists(name),external_ids(isrc))),next`).catch(() => [] as any[]);
    const tracks = items.map((x) => spTrack(x.track)).filter((x): x is LinkTrack => !!x);
    if (tracks.length) playlists.push({ title: String(p.name ?? 'Spotify').slice(0, 120), tracks });
  }
  const artists = (await spotifyAll(token, '/me/following?type=artist&limit=50').catch(() => [] as any[])).map((a) => String(a.name)).filter(Boolean);
  const albums = (await spotifyAll(token, '/me/albums?limit=50').catch(() => [] as any[])).map((x) => ({ title: String(x.album?.name ?? ''), artist: String(x.album?.artists?.[0]?.name ?? '') })).filter((a) => a.title);
  void me;
  return { userId: s.userId, payload: { kind: 'transfer', source: 'spotify', userId: s.userId, liked, playlists, artists, albums } };
}

/* ---------- Yandex Music: a public profile ---------- */

const YA = 'https://api.music.yandex.net';

/** "https://music.yandex.ru/users/<login>/…" or just the login. */
export function yandexLogin(raw: string): string {
  const v = raw.trim();
  const m = /\/users\/([^/?#]+)/.exec(v);
  return decodeURIComponent(m ? m[1] : v.replace(/^@/, ''));
}

const yaTracks = (items: any[]): LinkTrack[] => items.map((x) => x?.track ?? x).filter(Boolean).map((t: any) => ({
  title: [t.title, t.version ? `(${t.version})` : ''].filter(Boolean).join(' '),
  artist: t.artists?.[0]?.name ?? '',
  durationSec: t.durationMs ? Math.round(t.durationMs / 1000) : null,
})).filter((t: LinkTrack) => t.title && t.artist);

/** The public playlists of a Yandex Music profile (and whether "Мне нравится" is open). */
export async function yandexProfile(login: string): Promise<{ login: string; likes: number | null; playlists: Array<{ kind: number; title: string; count: number; cover: string | null }> }> {
  const list = (await getJson(`${YA}/users/${encodeURIComponent(login)}/playlists/list`).catch(() => null))?.result;
  if (!Array.isArray(list)) throw new Error('Профиль не открылся: проверьте логин и что профиль публичный (Яндекс Музыка → Настройки → Публичный профиль)');
  const likes = (await getJson(`${YA}/users/${encodeURIComponent(login)}/playlists/3`).catch(() => null))?.result;
  const cover = (c: any) => (c?.uri ? `https://${String(c.uri).replace('%%', '400x400')}` : null);
  return {
    login,
    likes: likes?.trackCount ?? (Array.isArray(likes?.tracks) ? likes.tracks.length : null),
    playlists: list.filter((p: any) => p.kind !== 3).map((p: any) => ({ kind: p.kind, title: p.title, count: p.trackCount ?? 0, cover: cover(p.cover) })),
  };
}

export async function yandexPayload(login: string, kinds: number[], withLikes: boolean): Promise<Pick<TransferPayload, 'liked' | 'playlists'>> {
  const playlists: TransferPlaylist[] = [];
  for (const k of kinds) {
    const r = (await getJson(`${YA}/users/${encodeURIComponent(login)}/playlists/${k}`).catch(() => null))?.result;
    if (r) playlists.push({ title: String(r.title ?? 'Яндекс Музыка').slice(0, 120), tracks: yaTracks(r.tracks ?? []) });
  }
  const liked = withLikes ? yaTracks((await getJson(`${YA}/users/${encodeURIComponent(login)}/playlists/3`).catch(() => null))?.result?.tracks ?? []) : [];
  return { liked, playlists };
}

/* ---------- a pasted list or a CSV file ---------- */

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** "Artist — Title" lines, or a CSV with track / artist (/ ISRC / duration) columns. */
export function parseList(text: string): LinkTrack[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = (lines[0] ?? '').toLowerCase();
  if (/track|title|название/.test(head) && /artist|исполнитель/.test(head) && /[,;]/.test(head)) {
    const rows = csvRows(text);
    const h = rows[0].map((x) => x.toLowerCase().trim());
    const col = (re: RegExp) => h.findIndex((x) => re.test(x));
    const ti = col(/^(track name|title|track|название|трек)/), ai = col(/^(artist name|artist|исполнитель)/), ii = col(/isrc/), di = col(/duration|длит/);
    return rows.slice(1).map((r) => {
      const ms = di >= 0 ? Number(r[di]) : 0;
      return { title: (r[ti] ?? '').trim(), artist: (r[ai] ?? '').split(/[,;]\s*/)[0].trim(), isrc: ii >= 0 ? (r[ii] || null) : null, durationSec: ms > 1000 ? Math.round(ms / 1000) : ms || null };
    }).filter((t) => t.title && t.artist);
  }
  return lines.map((l) => {
    const m = /^(.+?)\s+[—–-]\s+(.+)$/.exec(l.replace(/^\d+[.)]\s*/, ''));
    return m ? { artist: m[1].trim(), title: m[2].trim() } : null;
  }).filter((t): t is LinkTrack => !!t);
}

/* ---------- the job ---------- */

export async function runTransfer(db: DB, job: Job, p: TransferPayload, api: JobApi) {
  let cancelled = false;
  const cancelRef: { cancel?: () => void } = {};
  api.onCancel(() => { cancelled = true; cancelRef.cancel?.(); });
  const liked = p.liked ?? [], playlists = p.playlists ?? [], artists = p.artists ?? [], albums = p.albums ?? [];
  const total = liked.length + playlists.reduce((n, x) => n + x.tracks.length, 0) + artists.length + albums.length;
  if (!total) throw new Error('Нечего переносить: список пуст');
  job.stats = { total, added: 0, fetched: 0, missing: 0, liked: 0, playlists: 0, artists: 0 };
  const stats = job.stats;
  let done = 0;
  const step = () => api.progress((++done / total) * 100);
  // the same song in several lists is looked for once
  const found = new Map<string, string | null>();
  const resolve = async (t: LinkTrack): Promise<string | null> => {
    const key = `${t.isrc ?? ''}|${t.artist.toLowerCase()}|${t.title.toLowerCase()}`;
    if (found.has(key)) return found.get(key)!;
    let id = findLibraryTrack(db, { isrc: t.isrc ?? null, artist: t.artist, title: t.title, featuring: [], durationSec: t.durationSec });
    if (!id) {
      const raw = await findInCatalogue(db, t).catch(() => null);
      if (raw) {
        id = findLibraryTrack(db, { deezerId: raw.id, isrc: raw.isrc ?? null, artist: raw.artist?.name ?? t.artist, title: raw.title, featuring: [], durationSec: raw.duration });
        if (!id && p.canAcquire) {
          const out: AcquireOutcome = await acquireTrack(db, raw.id, api, cancelRef, undefined, p.userId).catch((e) => ({ status: 'error', message: String(e?.message ?? e) }));
          if (out.trackId) { id = out.trackId; stats.fetched++; }
        }
      }
    }
    found.set(key, id);
    return id;
  };

  api.log(`📦 Перенос из ${SOURCE_NAME[p.source]}: ${liked.length} любимых, ${playlists.length} плейлистов, ${artists.length} исполнителей`);
  // followed artists first (quick, and their releases start coming)
  for (const name of artists) {
    if (cancelled) throw new Error('Отменено');
    const a = (await rawSearchArtists(db, name, 3).catch(() => [] as any[])).find((x) => x.name?.toLowerCase() === name.toLowerCase()) ?? null;
    if (a) {
      db.prepare('INSERT OR IGNORE INTO artist_follows (user_id, deezer_artist_id, name) VALUES (?,?,?)').run(p.userId, a.id, a.name);
      const lib = db.prepare('SELECT id FROM artists WHERE deezer_id = ?').get(a.id) as any;
      if (lib) db.prepare("INSERT OR IGNORE INTO likes(user_id, entity_type, entity_id) VALUES (?, 'artist', ?)").run(p.userId, lib.id);
      stats.artists++;
    }
    step();
  }
  // liked songs become likes (newest first stays newest: liked in reverse)
  if (liked.length) api.log(`♥ Любимые: ${liked.length}`);
  for (const [i, t] of [...liked].reverse().entries()) {
    if (cancelled) throw new Error('Отменено');
    if (i % 25 === 0) api.log(`   ${i + 1}/${liked.length} ${t.artist} — ${t.title}`);
    const id = await resolve(t);
    if (id) { db.prepare("INSERT OR IGNORE INTO likes(user_id, entity_type, entity_id) VALUES (?, 'track', ?)").run(p.userId, id); stats.liked++; stats.added++; }
    else stats.missing++;
    step();
  }
  // playlists become playlists
  for (const pl of playlists) {
    if (cancelled) throw new Error('Отменено');
    api.log(`📋 «${pl.title}» — ${pl.tracks.length}`);
    const playlistId = createPlaylist(db, p.userId, { title: pl.title, description: `Из ${SOURCE_NAME[p.source]}`, isPublic: false });
    stats.playlists++;
    for (const t of pl.tracks) {
      if (cancelled) throw new Error('Отменено');
      const id = await resolve(t);
      if (id) { addTracks(db, playlistId, [id], p.userId); stats.added++; } else stats.missing++;
      step();
    }
    indexPlaylist(db, playlistId);
  }
  // saved albums: liked when the library has them
  for (const al of albums) {
    const lib = db.prepare('SELECT al.id FROM albums al JOIN artists a ON a.id = al.artist_id WHERE lower(al.title) = lower(?) AND lower(a.name) = lower(?)').get(al.title, al.artist) as any;
    if (lib) db.prepare("INSERT OR IGNORE INTO likes(user_id, entity_type, entity_id) VALUES (?, 'album', ?)").run(p.userId, lib.id);
    step();
  }
  api.log(`✓ Готово: перенесено ${stats.added}, скачано ${stats.fetched}, не нашлось ${stats.missing}`);
}
