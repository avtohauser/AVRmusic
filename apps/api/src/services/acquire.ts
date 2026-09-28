// Acquisition pipeline: catalogue track → best matching audio on YouTube/SoundCloud via yt-dlp → tagged library track.
// (The same approach spotDL / ytmdl use: metadata from a catalogue, audio from a public video platform.)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import type { DB } from '../lib/db.js';
import type { Track } from '@avrmusic/shared';
import { config } from '../config.js';
import { hashFile, nameKey, newId } from '../lib/util.js';
import { capabilities } from './ytdlp.js';
import { rawAlbum, rawArtistAlbums, rawTrack, parseFeaturing } from './catalog.js';
import { saveCover } from './importer.js';
import { indexAlbum, indexArtist, indexTrack } from './search.js';
import { getTracksByIds } from './library.js';
import { fetchLyricsForTrack } from './lrclib.js';
import type { Job } from './jobs.js';

type JobApi = { log: (s: string) => void; progress: (p: number) => void; onCancel: (fn: () => void) => void };

export interface Candidate { id: string; title: string; duration?: number | null; channel?: string | null; uploader?: string | null; url?: string }
export interface Want { title: string; artist: string; durationSec: number; featuring?: string[] }

const BAD = /\b(live|cover|karaoke|instrumental|remix|reaction|slowed|sped ?up|nightcore|8d|tutorial|lesson|lyrics? video|dance video|choreo|parody|mashup|edit|extended|acoustic|версия|кавер|минус|караоке|ремикс)\b/i;
const norm = (s: string) => nameKey(s).replace(/\s+/g, ' ');

/** Higher is better. Exposed for tests. */
export function scoreCandidate(c: Candidate, w: Want): number {
  let s = 0;
  const t = norm(c.title);
  const title = norm(w.title);
  const artist = norm(w.artist);
  if (t.includes(title)) s += 30; else { const words = title.split(' ').filter(Boolean); const hit = words.filter((x) => t.includes(x)).length; s += (hit / Math.max(1, words.length)) * 20; }
  const ch = norm(`${c.channel ?? ''} ${c.uploader ?? ''}`);
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
  return s;
}

function run(bin: string, args: string[], onLine?: (l: string) => void, cancelRef?: { cancel?: () => void }): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { const s = d.toString(); out += s; if (onLine) s.split(/\r?\n|\r/).forEach((l: string) => l.trim() && onLine(l.trim())); });
    child.stderr.on('data', (d) => { const s = d.toString(); err += s; if (onLine) s.split(/\r?\n/).forEach((l: string) => l.trim() && onLine(l.trim())); });
    child.on('error', (e) => reject(new Error(`Не удалось запустить ${bin}: ${e.message}`)));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout: out, stderr: err }));
    if (cancelRef) cancelRef.cancel = () => child.kill('SIGTERM');
  });
}

export async function searchCandidates(w: Want, n = 8): Promise<Candidate[]> {
  const prefix = config.acquireSource === 'soundcloud' ? 'scsearch' : 'ytsearch';
  const q = `${w.artist} - ${w.title}${w.featuring?.length ? ` feat. ${w.featuring.join(', ')}` : ''}`;
  const r = await run(config.ytdlpPath, [`${prefix}${n}:${q}`, '--flat-playlist', '--dump-single-json', '--no-warnings', '--ignore-errors']);
  const jsonStart = r.stdout.indexOf('{');
  if (jsonStart < 0) return [];
  let parsed: any;
  try { parsed = JSON.parse(r.stdout.slice(jsonStart)); } catch { return []; }
  return ((parsed.entries ?? []) as any[]).filter(Boolean).map((e) => ({ id: e.id, title: e.title ?? '', duration: e.duration ?? null, channel: e.channel ?? e.uploader ?? null, uploader: e.uploader ?? null, url: e.url ?? e.webpage_url }));
}

