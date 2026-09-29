// Acquisition pipeline: catalogue track → best matching audio from the configured sources
// (YouTube/SoundCloud via yt-dlp, Audius, Internet Archive, Jamendo) → tagged library track.
import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import type { DB } from '../lib/db.js';
import type { Track } from '@avrmusic/shared';
import { config } from '../config.js';
import { hashFile, nameKey, newId } from '../lib/util.js';
import { findLibraryTrack, rawAlbum, rawArtist, rawArtistAllAlbums, rawArtistFeatures, rawFeaturing, rawTrack, parseFeaturing } from './catalog.js';
import { saveCover } from './importer.js';
import { indexAlbum, indexArtist, indexTrack } from './search.js';
import { getTracksByIds } from './library.js';
import { fetchLyricsForTrack } from './lrclib.js';
import { queueCanvasesForImported } from './canvas.js';
import type { Job } from './jobs.js';
import { enabledSources, type CancelRef, type Source, type SourceCandidate, type Want } from './sources/index.js';

type JobApi = { log: (s: string) => void; progress: (p: number) => void; onCancel: (fn: () => void) => void };
export type Candidate = SourceCandidate;
export type { Want };

const BAD = /\b(live|cover|karaoke|instrumental|remix|reaction|slowed|sped ?up|nightcore|8d|tutorial|lesson|lyrics? video|dance video|choreo|parody|mashup|edit|extended|acoustic|версия|кавер|минус|караоке|ремикс)\b/i;
const norm = (s: string) => nameKey(s).replace(/\s+/g, ' ');

/** Higher is better. Exposed for tests. */
export function scoreCandidate(c: Pick<SourceCandidate, 'title' | 'duration' | 'channel' | 'uploader' | 'artist' | 'quality' | 'source'>, w: Want): number {
  let s = 0;
  const t = norm(c.title);
  const title = norm(w.title);
  const artist = norm(w.artist);
  if (t.includes(title)) s += 30; else { const words = title.split(' ').filter(Boolean); const hit = words.filter((x) => t.includes(x)).length; s += (hit / Math.max(1, words.length)) * 20; }
  const ch = norm(`${c.channel ?? ''} ${c.uploader ?? ''} ${c.artist ?? ''}`);
  if (t.includes(artist) || ch.includes(artist)) s += 20;
  if (/ - topic$/i.test(c.channel ?? '') || /provided to youtube/i.test(c.title)) s += 15; // auto-generated official audio
  if (/official audio|official|официаль/i.test(c.title)) s += 6;
  if (c.duration && w.durationSec) {
    const d = Math.abs(c.duration - w.durationSec);
    s += d <= 3 ? 25 : d <= 8 ? 18 : d <= 15 ? 8 : d <= 30 ? -5 : -40;
  } else s -= 5;
  const wantBad = BAD.test(w.title);
  if (!wantBad && BAD.test(c.title)) s -= 35;
  if (/\bvideo\b|клип/i.test(c.title) && !/audio/i.test(c.title)) s -= 4;
  if (c.quality?.lossless) s += 12;
  else if ((c.quality?.bitrate ?? 0) >= 256) s += 4;
  const order = config.acquireSources.indexOf(c.source as any);
  if (order >= 0) s += Math.max(0, 6 - order * 2); // configured preference
  return s;
}

/** Query every enabled source in parallel and rank the merged candidates. */
export async function findCandidates(w: Want, log?: (s: string) => void): Promise<Array<{ c: SourceCandidate; s: number; src: Source }>> {
  const sources = enabledSources();
  const results = await Promise.allSettled(sources.map(async (src) => {
    const a = await src.available();
    if (!a.ok) return { src, cands: [] as SourceCandidate[] };
    return { src, cands: await src.search(w) };
  }));
  const ranked: Array<{ c: SourceCandidate; s: number; src: Source }> = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') { log?.(`   ${sources[i].label}: ${r.reason?.message ?? r.reason}`); return; }
    for (const c of r.value.cands) ranked.push({ c, s: scoreCandidate(c, w), src: r.value.src });
  });
  return ranked.sort((a, b) => b.s - a.s);
}

/** Search a single source (used by the URL/legacy path and tests). */
export async function searchCandidates(w: Want, n = 8): Promise<SourceCandidate[]> {
  const src = enabledSources()[0];
  if (!src) return [];
  return (await src.search(w)).slice(0, n);
}

async function fetchToCover(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return saveCover(buf, res.headers.get('content-type') || 'image/jpeg');
  } catch { return null; }
}

