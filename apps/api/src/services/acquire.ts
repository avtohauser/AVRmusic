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
import { judgeUpload, norm, titleCredits, titleMatch, uploadCredits, wantedGuests, type Verdict } from './matching.js';
import { previewMismatch } from './fingerprint.js';
import { downloadSlots } from './youtubeAccounts.js';

type JobApi = { log: (s: string) => void; progress: (p: number) => void; onCancel: (fn: () => void) => void };
export type Candidate = SourceCandidate;
export type { Want };

const BAD = /\b(live|cover|karaoke|instrumental|remix|reaction|slowed|sped ?up|nightcore|8d|tutorial|lesson|lyrics? video|dance video|choreo|parody|mashup|edit|extended|acoustic|версия|кавер|минус|караоке|ремикс)\b/i;

/** Where a library file came from (`youtube:<id>`, `audius:<id>` …): one source per track. */
export const sourceKey = (c: Pick<SourceCandidate, 'source' | 'id'>) => `${c.source}:${c.id}`;
export function sourceUsedBy(db: DB, key: string, exceptTrackId = ''): string | null {
  return (db.prepare('SELECT id FROM tracks WHERE source = ? AND id <> ? LIMIT 1').get(key, exceptTrackId) as any)?.id ?? null;
}

/**
 * Is this upload the recording the track wants? (Same song, and exactly the same credited artists:
 * "Song" and "Song (feat. X)" are different recordings — see services/matching.ts.)
 */
export function sourceFits(c: Pick<SourceCandidate, 'title' | 'channel' | 'uploader' | 'artist' | 'description' | 'credits'>, w: Want): boolean {
  return judgeUpload(c, w).ok;
}

type Scorable = Pick<SourceCandidate, 'title' | 'duration' | 'channel' | 'uploader' | 'artist' | 'quality' | 'source' | 'description' | 'credits'>;

/** Score (higher is better; below 0 = never take it) and the verdict behind it. */
export function assessCandidate(c: Scorable, w: Want): { score: number; verdict: Verdict } {
  const verdict = judgeUpload(c, w);
  if (!verdict.ok) return { score: -500, verdict };
  let s = 0;
  const t = norm(c.title);
  const artist = norm(w.artist);
  s += titleMatch(uploadCredits(c).title, w.title) === 'exact' ? 30 : 20;
  const ch = norm(`${c.channel ?? ''} ${c.uploader ?? ''} ${c.artist ?? ''}`);
  if (` ${t} `.includes(` ${artist} `) || ` ${ch} `.includes(` ${artist} `) || c.credits?.structured) s += 20;
  if (/ - topic$/i.test(c.channel ?? '') || c.credits?.structured) s += 15; // official audio
  if (verdict.exact) s += 60; // YouTube Music's own credits name exactly these artists
  if (c.credits?.album && w.album && norm(c.credits.album) === norm(w.album)) s += 15; // same release
  if (/official audio|official|официаль/i.test(c.title)) s += 6;
  if (c.duration && w.durationSec) {
    const d = Math.abs(c.duration - w.durationSec);
    s += d <= 3 ? 25 : d <= 8 ? 18 : d <= 15 ? 8 : d <= 30 ? -5 : -40;
  } else s -= 5;
  if (!BAD.test(w.title) && BAD.test(c.title)) s -= 35;
  if (/\bvideo\b|клип/i.test(c.title) && !/audio/i.test(c.title)) s -= 4;
  if (c.quality?.lossless) s += 12;
  else if ((c.quality?.bitrate ?? 0) >= 256) s += 4;
  const order = config.acquireSources.indexOf(c.source as any);
  if (order >= 0) s += Math.max(0, 6 - order * 2); // configured preference
  return { score: s, verdict };
}

/** Higher is better; below 0 means the upload is not the wanted recording. Exposed for tests. */
export function scoreCandidate(c: Scorable, w: Want): number { return assessCandidate(c, w).score; }

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

type Ranked = { c: SourceCandidate; s: number; src: Source; why?: string };

