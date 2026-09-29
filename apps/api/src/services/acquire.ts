// Acquisition pipeline: catalogue track → best matching audio from the configured sources
// (YouTube/SoundCloud via yt-dlp, Audius, Internet Archive, Jamendo) → tagged library track.
import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import type { DB } from '../lib/db.js';
import type { Track } from '@avrmusic/shared';
import { config } from '../config.js';
import { hashFile, moveFile, nameKey, newId } from '../lib/util.js';
import { findLibraryTrack, rawAlbum, rawArtist, rawArtistAllAlbums, rawArtistFeatures, rawFeaturing, rawTrack, parseFeaturing } from './catalog.js';
import { saveCover } from './importer.js';
import { indexAlbum, indexArtist, indexTrack } from './search.js';
import { getTracksByIds } from './library.js';
import { fetchLyricsForTrack } from './lrclib.js';
import { queueCanvasesForImported } from './canvas.js';
import { userJobWaiting, type Job } from './jobs.js';
import { allSources, enabledSources, type CancelRef, type Source, type SourceCandidate, type Want } from './sources/index.js';

type JobApi = { log: (s: string) => void; progress: (p: number) => void; onCancel: (fn: () => void) => void };
export type Candidate = SourceCandidate;
export type { Want };

const BAD = /\b(live|cover|karaoke|instrumental|remix|reaction|slowed|sped ?up|nightcore|8d|tutorial|lesson|lyrics? video|dance video|choreo|parody|mashup|edit|extended|acoustic|версия|кавер|минус|караоке|ремикс)\b/i;
const norm = (s: string) => nameKey(s).replace(/\s+/g, ' ');
const FEAT_MARK = /[\(\[]?\s*(?:feat\.?|ft\.|featuring|при уч\.?)\s/i;

/** Where a library file came from (`youtube:<id>`, `audius:<id>` …): one source per track. */
export const sourceKey = (c: Pick<SourceCandidate, 'source' | 'id'>) => `${c.source}:${c.id}`;
export function sourceUsedBy(db: DB, key: string, exceptTrackId = ''): string | null {
  return (db.prepare('SELECT id FROM tracks WHERE source = ? AND id <> ? LIMIT 1').get(key, exceptTrackId) as any)?.id ?? null;
}

/** Everything an upload says about who is on it: title, channel, artist tags and the start of its description. */
const creditText = (c: Pick<SourceCandidate, 'title' | 'channel' | 'uploader' | 'artist' | 'description'>) =>
  norm(`${c.title} ${c.channel ?? ''} ${c.uploader ?? ''} ${c.artist ?? ''} ${c.description ?? ''}`);
const guestKeys = (w: Want) => (w.featuring ?? []).map((f) => norm(f)).filter(Boolean);

/** An upload crediting a guest that the wanted recording doesn't have (the solo version must not take it). */
function creditsSomeoneElse(c: Pick<SourceCandidate, 'title'>, w: Want): boolean {
  if (!FEAT_MARK.test(c.title) || FEAT_MARK.test(w.title)) return false;
  const known = (w.credits ?? []).map((n) => norm(n)).filter(Boolean);
  const named = parseFeaturing(c.title).featuring.map((n) => norm(n)).filter(Boolean);
  return !named.some((n) => known.some((k) => n.includes(k) || k.includes(n)));
}

/**
 * Is this upload the recording the track wants? A "feat." version needs an upload that credits the
 * guest (or at least is marked as a feat. version); a solo version must not be someone's feat. version.
 */
export function sourceFits(c: Pick<SourceCandidate, 'title' | 'channel' | 'uploader' | 'artist' | 'description'>, w: Want): boolean {
  const feats = guestKeys(w);
  if (feats.length) { const hay = creditText(c); return feats.some((f) => hay.includes(f)) || FEAT_MARK.test(c.title); }
  return !creditsSomeoneElse(c, w);
}

/** Higher is better. Exposed for tests. */
export function scoreCandidate(c: Pick<SourceCandidate, 'title' | 'duration' | 'channel' | 'uploader' | 'artist' | 'quality' | 'source' | 'description'>, w: Want): number {
  let s = 0;
  const t = norm(c.title);
  const title = norm(w.title);
  const artist = norm(w.artist);
  if (t.includes(title)) s += 30; else { const words = title.split(' ').filter(Boolean); const hit = words.filter((x) => t.includes(x)).length; s += (hit / Math.max(1, words.length)) * 20; }
  const ch = norm(`${c.channel ?? ''} ${c.uploader ?? ''} ${c.artist ?? ''}`);
  if (t.includes(artist) || ch.includes(artist)) s += 20;
  if (/ - topic$/i.test(c.channel ?? '') || /provided to youtube/i.test(`${c.title} ${c.description ?? ''}`)) s += 15; // auto-generated official audio
  if (/official audio|official|официаль/i.test(c.title)) s += 6;
  if (c.duration && w.durationSec) {
    const d = Math.abs(c.duration - w.durationSec);
    s += d <= 3 ? 25 : d <= 8 ? 18 : d <= 15 ? 8 : d <= 30 ? -5 : -40;
  } else s -= 5;
  const wantBad = BAD.test(w.title);
  if (!wantBad && BAD.test(c.title)) s -= 35;
  // "Song" and "Song (feat. X)" are different recordings. A feat. version only takes an upload that
  // credits the guest — anything else is the solo recording and is ruled out; a solo version never
  // takes an upload crediting a guest it doesn't have.
  const feats = guestKeys(w);
  if (feats.length) {
    const hay = creditText(c);
    const hits = feats.filter((f) => hay.includes(f)).length;
    s += hits ? 12 + 8 * hits - 6 * (feats.length - hits) : FEAT_MARK.test(c.title) ? -12 : -80;
  } else if (creditsSomeoneElse(c, w)) s -= 80;
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

type Ranked = { c: SourceCandidate; s: number; src: Source };

/**
 * Ranked candidates a track may take: reliable matches whose source no other track uses. When a feat.
 * version's guests aren't visible in the search results, the best few uploads are looked at closer —
 * YouTube Music often credits featured artists only in the upload's description.
 */
async function pickSources(db: DB, w: Want, log: (s: string) => void, except: { trackId?: string; source?: string } = {}): Promise<{ ranked: Ranked[]; reliable: Ranked[]; usable: Ranked[] }> {
  const ranked = await findCandidates(w, log);
  const feats = guestKeys(w);
  if (feats.length && !ranked.slice(0, 5).some((r) => feats.some((f) => creditText(r.c).includes(f)))) {
    for (const r of ranked.filter((x) => x.src.details).slice(0, 3)) {
      const d = await r.src.details!(r.c).catch(() => null);
      if (!d) continue;
      r.c.description = d.description ?? null;
      if (d.artist) r.c.artist = d.artist;
      r.s = scoreCandidate(r.c, w);
    }
    ranked.sort((a, b) => b.s - a.s);
  }
  const reliable = ranked.filter((r) => r.s >= 25);
  // a source already used by another track would give this one the other track's audio
  const usable = reliable.filter((r) => sourceKey(r.c) !== except.source && !sourceUsedBy(db, sourceKey(r.c), except.trackId ?? '')).slice(0, 3);
  return { ranked, reliable, usable };
}

const describeSource = (c: SourceCandidate) => `${c.title}${c.channel ? ` — ${c.channel}` : ''}`.slice(0, 300);

/** Another track already has exactly this file (a re-upload of a video it was fetched from). */
async function fileTakenBy(db: DB, file: string, exceptTrackId = ''): Promise<string | null> {
  const hash = await hashFile(file);
  return (db.prepare('SELECT id FROM tracks WHERE file_hash = ? AND id <> ? LIMIT 1').get(hash, exceptTrackId) as any)?.id ?? null;
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

  const want: Want = { title, artist: artistName, durationSec: Number(t.duration ?? 0), featuring: featNames, credits: rawFeaturing(t), album: t.album?.title ?? null };
  api.log(`🔎 ${artistName} — ${title}${featNames.length ? ` (feat. ${featNames.join(', ')})` : ''}`);
  const { ranked, reliable, usable: good } = await pickSources(db, want, api.log);
  if (!ranked.length) return { status: 'notfound', message: 'ничего не найдено ни в одном источнике' };
  if (!good.length) {
    const b = reliable[0] ?? ranked[0];
    const why = reliable.length ? 'подходящие источники уже заняты другими треками' : featNames.length ? `нет загрузки именно с ${featNames.join(', ')}` : 'нет надёжного совпадения';
    return { status: 'notfound', message: `${why} (лучшее: ${b.c.title} · ${b.src.label}, score ${b.s.toFixed(0)})` };
  }
  const album = albumRaw ?? (t.album?.id ? await rawAlbum(db, t.album.id).catch(() => t.album) : null);
  const meta = { title, artist: artistName, album: album?.title, track: t.track_position ?? undefined, year: album?.release_date ? Number(String(album.release_date).slice(0, 4)) : undefined };
  let lastError = '';
  for (const { c, s: score, src } of good) {
    const dir = path.join(config.tmpDir, `acq-${newId()}`);
    api.log(`   → ${src.label}: ${c.title} [${c.channel ?? c.artist ?? '?'}] ${c.duration ?? '?'}s${c.quality?.lossless ? ' · lossless' : c.quality?.bitrate ? ` · ${c.quality.bitrate}k` : ''} (score ${score.toFixed(0)})`);
    try {
      const file = await src.download(c, dir, api.log, cancelRef, meta);
      if (await fileTakenBy(db, file)) { fs.rmSync(dir, { recursive: true, force: true }); api.log('   ✗ этот же файл уже у другого трека — ищу дальше'); continue; }
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
  moveFile(file, dest);
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

  db.prepare(`INSERT INTO tracks(id, album_id, artist_id, title, track_no, disc_no, duration_ms, file_path, file_size, file_hash, mime_type, bitrate, sample_rate, codec, explicit, genre, deezer_id, isrc, source, source_title, source_ok)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(
    id, albumId, artistId, title, t.track_position ?? null, t.disk_number ?? null,
    Math.round((fmt?.duration ?? t.duration ?? 0) * 1000), dest, stat.size, hash, audioMime(dest),
    fmt?.bitrate ? Math.round(fmt.bitrate) : null, fmt?.sampleRate ?? null, fmt?.codec ?? fmt?.container ?? null,
    t.explicit_lyrics ? 1 : 0, genre, t.id, t.isrc ?? null, sourceKey(cand), describeSource(cand),
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

/* ---------- self-healing: every catalogue track keeps checking that it plays its own recording ---------- */

/** Tracks whose file came from the same source (or is the same file) as an earlier track. */
export function tracksWithSharedAudio(db: DB): string[] {
  const out = new Set<string>();
  const bySource = db.prepare(`SELECT source FROM tracks WHERE source IS NOT NULL GROUP BY source HAVING COUNT(*) > 1`).all() as any[];
  for (const g of bySource) {
    const ids = (db.prepare('SELECT id FROM tracks WHERE source = ? ORDER BY created_at, rowid').all(g.source) as any[]).map((r) => r.id);
    ids.slice(1).forEach((id) => out.add(id));
  }
  const byHash = db.prepare(`SELECT file_hash FROM tracks WHERE file_hash IS NOT NULL AND deezer_id IS NOT NULL GROUP BY file_hash HAVING COUNT(*) > 1`).all() as any[];
  for (const g of byHash) {
    const ids = (db.prepare('SELECT id FROM tracks WHERE file_hash = ? AND deezer_id IS NOT NULL ORDER BY created_at, rowid').all(g.file_hash) as any[]).map((r) => r.id);
    ids.slice(1).forEach((id) => out.add(id));
  }
  return [...out];
}

const TRACK_ROW = 'SELECT t.*, a.name AS artist_name, al.title AS album_title FROM tracks t JOIN artists a ON a.id = t.artist_id LEFT JOIN albums al ON al.id = t.album_id WHERE t.id = ?';

/** What a library track wants from a source, from its catalogue entry (the library row as a fallback). */
async function wantFor(db: DB, row: any): Promise<Want> {
  const raw = row.deezer_id ? await rawTrack(db, row.deezer_id).catch(() => null) : null;
  const album = row.album_title ?? null;
  if (raw) {
    const { title, featuring } = parseFeaturing(raw.title ?? '', raw.title_short);
    return { title, artist: raw.artist?.name ?? row.artist_name, durationSec: Number(raw.duration ?? 0) || Math.round((row.duration_ms ?? 0) / 1000), featuring, credits: rawFeaturing(raw), album };
  }
  const credits = (db.prepare('SELECT a.name FROM track_artists ta JOIN artists a ON a.id = ta.artist_id WHERE ta.track_id = ? ORDER BY ta.position').all(row.id) as any[]).map((r) => r.name);
  return { title: row.title, artist: row.artist_name, durationSec: Math.round((row.duration_ms ?? 0) / 1000), featuring: credits, credits, album };
}

/** Find the track's own recording again and swap the audio file in place (id, likes, playlists, lyrics, canvas stay). */
export async function refetchTrack(db: DB, trackId: string, api: JobApi, cancelRef: { cancel?: () => void }): Promise<AcquireOutcome> {
  const row = db.prepare(TRACK_ROW).get(trackId) as any;
  if (!row) return { status: 'error', message: 'трек не найден' };
  const want = await wantFor(db, row);
  api.log(`🔁 ${want.artist} — ${want.title}${want.featuring?.length ? ` (feat. ${want.featuring.join(', ')})` : ''}`);
  const { usable: good } = await pickSources(db, want, api.log, { trackId, source: row.source });
  if (!good.length) return { status: 'notfound', message: 'другого надёжного источника не нашлось' };
  const meta = { title: row.title, artist: row.artist_name, album: row.album_title ?? undefined, track: row.track_no ?? undefined };
  let lastError = '';
  for (const { c, s: score, src } of good) {
    const dir = path.join(config.tmpDir, `refetch-${newId()}`);
    api.log(`   → ${src.label}: ${c.title} [${c.channel ?? c.artist ?? '?'}] ${c.duration ?? '?'}s (score ${score.toFixed(0)})`);
    try {
      const file = await src.download(c, dir, api.log, cancelRef, meta);
      if (await fileTakenBy(db, file, trackId)) { fs.rmSync(dir, { recursive: true, force: true }); api.log('   ✗ этот же файл уже у другого трека — ищу дальше'); continue; }
      const ext = path.extname(file).toLowerCase() || '.m4a';
      const dest = path.join(config.tracksDir, `${newId()}${ext}`);
      fs.mkdirSync(config.tracksDir, { recursive: true });
      moveFile(file, dest);
      const hash = await hashFile(dest);
      let fmt: any = null;
      try { fmt = (await parseFile(dest, { duration: true })).format; } catch { /* keep the old length */ }
      const { audioMime } = await import('./importer.js');
      db.prepare(`UPDATE tracks SET file_path = ?, file_size = ?, file_hash = ?, mime_type = ?, bitrate = ?, sample_rate = ?, codec = ?, duration_ms = ?, source = ?, source_title = ?, source_ok = 1 WHERE id = ?`).run(
        dest, fs.statSync(dest).size, hash, audioMime(dest), fmt?.bitrate ? Math.round(fmt.bitrate) : null, fmt?.sampleRate ?? null,
        fmt?.codec ?? fmt?.container ?? null, Math.round((fmt?.duration ?? want.durationSec) * 1000) || row.duration_ms, sourceKey(c), describeSource(c), trackId,
      );
      const stillUsed = db.prepare('SELECT 1 FROM tracks WHERE file_path = ?').get(row.file_path);
      if (!stillUsed && String(row.file_path).startsWith(config.tracksDir)) { try { fs.unlinkSync(row.file_path); } catch { /* already gone */ } }
      fs.rmSync(dir, { recursive: true, force: true });
      api.log('   ✓ звук заменён');
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

export async function runRefetch(db: DB, job: Job, trackIds: string[], api: JobApi) {
  const cancelRef: { cancel?: () => void } = {};
  let cancelled = false;
  api.onCancel(() => { cancelled = true; cancelRef.cancel?.(); });
  const stats = { total: trackIds.length, replaced: 0, failed: 0 };
  job.stats = { ...stats };
  for (let i = 0; i < trackIds.length; i++) {
    if (cancelled) throw new Error('Отменено');
    try {
      const r = await refetchTrack(db, trackIds[i], api, cancelRef);
      if (r.status === 'imported') { stats.replaced++; job.imported.push(...getTracksByIds(db, [trackIds[i]])); }
      else { stats.failed++; api.log(`   ✗ ${r.message ?? r.status}`); }
    } catch (e: any) { stats.failed++; api.log(`   ✗ ${e?.message ?? e}`); }
    job.stats = { ...stats };
    api.progress(((i + 1) / trackIds.length) * 100);
  }
  if (trackIds.length && !stats.replaced) throw new Error('Ни один трек не удалось перекачать');
}

const HEAL_BATCH = 80;
const HEAL_REFETCH_PER_RUN = 10;
const HEAL_RETRY_MS = 3 * 24 * 3600 * 1000;

/** Catalogue tracks fetched before sources were recorded: their source still has to be checked. */
function uncheckedSources(db: DB, limit: number): any[] {
  return db.prepare(`SELECT t.*, a.name AS artist_name, al.title AS album_title FROM tracks t JOIN artists a ON a.id = t.artist_id LEFT JOIN albums al ON al.id = t.album_id
    WHERE t.deezer_id IS NOT NULL AND t.source LIKE 'youtube:%' AND t.source_title IS NULL ORDER BY t.created_at LIMIT ?`).all(limit) as any[];
}

/** Tracks playing another track's audio or the wrong version, that weren't retried in the last days. */
function healTargets(db: DB): string[] {
  const bad = new Set([...tracksWithSharedAudio(db), ...(db.prepare('SELECT id FROM tracks WHERE source_ok = 0').all() as any[]).map((r) => r.id)]);
  const cutoff = new Date(Date.now() - HEAL_RETRY_MS).toISOString();
  const recent = db.prepare('SELECT 1 FROM tracks WHERE id = ? AND heal_at IS NOT NULL AND heal_at > ?');
  return [...bad].filter((id) => !recent.get(id, cutoff));
}

/** Whether the self-healing job has anything to do. */
export function healPending(db: DB): { unchecked: number; targets: number } {
  const unchecked = (db.prepare(`SELECT COUNT(*) AS n FROM tracks WHERE deezer_id IS NOT NULL AND source LIKE 'youtube:%' AND source_title IS NULL`).get() as any).n as number;
  return { unchecked, targets: healTargets(db).length };
}

/** Title and channel of a YouTube upload: oEmbed is instant; yt-dlp also reads the description. */
async function youtubeInfo(id: string, deep: boolean): Promise<Pick<SourceCandidate, 'title' | 'channel' | 'artist' | 'description'> | null> {
  if (!deep && config.youtubeOembed) {
    try {
      const res = await fetch(`${config.youtubeOembed}?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) { const j: any = await res.json(); return { title: j.title ?? '', channel: j.author_name ?? null }; }
    } catch { /* fall back to yt-dlp */ }
  }
  const yt = allSources().find((x) => x.name === 'youtube');
  return (await yt?.details?.({ id }).catch(() => null)) ?? null;
}

/**
 * Self-healing pass, run in the background (at start-up and every few hours):
 * 1. checks the source of tracks fetched before sources were recorded — a "feat." version whose
 *    upload doesn't credit the guest, or a solo version that got someone's feat. version, is marked;
 * 2. re-fetches marked tracks and tracks sharing audio with another track from their own recording.
 * Tracks that can't be fixed yet are retried after a few days.
 */
export async function runHeal(db: DB, job: Job, api: JobApi) {
  const cancelRef: { cancel?: () => void } = {};
  let cancelled = false;
  api.onCancel(() => { cancelled = true; cancelRef.cancel?.(); });
  const stats = { checked: 0, wrong: 0, replaced: 0, failed: 0 };
  job.stats = { ...stats };

  const rows = uncheckedSources(db, HEAL_BATCH);
  if (rows.length) api.log(`Проверка источников: ${rows.length}`);
  const mark = db.prepare('UPDATE tracks SET source_title = ?, source_ok = ? WHERE id = ?');
  const yieldToUsers = () => { if (!userJobWaiting()) return false; api.log('⏸ уступаю очередь загрузкам пользователей — продолжу позже'); return true; };
  for (const row of rows) {
    if (cancelled) throw new Error('Отменено');
    if (yieldToUsers()) return;
    const id = String(row.source).slice('youtube:'.length);
    const want = await wantFor(db, row);
    let info = await youtubeInfo(id, false);
    // the title may not credit the guest while the description does
    if (!info || !sourceFits(info, want)) info = (await youtubeInfo(id, true)) ?? info;
    stats.checked++;
    if (!info) { mark.run('', null, row.id); continue; } // upload gone: nothing to compare with, the file itself is fine
    const ok = sourceFits(info, want);
    mark.run(describeSource({ ...info, source: 'youtube', id } as SourceCandidate), ok ? 1 : 0, row.id);
    if (!ok) { stats.wrong++; api.log(`⚠ ${want.artist} — ${want.title}${want.featuring?.length ? ` (feat. ${want.featuring.join(', ')})` : ''}: играл «${info.title}»`); }
    job.stats = { ...stats };
  }

  // a few re-downloads per run: the server stays responsive, the rest follows in the next runs
  const targets = healTargets(db).slice(0, HEAL_REFETCH_PER_RUN);
  if (targets.length) api.log(`Перекачиваю треки с чужим звуком: ${targets.length}`);
  const touch = db.prepare('UPDATE tracks SET heal_at = ? WHERE id = ?');
  for (let i = 0; i < targets.length; i++) {
    if (cancelled) throw new Error('Отменено');
    if (yieldToUsers()) return;
    touch.run(new Date().toISOString(), targets[i]);
    try {
      const r = await refetchTrack(db, targets[i], api, cancelRef);
      if (r.status === 'imported') { stats.replaced++; job.imported.push(...getTracksByIds(db, [targets[i]])); }
      else { stats.failed++; api.log(`   ✗ ${r.message ?? r.status} — попробую позже`); }
    } catch (e: any) { stats.failed++; api.log(`   ✗ ${e?.message ?? e}`); }
    job.stats = { ...stats };
    api.progress(((i + 1) / targets.length) * 100);
  }
}