async function downloadCandidate(c: Candidate, dir: string, log: (s: string) => void, cancelRef: { cancel?: () => void }, meta: { title: string; artist: string; album?: string; track?: number; year?: number }): Promise<string> {
  const caps = await capabilities();
  fs.mkdirSync(dir, { recursive: true });
  const url = config.acquireSource === 'soundcloud' ? (c.url ?? c.id) : `https://www.youtube.com/watch?v=${c.id}`;
  const args = ['-f', 'bestaudio/best', '--no-playlist', '--no-warnings', '--newline', '-o', path.join(dir, '%(id)s.%(ext)s')];
  if (caps.ffmpeg) {
    args.push('-x', '--audio-format', 'best', '--audio-quality', '0', '--embed-metadata');
    const lit = (s: string) => s.replace(/%/g, '%%').replace(/:/g, ' ');
    args.push('--parse-metadata', `${lit(meta.title)}:(?P<meta_title>.+)`, '--parse-metadata', `${lit(meta.artist)}:(?P<meta_artist>.+)`);
    if (meta.album) args.push('--parse-metadata', `${lit(meta.album)}:(?P<meta_album>.+)`);
    if (meta.track) args.push('--parse-metadata', `${meta.track}:(?P<meta_track>.+)`);
    if (meta.year) args.push('--parse-metadata', `${meta.year}:(?P<meta_date>.+)`);
  }
  args.push(url);
  const r = await run(config.ytdlpPath, args, (l) => { if (!/\[download\]\s+\d/.test(l)) log(l); }, cancelRef);
  if (r.code !== 0) throw new Error(`yt-dlp завершился с кодом ${r.code}`);
  const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.part') && !f.endsWith('.json'));
  if (!files.length) throw new Error('файл не скачан');
  return path.join(dir, files[0]);
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
  const byName = db.prepare('SELECT t.id FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE a.name_key = ? AND lower(t.title) = lower(?)').get(nameKey(artistName), title) as any;
  if (byName) { db.prepare('UPDATE tracks SET deezer_id = COALESCE(deezer_id, ?) WHERE id = ?').run(deezerTrackId, byName.id); return { status: 'exists', trackId: byName.id }; }

  const caps = await capabilities();
  if (!caps.ytdlp) throw new Error('yt-dlp не установлен на сервере');
  const want: Want = { title, artist: artistName, durationSec: Number(t.duration ?? 0), featuring: featNames };
  api.log(`🔎 ${artistName} — ${title}`);
  const cands = await searchCandidates(want);
  if (!cands.length) return { status: 'notfound', message: 'ничего не найдено' };
  const ranked = cands.map((c) => ({ c, s: scoreCandidate(c, want) })).sort((a, b) => b.s - a.s);
  const best = ranked[0];
  api.log(`   → ${best.c.title} [${best.c.channel ?? '?'}] ${best.c.duration ?? '?'}s (score ${best.s.toFixed(0)})`);
  if (best.s < 25) return { status: 'notfound', message: `нет надёжного совпадения (лучшее: ${best.c.title})` };

  const dir = path.join(config.tmpDir, `acq-${newId()}`);
  let file: string;
  try {
    const album = albumRaw ?? (t.album?.id ? await rawAlbum(db, t.album.id).catch(() => t.album) : null);
    file = await downloadCandidate(best.c, dir, api.log, cancelRef, { title, artist: artistName, album: album?.title, track: t.track_position ?? undefined, year: album?.release_date ? Number(String(album.release_date).slice(0, 4)) : undefined });
    const trackId = await importAcquired(db, file, t, album, best.c);
    fs.rmSync(dir, { recursive: true, force: true });
    try { if (await fetchLyricsForTrack(db, trackId)) api.log('   ♪ текст найден (LRCLIB)'); } catch { /* optional */ }
    return { status: 'imported', trackId };
  } catch (e: any) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { status: 'error', message: e?.message ?? String(e) };
  }
}

async function importAcquired(db: DB, file: string, t: any, album: any, cand: Candidate): Promise<string> {
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
    t.explicit_lyrics ? 1 : 0, genre, t.id, t.isrc ?? null, `${config.acquireSource}:${cand.id}`,
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
}

export async function runAcquireAlbum(db: DB, job: Job, deezerAlbumId: number, api: JobApi) {
  const album = await rawAlbum(db, deezerAlbumId);
  const ids: number[] = (album.tracks?.data ?? []).map((t: any) => Number(t.id));
  await acquireMany(db, job, ids, api, album);
}

export async function runAcquireArtist(db: DB, job: Job, deezerArtistId: number, api: JobApi) {
  const albums = ((await rawArtistAlbums(db, deezerArtistId)).data ?? []) as any[];
  const wanted = albums.filter((a) => ['album', 'ep', 'single'].includes(a.record_type));
  api.log(`Релизов: ${wanted.length}`);
  const ids: Array<{ id: number; album: any }> = [];
  for (const a of wanted) {
    try {
      const full = await rawAlbum(db, Number(a.id));
      for (const t of full.tracks?.data ?? []) ids.push({ id: Number(t.id), album: full });
    } catch (e: any) { api.log(`! ${a.title}: ${e?.message ?? e}`); }
  }
  await acquireMany(db, job, ids.map((x) => x.id), api, null, new Map(ids.map((x) => [x.id, x.album])));
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
}

export function tracksOf(db: DB, ids: string[]): Track[] { return getTracksByIds(db, ids); }