const DETAIL_LOOKUPS = 8;
/** Uploads being downloaded right now (several tracks run at once): never taken twice. */
const inFlight = new Set<string>();

/**
 * Ranked candidates a track may take. The most promising uploads are looked up in full (YouTube Music
 * credits, album, exact length) before anything is chosen, a few at a time, until one of them is
 * confirmed by YouTube Music's own credits. Only uploads that are the wanted recording count, and a
 * source already used by another track is never reused.
 */
export async function pickSources(db: DB, w: Want, log: (s: string) => void, except: { trackId?: string; source?: string } = {}): Promise<{ ranked: Ranked[]; reliable: Ranked[]; usable: Ranked[] }> {
  const ranked: Ranked[] = await findCandidates(w, log);
  // look closer at uploads of the same song (not other songs), most promising first: official audio
  // channels and uploads of the right length
  const promise = (c: SourceCandidate) => (c.extra?.ytmSong ? 4 : 0) + (/ - topic$/i.test(c.channel ?? '') ? 3 : 0)
    + (c.duration && w.durationSec ? (Math.abs(c.duration - w.durationSec) <= 3 ? 2 : Math.abs(c.duration - w.durationSec) <= 8 ? 1 : -1) : 0)
    + (titleMatch(titleCredits(c.title).title, w.title) === 'exact' || titleMatch(c.title, w.title) === 'exact' ? 1 : 0);
  const toCheck = ranked
    .filter((r) => r.src.details && (titleMatch(titleCredits(r.c.title).title, w.title) !== 'no' || titleMatch(r.c.title, w.title) !== 'no'))
    .sort((a, b) => promise(b.c) - promise(a.c))
    .slice(0, DETAIL_LOOKUPS);
  // four at a time, in one yt-dlp run per batch; stop once YouTube Music's own credits confirm one
  for (let i = 0; i < toCheck.length; i += 4) {
    const batch = toCheck.slice(i, i + 4);
    const bySource = new Map<Source, Ranked[]>();
    batch.forEach((r) => bySource.set(r.src, [...(bySource.get(r.src) ?? []), r]));
    await Promise.all([...bySource].map(async ([src, rs]) => {
      const found = src.detailsMany ? await src.detailsMany(rs.map((r) => r.c)).catch(() => new Map()) : new Map(await Promise.all(rs.map(async (r) => [r.c.id, await src.details!(r.c).catch(() => null)] as const)));
      for (const r of rs) {
        const d = found.get(r.c.id);
        if (!d) continue;
        r.c.description = d.description ?? r.c.description ?? null;
        if (d.artist) r.c.artist = d.artist;
        if (d.credits) r.c.credits = d.credits;
        if (d.duration && !r.c.duration) r.c.duration = d.duration;
      }
    }));
    if (toCheck.slice(0, i + 4).some((r) => assessCandidate(r.c, w).verdict.exact)) break; // confirmed: no need to look further
  }
  for (const r of ranked) { const a = assessCandidate(r.c, w); r.s = a.score; r.why = a.verdict.why; }
  ranked.sort((a, b) => b.s - a.s);
  const reliable = ranked.filter((r) => r.s >= 25);
  // a source already used by another track would give this one the other track's audio
  const usable = reliable.filter((r) => sourceKey(r.c) !== except.source && !inFlight.has(sourceKey(r.c)) && !sourceUsedBy(db, sourceKey(r.c), except.trackId ?? '')).slice(0, 3);
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
/** Catalogue tracks being fetched right now (the same song can be asked for alone and with its album). */
const tracksInFlight = new Map<number, Promise<AcquireOutcome>>();

export async function acquireTrack(db: DB, deezerTrackId: number, api: JobApi, cancelRef: { cancel?: () => void }, albumRaw?: any, addedBy: string | null = null): Promise<AcquireOutcome> {
  const other = tracksInFlight.get(deezerTrackId);
  if (other) {
    api.log('   ⏳ этот трек уже качается в другой задаче — жду её');
    const r = await other.catch(() => null);
    const have = db.prepare('SELECT id FROM tracks WHERE deezer_id = ?').get(deezerTrackId) as any;
    if (have) return { status: 'exists', trackId: have.id };
    if (r) return r;
  }
  const p = acquireTrackNow(db, deezerTrackId, api, cancelRef, albumRaw, addedBy);
  tracksInFlight.set(deezerTrackId, p);
  try { return await p; } finally { if (tracksInFlight.get(deezerTrackId) === p) tracksInFlight.delete(deezerTrackId); }
}

async function acquireTrackNow(db: DB, deezerTrackId: number, api: JobApi, cancelRef: { cancel?: () => void }, albumRaw: any, addedBy: string | null): Promise<AcquireOutcome> {
  const exists = db.prepare('SELECT id FROM tracks WHERE deezer_id = ?').get(deezerTrackId) as any;
  if (exists) return { status: 'exists', trackId: exists.id };
  const t = await rawTrack(db, deezerTrackId);
  const { title, featuring: featNames } = parseFeaturing(t.title ?? '', t.title_short);
  const artistName = t.artist?.name ?? 'Unknown';
  // Same recording already in the library (same ISRC, or same artist + title + featured artists + length)?
  // A solo version and a "feat." version of a song are different tracks and are both imported.
  const same = findLibraryTrack(db, { isrc: t.isrc ?? null, artist: artistName, title, featuring: rawFeaturing(t), durationSec: Number(t.duration ?? 0) || null });
  if (same) { db.prepare('UPDATE tracks SET deezer_id = COALESCE(deezer_id, ?), isrc = COALESCE(isrc, ?) WHERE id = ?').run(deezerTrackId, t.isrc ?? null, same); applyPendingLikes(db, deezerTrackId, same); return { status: 'exists', trackId: same }; }

  const want = wantOf(t);
  const guests = wantedGuests(want);
  api.log(`🔎 ${artistName} — ${title}${guests.length ? ` (с ${guests.join(', ')})` : ' (без гостей)'}`);
  const { ranked, reliable, usable: good } = await pickSources(db, want, api.log);
  logDecision(ranked, api.log);
  if (!ranked.length) return { status: 'notfound', message: 'ничего не найдено ни в одном источнике' };
  if (!good.length) {
    const b = reliable[0] ?? ranked[0];
    const why = reliable.length ? 'подходящие источники уже заняты другими треками' : guests.length ? `нет загрузки именно с ${guests.join(', ')}` : 'нет загрузки именно этой версии';
    return { status: 'notfound', message: `${why} (ближе всего: ${b.c.title} — ${b.why ?? `score ${b.s.toFixed(0)}`})` };
  }
  const album = albumRaw ?? (t.album?.id ? await rawAlbum(db, t.album.id).catch(() => t.album) : null);
  const meta = { title, artist: artistName, album: album?.title, track: t.track_position ?? undefined, year: album?.release_date ? Number(String(album.release_date).slice(0, 4)) : undefined };
  let lastError = '';
  for (const { c, s: score, src } of good) {
    if (inFlight.has(sourceKey(c))) continue;
    inFlight.add(sourceKey(c));
    try {
    const dir = path.join(config.tmpDir, `acq-${newId()}`);
    api.log(`   → ${src.label}: ${c.title} [${c.channel ?? c.artist ?? '?'}] ${c.duration ?? '?'}s${c.quality?.lossless ? ' · lossless' : c.quality?.bitrate ? ` · ${c.quality.bitrate}k` : ''} (score ${score.toFixed(0)})`);
    try {
      const file = await src.download(c, dir, api.log, cancelRef, meta);
      if (await fileTakenBy(db, file)) { fs.rmSync(dir, { recursive: true, force: true }); api.log('   ✗ этот же файл уже у другого трека — ищу дальше'); continue; }
      const match = await checkAudio(t.preview, file, api.log, judgeUpload(c, want).exact);
      if (match === false) { fs.rmSync(dir, { recursive: true, force: true }); continue; }
      const trackId = await importAcquired(db, file, t, album, c, typeof match === 'number' ? match : null, addedBy);
      fs.rmSync(dir, { recursive: true, force: true });
      applyPendingLikes(db, deezerTrackId, trackId);
      // lyrics arrive in the background: the next track doesn't wait for them
      fetchLyricsForTrack(db, trackId).then((ok) => { if (ok) api.log(`   ♪ текст найден: ${title}`); }).catch(() => { /* optional */ });
      return { status: 'imported', trackId };
    } catch (e: any) {
      fs.rmSync(dir, { recursive: true, force: true });
      lastError = e?.message ?? String(e);
      api.log(`   ✗ ${src.label}: ${lastError}`);
      if (/Отменено|abort/i.test(lastError)) break;
    }
    } finally { inFlight.delete(sourceKey(c)); }
  }
  return { status: 'error', message: lastError || 'не удалось скачать' };
}

/** Likes left on a song while it was playing straight from the catalogue land on the library's track. */
export function applyPendingLikes(db: DB, deezerId: number, trackId: string) {
  const rows = db.prepare('SELECT user_id FROM pending_likes WHERE deezer_id = ?').all(deezerId) as any[];
  for (const r of rows) db.prepare("INSERT OR IGNORE INTO likes(user_id, entity_type, entity_id) VALUES (?, 'track', ?)").run(r.user_id, trackId);
  if (rows.length) db.prepare('DELETE FROM pending_likes WHERE deezer_id = ?').run(deezerId);
}

/** What a catalogue track wants from a source: title, main artist, every other credited artist, album, length. */
export function wantOf(t: any): Want {
  const { title, featuring } = parseFeaturing(t.title ?? '', t.title_short);
  return { title, artist: t.artist?.name ?? 'Unknown', durationSec: Number(t.duration ?? 0), featuring, credits: rawFeaturing(t), album: t.album?.title ?? null };
}

/** Log which uploads were considered and why they were taken or refused. */
function logDecision(ranked: Ranked[], log: (s: string) => void) {
  for (const r of ranked.filter((x) => x.c.credits || x.s >= 25).slice(0, 5)) {
    log(`   ${r.s >= 25 ? '✓' : '✗'} ${r.c.title}${r.c.credits?.structured ? ` [YT Music: ${r.c.credits.artists.join(', ')}${r.c.credits.album ? ` · ${r.c.credits.album}` : ''}]` : ''} — ${r.why ?? ''}`);
  }
}

/**
 * Compare the downloaded audio with the catalogue's preview of this recording. Returns the match
 * (0…1), null when it can't be checked, or false when it is clearly another recording.
 */
async function checkAudio(previewUrl: string | null | undefined, file: string, log: (s: string) => void, verified = false): Promise<number | null | false> {
  const mismatch = await previewMismatch(previewUrl, file);
  if (mismatch == null) return null;
  const match = 1 - mismatch;
  // an upload whose YouTube Music credits name exactly these artists may be another master of it;
  // anything else has to contain the very audio of the catalogue's preview
  const limit = verified ? config.previewMaxMismatchVerified : config.previewMaxMismatch;
  if (mismatch > limit) { log(`   ✗ звук не совпадает с превью этой записи в каталоге (${Math.round(match * 100)}%) — ищу дальше`); return false; }
  log(`   ♫ звук совпадает с превью каталога (${Math.round(match * 100)}%)`);
  return match;
}

async function importAcquired(db: DB, file: string, t: any, album: any, cand: SourceCandidate, audioMatch: number | null = null, addedBy: string | null = null): Promise<string> {
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

  db.prepare(`INSERT INTO tracks(id, album_id, artist_id, title, track_no, disc_no, duration_ms, file_path, file_size, file_hash, mime_type, bitrate, sample_rate, codec, explicit, genre, deezer_id, isrc, source, source_title, source_ok, audio_match, added_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).run(
    id, albumId, artistId, title, t.track_position ?? null, t.disk_number ?? null,
    Math.round((fmt?.duration ?? t.duration ?? 0) * 1000), dest, stat.size, hash, audioMime(dest),
    fmt?.bitrate ? Math.round(fmt.bitrate) : null, fmt?.sampleRate ?? null, fmt?.codec ?? fmt?.container ?? null,
    t.explicit_lyrics ? 1 : 0, genre, t.id, t.isrc ?? null, sourceKey(cand), describeSource(cand), audioMatch, addedBy,
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
  const r = await acquireTrack(db, deezerTrackId, api, cancelRef, undefined, job.requestedBy ?? null);
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

/** Tracks of one album / discography fetched at the same time: one per YouTube account, plus one searching ahead. */
const parallelTracks = () => Math.min(10, Math.max(2, downloadSlots() + 1));

async function acquireMany(db: DB, job: Job, ids: number[], api: JobApi, album: any, albumsByTrack?: Map<number, any>) {
  const refs: Array<{ cancel?: () => void }> = [];
  let cancelled = false;
  api.onCancel(() => { cancelled = true; refs.forEach((r) => r.cancel?.()); });
  const stats = { total: ids.length, imported: 0, exists: 0, failed: 0 };
  summarize(job, stats);
  let next = 0, done = 0;
  const worker = async () => {
    const cancelRef: { cancel?: () => void } = {};
    refs.push(cancelRef);
    while (!cancelled && next < ids.length) {
      const id = ids[next++];
      try {
        const r = await acquireTrack(db, id, api, cancelRef, albumsByTrack?.get(id) ?? album, job.requestedBy ?? null);
        if (r.status === 'imported') { stats.imported++; job.imported.push(...getTracksByIds(db, [r.trackId!])); }
        else if (r.status === 'exists') stats.exists++;
        else { stats.failed++; api.log(`   ✗ ${r.message ?? r.status}`); }
      } catch (e: any) { stats.failed++; api.log(`   ✗ ${e?.message ?? e}`); }
      summarize(job, { ...stats });
      api.progress((++done / ids.length) * 100);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallelTracks(), ids.length) }, worker));
  if (cancelled) throw new Error('Отменено');
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
async function wantFor(db: DB, row: any): Promise<Want & { preview?: string | null }> {
  const raw = row.deezer_id ? await rawTrack(db, row.deezer_id).catch(() => null) : null;
  if (raw) return { ...wantOf(raw), durationSec: Number(raw.duration ?? 0) || Math.round((row.duration_ms ?? 0) / 1000), album: row.album_title ?? raw.album?.title ?? null, preview: raw.preview ?? null };
  const credits = (db.prepare('SELECT a.name FROM track_artists ta JOIN artists a ON a.id = ta.artist_id WHERE ta.track_id = ? ORDER BY ta.position').all(row.id) as any[]).map((r) => r.name);
  return { title: row.title, artist: row.artist_name, durationSec: Math.round((row.duration_ms ?? 0) / 1000), featuring: credits, credits, album: row.album_title ?? null };
}

/** Find the track's own recording again and swap the audio file in place (id, likes, playlists, lyrics, canvas stay). */
export async function refetchTrack(db: DB, trackId: string, api: JobApi, cancelRef: { cancel?: () => void }): Promise<AcquireOutcome> {
  const row = db.prepare(TRACK_ROW).get(trackId) as any;
  if (!row) return { status: 'error', message: 'трек не найден' };
  const want = await wantFor(db, row);
  api.log(`🔁 ${want.artist} — ${want.title}${want.featuring?.length ? ` (feat. ${want.featuring.join(', ')})` : ''}`);
  const { ranked, usable: good } = await pickSources(db, want, api.log, { trackId, source: row.source });
  logDecision(ranked, api.log);
  if (!good.length) return { status: 'notfound', message: 'другого надёжного источника не нашлось' };
  const meta = { title: row.title, artist: row.artist_name, album: row.album_title ?? undefined, track: row.track_no ?? undefined };
  let lastError = '';
  for (const { c, s: score, src } of good) {
    const dir = path.join(config.tmpDir, `refetch-${newId()}`);
    api.log(`   → ${src.label}: ${c.title} [${c.channel ?? c.artist ?? '?'}] ${c.duration ?? '?'}s (score ${score.toFixed(0)})`);
    try {
      const file = await src.download(c, dir, api.log, cancelRef, meta);
      if (await fileTakenBy(db, file, trackId)) { fs.rmSync(dir, { recursive: true, force: true }); api.log('   ✗ этот же файл уже у другого трека — ищу дальше'); continue; }
      const match = await checkAudio(want.preview, file, api.log, judgeUpload(c, want).exact);
      if (match === false) { fs.rmSync(dir, { recursive: true, force: true }); continue; }
      const ext = path.extname(file).toLowerCase() || '.m4a';
      const dest = path.join(config.tracksDir, `${newId()}${ext}`);
      fs.mkdirSync(config.tracksDir, { recursive: true });
      moveFile(file, dest);
      const hash = await hashFile(dest);
      let fmt: any = null;
      try { fmt = (await parseFile(dest, { duration: true })).format; } catch { /* keep the old length */ }
      const { audioMime } = await import('./importer.js');
      db.prepare(`UPDATE tracks SET file_path = ?, file_size = ?, file_hash = ?, mime_type = ?, bitrate = ?, sample_rate = ?, codec = ?, duration_ms = ?, source = ?, source_title = ?, source_ok = 1, audio_match = ? WHERE id = ?`).run(
        dest, fs.statSync(dest).size, hash, audioMime(dest), fmt?.bitrate ? Math.round(fmt.bitrate) : null, fmt?.sampleRate ?? null,
        fmt?.codec ?? fmt?.container ?? null, Math.round((fmt?.duration ?? want.durationSec) * 1000) || row.duration_ms, sourceKey(c), describeSource(c),
        typeof match === 'number' ? match : null, trackId,
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
async function youtubeInfo(id: string, deep: boolean): Promise<Pick<SourceCandidate, 'title' | 'channel' | 'artist' | 'description' | 'credits'> | null> {
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
  const setMatch = db.prepare('UPDATE tracks SET audio_match = ? WHERE id = ?');
  for (const row of rows) {
    if (cancelled) throw new Error('Отменено');
    if (yieldToUsers()) return;
    const id = String(row.source).slice('youtube:'.length);
    const want = await wantFor(db, row);
    // the upload's full credits (YouTube Music lists every artist of the recording); its title as a fallback
    const info = (await youtubeInfo(id, true)) ?? (await youtubeInfo(id, false));
    await new Promise((r) => setTimeout(r, config.healPauseMs)); // gentle on YouTube: this runs through the whole library
    stats.checked++;
    // and the audio itself against the catalogue's preview of the recording
    const mismatch = fs.existsSync(row.file_path) ? await previewMismatch(want.preview, row.file_path) : null;
    if (mismatch != null) setMatch.run(1 - mismatch, row.id);
    const verdict = info ? judgeUpload(info, want) : null;
    const soundOk = mismatch == null || mismatch <= (verdict?.exact ? config.previewMaxMismatchVerified : config.previewMaxMismatch);
    if (!info || !verdict) { mark.run('', soundOk ? null : 0, row.id); if (!soundOk) stats.wrong++; continue; } // upload gone: judge by the sound only
    const ok = verdict.ok && soundOk;
    mark.run(describeSource({ ...info, source: 'youtube', id } as SourceCandidate), ok ? 1 : 0, row.id);
    if (!ok) {
      stats.wrong++;
      api.log(`⚠ ${want.artist} — ${want.title}${wantedGuests(want).length ? ` (с ${wantedGuests(want).join(', ')})` : ''}: играл «${info.title}» — ${verdict.ok ? `звук не совпадает с превью (${Math.round((1 - (mismatch ?? 0)) * 100)}%)` : verdict.why}`);
    }
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
