// A playlist (or album) from a link to another service — Yandex Music or Spotify — becomes a playlist
// here: each song is found in the library, or in the catalogue and fetched to the server, and added as
// soon as it is in. Runs as a fetch job, so it shows in "Загрузки на сервер" with its progress.
import type { DB } from '../lib/db.js';
import type { Job, JobApi } from './jobs.js';
import { findLibraryTrack, rawSearchTracks } from './catalog.js';
import { acquireTrack, type AcquireOutcome } from './acquire.js';
import { addTracks, createPlaylist } from './playlists.js';
import { indexPlaylist } from './search.js';

export interface LinkTrack { artist: string; title: string; durationSec?: number | null }
export interface LinkList { source: 'spotify' | 'yandex'; title: string; tracks: LinkTrack[] }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function getText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru,en;q=0.8' }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Сервис ответил ${r.status}`);
  return r.text();
}

async function getJson(url: string): Promise<any> {
  return JSON.parse(await getText(url));
}

/** Spotify: the public embed page carries the list (playlist, album or one track). */
async function spotify(type: string, id: string): Promise<LinkList> {
  const html = await getText(`https://open.spotify.com/embed/${type}/${id}`);
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('Spotify не отдал список треков');
  const data = JSON.parse(m[1]);
  const e = data?.props?.pageProps?.state?.data?.entity;
  if (!e) throw new Error('Spotify не отдал список треков');
  const list: any[] = e.trackList ?? (type === 'track' ? [{ title: e.name ?? e.title, subtitle: (e.artists ?? []).map((a: any) => a.name).join(', '), duration: e.duration }] : []);
  return {
    source: 'spotify',
    title: e.name ?? e.title ?? 'Spotify',
    tracks: list.map((t) => ({ title: String(t.title ?? ''), artist: String(t.subtitle ?? '').split(/,\s*/)[0], durationSec: t.duration ? Math.round(t.duration / 1000) : null })).filter((t) => t.title),
  };
}

/** Yandex Music: its public API answers for public playlists and albums without signing in. */
async function yandex(url: URL): Promise<LinkList> {
  const p = url.pathname.split('/').filter(Boolean);
  const api = 'https://api.music.yandex.net';
  const fromTracks = (title: string, items: any[]): LinkList => ({
    source: 'yandex', title,
    tracks: items.map((x) => x?.track ?? x).filter(Boolean).map((t: any) => ({
      title: [t.title, t.version ? `(${t.version})` : ''].filter(Boolean).join(' '),
      artist: t.artists?.[0]?.name ?? '',
      durationSec: t.durationMs ? Math.round(t.durationMs / 1000) : null,
    })).filter((t: LinkTrack) => t.title && t.artist),
  });
  // /users/<owner>/playlists/<kind>
  const u = p.indexOf('users');
  if (u >= 0 && p[u + 2] === 'playlists') {
    const r = (await getJson(`${api}/users/${encodeURIComponent(p[u + 1])}/playlists/${encodeURIComponent(p[u + 3])}`)).result;
    return fromTracks(r?.title ?? 'Яндекс Музыка', r?.tracks ?? []);
  }
  // /playlists/<uuid> (the new links)
  if (p[0] === 'playlists' && p[1]) {
    const r = (await getJson(`${api}/playlist/${encodeURIComponent(p[1])}`)).result;
    return fromTracks(r?.title ?? 'Яндекс Музыка', r?.tracks ?? []);
  }
  // /album/<id>/track/<id>
  if (p[0] === 'album' && p[2] === 'track' && p[3]) {
    const r = (await getJson(`${api}/tracks/${encodeURIComponent(p[3])}`)).result;
    return fromTracks(r?.[0]?.title ?? 'Яндекс Музыка', r ?? []);
  }
  // /album/<id>
  if (p[0] === 'album' && p[1]) {
    const r = (await getJson(`${api}/albums/${encodeURIComponent(p[1])}/with-tracks`)).result;
    return fromTracks(r?.title ?? 'Яндекс Музыка', (r?.volumes ?? []).flat());
  }
  throw new Error('Не понял ссылку Яндекс Музыки: нужна ссылка на плейлист, альбом или трек');
}

