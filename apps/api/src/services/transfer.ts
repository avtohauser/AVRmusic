// Moving a whole music library here from another service:
//  - Spotify: the listener signs in to Spotify (the admin sets up a Spotify app once); the liked songs,
//    every playlist, the followed artists and the saved albums come over — songs found by their ISRC;
//  - Yandex Music: the listener signs in with a code; their app reads "Мне нравится", every playlist, the
//    liked artists and albums and sends the lists (Yandex keeps its API closed to servers abroad);
//  - VK Music: VK gives no way in for other apps, so the listener saves their own music page (or a playlist's)
//    from the browser and uploads the file; the songs are read from it — names only, nothing is fetched from VK;
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
import { findInCatalogue, type LinkTrack } from './linkImport.js';

export interface TransferPlaylist { title: string; tracks: LinkTrack[] }
export interface TransferPayload {
  kind: 'transfer';
  source: 'spotify' | 'yandex' | 'vk' | 'list';
  userId: string;
  canAcquire: boolean;
  liked?: LinkTrack[];
  playlists?: TransferPlaylist[];
  artists?: string[];
  albums?: Array<{ title: string; artist: string }>;
}

const SOURCE_NAME = { spotify: 'Spotify', yandex: 'Яндекс Музыки', vk: 'ВК Музыки', list: 'списка' } as const;

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

/* ---------- Yandex Music: signing in with a code ---------- */

// Public profiles are gone and Yandex keeps the music API closed to servers abroad (451), so: the server
// asks Yandex for a sign-in code (the listener confirms it at ya.ru/device), hands the token to the
// listener's own app, and the app — at home, where Yandex lets it in — reads the library and sends the
// lists here (POST /api/transfer/import). The client is the Yandex Music app's own (as the open-source
// Yandex Music clients use): Yandex offers no other way to read one's library. Nothing is stored.
const YA_CLIENT = '23cabbbdc6cd418abb4b39c32c41195d';
const YA_SECRET = '53bc75238f0c4d08a118e51fe9203300';
interface YaLogin { userId: string; deviceCode: string; expires: number; token?: string }
const yaLogins = new Map<string, YaLogin>();

const yaForm = (url: string, body: Record<string, string>) => fetch(url, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), signal: AbortSignal.timeout(20_000),
});

/** A code for ya.ru/device. */
export async function yandexLoginStart(userId: string): Promise<{ id: string; userCode: string; url: string; interval: number; expiresIn: number }> {
  for (const [k, v] of yaLogins) if (Date.now() > v.expires) yaLogins.delete(k);
  const r = await yaForm('https://oauth.yandex.ru/device/code', { client_id: YA_CLIENT, device_id: crypto.randomBytes(16).toString('hex'), device_name: 'AVRmusic' });
  const j = await r.json().catch(() => ({})) as any;
  if (!r.ok || !j.device_code) throw new Error(`Яндекс не дал код входа (${j.error_description ?? r.status})`);
  const id = crypto.randomBytes(12).toString('hex');
  const expiresIn = Number(j.expires_in ?? 300);
  yaLogins.set(id, { userId, deviceCode: j.device_code, expires: Date.now() + expiresIn * 1000 });
  return { id, userCode: String(j.user_code), url: String(j.verification_url ?? 'https://ya.ru/device'), interval: Number(j.interval ?? 5), expiresIn };
}