async function ensureCatalogArtist(db: DB, a: { id: number; name: string; picture_xl?: string; picture_big?: string }): Promise<string> {
  const byDz = db.prepare('SELECT id, image_path FROM artists WHERE deezer_id = ?').get(a.id) as any;
  if (byDz) return byDz.id;
  const key = nameKey(a.name) || a.name.toLowerCase();
  const byName = db.prepare('SELECT id, image_path FROM artists WHERE name_key = ?').get(key) as any;
  const img = (!byName || !byName.image_path) ? await fetchToCover(a.picture_xl || a.picture_big) : null;
  if (byName) {
    db.prepare('UPDATE artists SET deezer_id = ?, image_path = COALESCE(image_path, ?) WHERE id = ?').run(a.id, img, byName.id);
    return byName.id;
  }
  const id = newId();
  db.prepare('INSERT INTO artists(id, name, name_key, image_path, deezer_id, verified) VALUES (?,?,?,?,?,1)').run(id, a.name, key, img, a.id);
  indexArtist(db, id);
  return id;
}

async function ensureCatalogAlbum(db: DB, al: any, artistId: string): Promise<string> {
  const byDz = db.prepare('SELECT id FROM albums WHERE deezer_id = ?').get(al.id) as any;
  if (byDz) return byDz.id;
  const key = nameKey(al.title) || al.title.toLowerCase();
  const year = al.release_date ? Number(String(al.release_date).slice(0, 4)) || null : null;
  const type = al.record_type === 'single' ? 'single' : al.record_type === 'ep' ? 'ep' : al.record_type === 'compile' ? 'compilation' : 'album';
  const existing = db.prepare('SELECT id FROM albums WHERE artist_id = ? AND title_key = ?').get(artistId, key) as any;
  const cover = await fetchToCover(al.cover_xl || al.cover_big || al.cover_medium);
  if (existing) {
    db.prepare('UPDATE albums SET deezer_id = ?, cover_path = COALESCE(cover_path, ?), year = COALESCE(year, ?), release_date = COALESCE(release_date, ?), label = COALESCE(label, ?) WHERE id = ?').run(al.id, cover, year, al.release_date ?? null, al.label ?? null, existing.id);
    return existing.id;
  }
  const id = newId();
  db.prepare('INSERT INTO albums(id, artist_id, title, title_key, year, release_date, type, cover_path, label, deezer_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, artistId, al.title, key, year, al.release_date ?? null, type, cover, al.label ?? null, al.id);
  indexAlbum(db, id);
  return id;
}

export type AcquireOutcome = { status: 'imported' | 'exists' | 'notfound' | 'error'; trackId?: string; message?: string };

/** Fetch one catalogue track into the library. */
export async function acquireTrack(db: DB, deezerTrackId: number, api: JobApi, cancelRef: { cancel?: () => void }, albumRaw?: any): Promise<AcquireOutcome> {
  const exists = db.prepare('SELECT id FROM tracks WHERE deezer_id = ?').get(deezerTrackId) as any;
  if (exists) return { status: 'exists', trackId: exists.id };
  const t = await rawTrack(db, deezerTrackId);
  const { title, featuring: featNames } = parseFeaturing(t.title ?? '', t.title_short);
  const artistName = t.artist?.name ?? 'Unknown';
  // Same recording already in the library (same ISRC, or same artist + title + featured artists + length)?
  // A solo version and a "feat." version of a song are different tracks and are both imported.
  const same = findLibraryTrack(db, { isrc: t.isrc ?? null, artist: artistName, title, featuring: rawFeaturing(t), durationSec: Number(t.duration ?? 0) || null });
  if (same) { db.prepare('UPDATE tracks SET deezer_id = COALESCE(deezer_id, ?), isrc = COALESCE(isrc, ?) WHERE id = ?').run(deezerTrackId, t.isrc ?? null, same); return { status: 'exists', trackId: same }; }

  const want: Want = { title, artist: artistName, durationSec: Number(t.duration ?? 0), featuring: featNames, album: t.album?.title ?? null };
  api.log(`🔎 ${artistName} — ${title}`);
  const ranked = await findCandidates(want, api.log);
  if (!ranked.length) return { status: 'notfound', message: 'ничего не найдено ни в одном источнике' };
  const good = ranked.filter((r) => r.s >= 25).slice(0, 3);
  if (!good.length) { const b = ranked[0]; return { status: 'notfound', message: `нет надёжного совпадения (лучшее: ${b.c.title} · ${b.src.label}, score ${b.s.toFixed(0)})` }; }
  const album = albumRaw ?? (t.album?.id ? await rawAlbum(db, t.album.id).catch(() => t.album) : null);
  const meta = { title, artist: artistName, album: album?.title, track: t.track_position ?? undefined, year: album?.release_date ? Number(String(album.release_date).slice(0, 4)) : undefined };
  let lastError = '';
  for (const { c, s: score, src } of good) {
    const dir = path.join(config.tmpDir, `acq-${newId()}`);
    api.log(`   → ${src.label}: ${c.title} [${c.channel ?? c.artist ?? '?'}] ${c.duration ?? '?'}s${c.quality?.lossless ? ' · lossless' : c.quality?.bitrate ? ` · ${c.quality.bitrate}k` : ''} (score ${score.toFixed(0)})`);
    try {
      const file = await src.download(c, dir, api.log, cancelRef, meta);
      const trackId = await importAcquired(db, file, t, album, c);
      fs.rmSync(dir, { recursive: true, force: true });
      try { if (await fetchLyricsForTrack(db, trackId)) api.log('   ♪ текст найден (LRCLIB)'); } catch { /* optional */ }
      return { status: 'imported', trackId };
    } catch (e: any) {
      fs.rmSync(dir, { recursive: true, force: true });
      lastError = e?.message ?? String(e);
      api.log(`   ✗ ${src.label}: ${lastError}`);
      if (/Отменено|abort/i.test(lastError)) break;
    }
  }
  return { status: 'error', message: lastError || 'не удалось скачать' };
}

async function importAcquired(db: DB, file: string, t: any, album: any, cand: SourceCandidate): Promise<string> {
  const { title, featuring: featNames } = parseFeaturing(t.title ?? '', t.title_short);
  const ext = path.extname(file).toLowerCase() || '.m4a';
  const id = newId();
  const dest = path.join(config.tracksDir, `${id}${ext}`);
  fs.mkdirSync(config.tracksDir, { recursive: true });
  try { fs.renameSync(file, dest); } catch { fs.copyFileSync(file, dest); fs.unlinkSync(file); }
  const hash = await hashFile(dest);
  const stat = fs.statSync(dest);
  let fmt: any = null;
  try { fmt = (await parseFile(dest, { duration: true })).format; } catch { /* keep catalogue duration */ }
  const { audioMime } = await import('./importer.js');

  const artistId = await ensureCatalogArtist(db, t.artist);
  const albumArtistRaw = album?.artist ?? t.artist;
  const albumArtistId = albumArtistRaw && albumArtistRaw.id !== t.artist.id && !/various/i.test(albumArtistRaw.name ?? '') ? await ensureCatalogArtist(db, albumArtistRaw) : artistId;
  const albumId = album ? await ensureCatalogAlbum(db, { ...album, id: album.id ?? t.album?.id }, albumArtistId) : null;
  const genre = album?.genres?.data?.[0]?.name ?? null;
  const contributors: any[] = Array.isArray(t.contributors) ? t.contributors.filter((c: any) => c.id !== t.artist.id) : [];

  db.prepare(`INSERT INTO tracks(id, album_id, artist_id, title, track_no, disc_no, duration_ms, file_path, file_size, file_hash, mime_type, bitrate, sample_rate, codec, explicit, genre, deezer_id, isrc, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, albumId, artistId, title, t.track_position ?? null, t.disk_number ?? null,
    Math.round((fmt?.duration ?? t.duration ?? 0) * 1000), dest, stat.size, hash, audioMime(dest),
    fmt?.bitrate ? Math.round(fmt.bitrate) : null, fmt?.sampleRate ?? null, fmt?.codec ?? fmt?.container ?? null,
    t.explicit_lyrics ? 1 : 0, genre, t.id, t.isrc ?? null, `${cand.source}:${cand.id}`,
  );
  const feats = contributors.length ? contributors : featNames.map((n) => ({ id: null, name: n }));
  let pos = 0;
  for (const f of feats) {
    const fid = f.id ? await ensureCatalogArtist(db, f) : (await import('./importer.js')).ensureArtist(db, f.name);
    if (fid !== artistId) db.prepare('INSERT OR IGNORE INTO track_artists(track_id, artist_id, position) VALUES (?,?,?)').run(id, fid, pos++);
  }
  indexTrack(db, id);
  if (albumId) indexAlbum(db, albumId);
  return id;
}

/* ---------- job runners ---------- */

function summarize(job: Job, stats: Record<string, number>) {
  job.stats = stats;
}

export async function runAcquireTrack(db: DB, job: Job, deezerTrackId: number, api: JobApi) {
  const cancelRef: { cancel?: () => void } = {};
  api.onCancel(() => cancelRef.cancel?.());
  const r = await acquireTrack(db, deezerTrackId, api, cancelRef);
  if (r.status === 'imported' || r.status === 'exists') job.imported.push(...getTracksByIds(db, [r.trackId!]));
  summarize(job, { total: 1, imported: r.status === 'imported' ? 1 : 0, exists: r.status === 'exists' ? 1 : 0, failed: r.status === 'notfound' || r.status === 'error' ? 1 : 0 });
  if (r.status === 'notfound' || r.status === 'error') throw new Error(r.message ?? r.status);
  if (r.status === 'imported') queueCanvasesForImported(db, job);
}

export async function runAcquireAlbum(db: DB, job: Job, deezerAlbumId: number, api: JobApi) {
  const album = await rawAlbum(db, deezerAlbumId);
  const ids: number[] = (album.tracks?.data ?? []).map((t: any) => Number(t.id));
  await acquireMany(db, job, ids, api, album);
}

/**
 * "Download discography" = everything by the artist: albums, EPs, singles, compilations (only the
 * artist's own tracks from those) and tracks by other artists that feature them. Album versions are
 * fetched first, so a single that is the same recording as an album track is skipped as a duplicate.
 */
export async function runAcquireArtist(db: DB, job: Job, deezerArtistId: number, api: JobApi) {
  const artist = await rawArtist(db, deezerArtistId);
  const artistKey = nameKey(artist.name ?? '');
  const releases = await rawArtistAllAlbums(db, deezerArtistId);
  const order: Record<string, number> = { album: 0, ep: 1, single: 2, compile: 3 };
  releases.sort((a: any, b: any) => (order[a.record_type] ?? 4) - (order[b.record_type] ?? 4) || String(a.release_date ?? '').localeCompare(String(b.release_date ?? '')));
  const kinds = releases.reduce((m: Record<string, number>, a: any) => { m[a.record_type ?? 'album'] = (m[a.record_type ?? 'album'] ?? 0) + 1; return m; }, {});
  api.log(`Релизов: ${releases.length} (альбомы ${kinds.album ?? 0}, EP ${kinds.ep ?? 0}, синглы ${kinds.single ?? 0}, сборники ${kinds.compile ?? 0})`);

  const seen = new Set<number>();
  const ids: number[] = [];
  const albumOf = new Map<number, any>();
  const isOwn = (t: any) => Number(t.artist?.id) === Number(deezerArtistId) || parseFeaturing(t.title ?? '', t.title_short).featuring.some((n) => nameKey(n) === artistKey);
  for (const a of releases) {
    try {
      const full = await rawAlbum(db, Number(a.id));
      for (const t of full.tracks?.data ?? []) {
        const tid = Number(t.id);
        if (seen.has(tid)) continue;
        // compilations mix artists: keep only this artist's tracks
        if (a.record_type === 'compile' && t.artist?.id && !isOwn(t)) continue;
        seen.add(tid); ids.push(tid); albumOf.set(tid, full);
      }
    } catch (e: any) { api.log(`! ${a.title}: ${e?.message ?? e}`); }
    await new Promise((r) => setTimeout(r, 60)); // stay well under the catalogue rate limit
  }
  const own = ids.length;

  const feats = await rawArtistFeatures(db, artist).catch((e: any) => { api.log(`! фиты: ${e?.message ?? e}`); return []; });
  for (const t of feats) {
    const tid = Number(t.id);
    if (seen.has(tid)) continue;
    let alb: any = null;
    if (t.album?.id) { try { alb = await rawAlbum(db, Number(t.album.id)); } catch { /* acquireTrack falls back */ } }
    seen.add(tid); ids.push(tid); if (alb) albumOf.set(tid, alb);
  }
  api.log(`Треков: ${ids.length} (свои релизы ${own}, фиты у других ${ids.length - own})`);
  await acquireMany(db, job, ids, api, null, albumOf);
}

async function acquireMany(db: DB, job: Job, ids: number[], api: JobApi, album: any, albumsByTrack?: Map<number, any>) {
  const cancelRef: { cancel?: () => void } = {};
  let cancelled = false;
  api.onCancel(() => { cancelled = true; cancelRef.cancel?.(); });
  const stats = { total: ids.length, imported: 0, exists: 0, failed: 0 };
  summarize(job, stats);
  for (let i = 0; i < ids.length; i++) {
    if (cancelled) throw new Error('Отменено');
    try {
      const r = await acquireTrack(db, ids[i], api, cancelRef, albumsByTrack?.get(ids[i]) ?? album);
      if (r.status === 'imported') { stats.imported++; job.imported.push(...getTracksByIds(db, [r.trackId!])); }
      else if (r.status === 'exists') stats.exists++;
      else { stats.failed++; api.log(`   ✗ ${r.message ?? r.status}`); }
    } catch (e: any) { stats.failed++; api.log(`   ✗ ${e?.message ?? e}`); }
    summarize(job, { ...stats });
    api.progress(((i + 1) / ids.length) * 100);
  }
  if (!stats.imported && !stats.exists && ids.length) throw new Error('Ни один трек не удалось получить');
  if (stats.imported) queueCanvasesForImported(db, job);
}

export function tracksOf(db: DB, ids: string[]): Track[] { return getTracksByIds(db, ids); }