/** The list behind a link. */
export async function readLink(raw: string): Promise<LinkList> {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('Это не ссылка'); }
  const host = url.hostname.replace(/^www\./, '');
  if (host.endsWith('spotify.com')) {
    const m = /\/(playlist|album|track)\/([A-Za-z0-9]+)/.exec(url.pathname);
    if (!m) throw new Error('Нужна ссылка на плейлист, альбом или трек Spotify');
    return spotify(m[1], m[2]);
  }
  if (/^music\.yandex\.(ru|com|by|kz|uz)$/.test(host)) return yandex(url);
  throw new Error('Поддерживаются ссылки Яндекс Музыки и Spotify');
}

const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The catalogue's recording for a song from another service. */
async function findInCatalogue(db: DB, t: LinkTrack): Promise<any | null> {
  const results = await rawSearchTracks(db, `artist:"${t.artist}" track:"${t.title.replace(/\s*\(.*$/, '')}"`, 10).catch(() => [] as any[]);
  const more = results.length ? results : await rawSearchTracks(db, `${t.artist} ${t.title}`, 10).catch(() => [] as any[]);
  const wantT = norm(t.title), wantA = norm(t.artist);
  let best: any = null, bestScore = -1;
  for (const r of more) {
    const title = norm(r.title ?? ''), artist = norm(r.artist?.name ?? '');
    let s = 0;
    if (title === wantT) s += 3; else if (title.includes(wantT) || wantT.includes(title)) s += 2; else continue;
    if (artist === wantA) s += 3; else if (artist.includes(wantA) || wantA.includes(artist)) s += 1.5; else continue;
    if (t.durationSec && r.duration) s -= Math.min(2, Math.abs(r.duration - t.durationSec) / 10);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return best;
}

/** The job: the playlist is made at once and fills up song by song. */
export async function runLinkImport(db: DB, job: Job, payload: { url: string; userId: string; canAcquire: boolean }, api: JobApi) {
  let cancelled = false;
  const cancelRef: { cancel?: () => void } = {};
  api.onCancel(() => { cancelled = true; cancelRef.cancel?.(); });
  api.log(`🔗 ${payload.url}`);
  const list = await readLink(payload.url);
  if (!list.tracks.length) throw new Error('В плейлисте нет треков (или он закрыт)');
  const source = list.source === 'spotify' ? 'Spotify' : 'Яндекс Музыки';
  const playlistId = createPlaylist(db, payload.userId, { title: list.title.slice(0, 120), description: `Из ${source}`, isPublic: false });
  job.title = `Импорт: ${list.title}`;
  job.stats = { total: list.tracks.length, added: 0, fetched: 0, missing: 0 };
  api.log(`📋 «${list.title}» — ${list.tracks.length} треков`);
  for (const [i, t] of list.tracks.entries()) {
    if (cancelled) throw new Error('Отменено');
    api.log(`${i + 1}/${list.tracks.length} ${t.artist} — ${t.title}`);
    let id = findLibraryTrack(db, { artist: t.artist, title: t.title, featuring: [], durationSec: t.durationSec });
    if (!id) {
      const raw = await findInCatalogue(db, t);
      if (raw) {
        id = findLibraryTrack(db, { deezerId: raw.id, artist: raw.artist?.name ?? t.artist, title: raw.title, featuring: [], durationSec: raw.duration });
        if (!id && payload.canAcquire) {
          const out: AcquireOutcome = await acquireTrack(db, raw.id, api, cancelRef, undefined, payload.userId).catch((e) => ({ status: 'error', message: String(e?.message ?? e) }));
          if (out.trackId) { id = out.trackId; job.stats.fetched++; }
        }
      }
    }
    if (id) { addTracks(db, playlistId, [id], payload.userId); job.stats.added++; }
    else { job.stats.missing++; api.log('   ✗ не нашёл'); }
    api.progress(((i + 1) / list.tracks.length) * 100);
  }
  indexPlaylist(db, playlistId);
  api.log(`✓ готово: ${job.stats.added} из ${list.tracks.length}`);
}