/** Has the listener confirmed the code yet? Then the token goes to them (and only them). */
export async function yandexLoginPoll(id: string, userId: string): Promise<{ status: 'pending' | 'ready' | 'expired' | 'denied'; token?: string; message?: string }> {
  const s = yaLogins.get(id);
  if (!s || s.userId !== userId || Date.now() > s.expires) { yaLogins.delete(id); return { status: 'expired' }; }
  if (s.token) return { status: 'ready', token: s.token };
  const r = await yaForm('https://oauth.yandex.ru/token', { grant_type: 'device_code', code: s.deviceCode, client_id: YA_CLIENT, client_secret: YA_SECRET });
  const j = await r.json().catch(() => ({})) as any;
  if (j.access_token) { s.token = String(j.access_token); s.expires = Date.now() + 10 * 60_000; return { status: 'ready', token: s.token }; }
  if (j.error === 'authorization_pending' || j.error === 'slow_down') return { status: 'pending' };
  yaLogins.delete(id);
  if (j.error === 'expired_token') return { status: 'expired' };
  return { status: 'denied', message: j.error_description ?? 'Яндекс не подтвердил вход' };
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

/* ---------- VK Music: a page the listener saved from the browser ---------- */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', laquo: '«', raquo: '»' };
const unescapeHtml = (x: string) => x.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});
// VK escapes names twice in places ("&amp;amp;"), and a name may carry a highlight tag
const cleanName = (x: unknown) => unescapeHtml(unescapeHtml(String(x ?? '').replace(/<[^>]*>/g, ''))).replace(/\s+/g, ' ').trim();
const toSec = (x: string) => { const [m, sec] = x.split(':').map(Number); return Number.isFinite(m) && Number.isFinite(sec) ? m * 60 + sec : null; };

export interface VkPage { title: string | null; mine: boolean; tracks: LinkTrack[] }

/**
 * The songs on a VK page saved from the browser: the full site (each row carries its song as data-audio:
 * [id, owner, url, title, performer, duration, …]), its newer rows (performer / title / duration blocks) or the
 * mobile site (ai_title / ai_artist). Text that is not a page is read as a plain list. "mine" — the listener's own
 * music (it goes to likes), otherwise it is a playlist called as the page is.
 */
export function parseVkPage(content: string, fileName = ''): VkPage {
  const seen = new Set<string>();
  const tracks: LinkTrack[] = [];
  const add = (artist: string, title: string, durationSec: number | null) => {
    if (!artist || !title) return;
    const key = `${artist.toLowerCase()}|${title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    tracks.push({ artist, title, durationSec });
  };
  const isPage = /<html|<body|<div[\s>]/i.test(content.slice(0, 200_000));
  if (!isPage) {
    for (const t of parseList(content)) add(t.artist, t.title, t.durationSec ?? null);
  } else {
    for (const m of content.matchAll(/data-audio="([^"]*)"/g)) {
      try {
        const a = JSON.parse(unescapeHtml(m[1]));
        if (Array.isArray(a)) add(cleanName(a[4]), cleanName(a[3]), Number(a[5]) > 0 ? Number(a[5]) : null);
      } catch { /* a row that is not a song */ }
    }
    if (!tracks.length) {
      // rows without data-audio: the performer, the title and the duration in their own blocks
      for (const row of content.split(/class="[^"]*\baudio_row\b/).slice(1)) {
        const performer = /audio_row__performers[^>]*>([\s\S]*?)<\/div>/.exec(row)?.[1];
        const title = /audio_row__title_inner[^>]*>([\s\S]*?)<\/(?:span|div)>/.exec(row)?.[1];
        const dur = /audio_row__duration[^>]*>\s*(\d{1,2}:\d{2})/.exec(row)?.[1];
        if (performer && title) add(cleanName(performer), cleanName(title), dur ? toSec(dur) : null);
      }
    }
    if (!tracks.length) {
      // the mobile site
      for (const row of content.split(/class="[^"]*\bai_info\b/).slice(1)) {
        const title = /class="[^"]*\bai_title\b[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/.exec(row)?.[1];
        const artist = /class="[^"]*\bai_artist\b[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/.exec(row)?.[1];
        const dur = /data-dur="(\d+)"/.exec(row)?.[1];
        if (title && artist) add(cleanName(artist), cleanName(title), dur ? Number(dur) : null);
      }
    }
  }
  const raw = isPage ? cleanName(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(content)?.[1] ?? '') : '';
  const title = raw.replace(/\s*[|—–-]\s*(ВКонтакте|VK|ВК)\s*$/i, '').trim() || fileName.replace(/\.[^.]+$/, '').trim() || null;
  // VK calls one's own music "Музыка" or "Аудиозаписи <name>"; a playlist is called as it is
  const mine = /^(моя )?музыка$|^(мои )?аудиозаписи(\s|$)|^(my )?(music|audio)$/i.test((title ?? '').trim());
  return { title, mine, tracks };
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
