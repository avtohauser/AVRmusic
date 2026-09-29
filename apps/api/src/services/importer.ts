import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { parseFile, selectCover } from 'music-metadata';
import mime from 'mime-types';
import type { DB } from '../lib/db.js';
import { AUDIO_EXT, config } from '../config.js';
import { hashFile, moveFile, nameKey, newId } from '../lib/util.js';
import { linesToLrc } from '../lib/lyrics.js';
import { indexAlbum, indexArtist, indexTrack } from './search.js';

export interface ImportOptions {
  /** Move the file into DATA_DIR/media/tracks (uploads) or reference it in place (library scan). */
  mode: 'move' | 'reference';
  /** Fallback metadata, e.g. from the upload form. */
  overrides?: { title?: string; artist?: string; album?: string; genre?: string; year?: number };
  /** Original filename (uploads are spooled under a random name); used for "Artist - Title" heuristics. */
  originalName?: string;
}

/** "01 - Artist - Title" / "Artist - Title" / "07. Title" → { artist?, title } */
export function guessFromFilename(base: string): { artist: string | null; title: string } {
  const stripped = base.replace(/^\s*\d{1,3}\s*[.\-_)]?\s+/, '').trim();
  const parts = stripped.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: null, title: stripped || base };
}

export interface ImportOutcome {
  ok: boolean;
  trackId?: string;
  reason?: string;
}

const EXT_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.opus': 'audio/ogg', '.wav': 'audio/wav', '.wma': 'audio/x-ms-wma', '.aiff': 'audio/aiff', '.aif': 'audio/aiff', '.webm': 'audio/webm',
};

export function audioMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_MIME[ext] || (mime.lookup(filePath) as string) || 'application/octet-stream';
}

export function ensureArtist(db: DB, name: string): string {
  const key = nameKey(name) || name.toLowerCase();
  const found = db.prepare('SELECT id FROM artists WHERE name_key = ?').get(key) as any;
  if (found) return found.id;
  const id = newId();
  db.prepare('INSERT INTO artists(id, name, name_key) VALUES (?,?,?)').run(id, name.trim(), key);
  indexArtist(db, id);
  return id;
}

export function ensureAlbum(db: DB, artistId: string, title: string, year: number | null, type: string | null): string {
  const key = nameKey(title) || title.toLowerCase();
  const found = db.prepare('SELECT id FROM albums WHERE artist_id = ? AND title_key = ?').get(artistId, key) as any;
  if (found) {
    if (year) db.prepare('UPDATE albums SET year = COALESCE(year, ?) WHERE id = ?').run(year, found.id);
    return found.id;
  }
  const id = newId();
  db.prepare('INSERT INTO albums(id, artist_id, title, title_key, year, type) VALUES (?,?,?,?,?,?)').run(id, artistId, title.trim(), key, year, type || 'album');
  indexAlbum(db, id);
  return id;
}

/** Persist a cover image buffer and return the stored filename. Deduplicates by content. */
export function saveCover(buf: Uint8Array, format: string): string {
  const ext = format.includes('png') ? 'png' : format.includes('webp') ? 'webp' : format.includes('gif') ? 'gif' : format.includes('svg') ? 'svg' : 'jpg';
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 24);
  const name = `${hash}.${ext}`;
  const dest = path.join(config.coversDir, name);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
  return name;
}

/** Sidecar files next to an audio file: cover.jpg / folder.png, <name>.lrc, <name>.txt, <name>.mp4 (canvas). */
function findSidecars(filePath: string) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const out: { cover?: string; lrc?: string; txt?: string; canvas?: string } = {};
  const tryFile = (p: string) => (fs.existsSync(p) ? p : undefined);
  for (const c of ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'Cover.jpg', 'album.jpg', 'front.jpg']) {
    const f = tryFile(path.join(dir, c));
    if (f) { out.cover = f; break; }
  }
  out.lrc = tryFile(path.join(dir, `${base}.lrc`));
  out.txt = tryFile(path.join(dir, `${base}.txt`));
  for (const ext of ['.mp4', '.webm', '.gif']) {
    const f = tryFile(path.join(dir, `${base}.canvas${ext}`)) ?? tryFile(path.join(dir, `${base}${ext}`));
    if (f) { out.canvas = f; break; }
  }
  return out;
}

function firstNonEmpty(...vals: Array<string | undefined | null>): string | null {
  for (const v of vals) if (v && v.trim()) return v.trim();
  return null;
}

/** Split "Artist feat. Other" / "A & B" / "A, B" into main + featured names. */
export function splitArtists(raw: string, artistsTag?: string[]): { main: string; featuring: string[] } {
  const featMatch = raw.match(/^(.*?)\s*[\(\[]?\s*(?:feat\.?|ft\.?|featuring|при уч\.?)\s+(.+?)[\)\]]?\s*$/i);
  if (featMatch) {
    return { main: featMatch[1].trim(), featuring: featMatch[2].split(/\s*[,&;]\s*|\s+and\s+|\s+и\s+/i).map((s) => s.trim()).filter(Boolean) };
  }
  if (artistsTag && artistsTag.length > 1) {
    return { main: artistsTag[0].trim(), featuring: artistsTag.slice(1).map((s) => s.trim()).filter(Boolean) };
  }
  return { main: raw.trim(), featuring: [] };
}

export async function importAudioFile(db: DB, filePath: string, opts: ImportOptions): Promise<ImportOutcome> {
  const ext = path.extname(filePath).toLowerCase();
  if (!AUDIO_EXT.has(ext)) return { ok: false, reason: 'Неподдерживаемый формат' };
  const stat = fs.statSync(filePath);
  if (!stat.size) return { ok: false, reason: 'Пустой файл' };

  const hash = await hashFile(filePath);
  const dup = db.prepare('SELECT id FROM tracks WHERE file_hash = ?').get(hash) as any;
  if (dup) return { ok: false, reason: 'Дубликат (уже в библиотеке)', trackId: dup.id };

  let meta: Awaited<ReturnType<typeof parseFile>> | null = null;
  try {
    meta = await parseFile(filePath, { duration: true, skipPostHeaders: false });
  } catch (e) {
    meta = null;
  }
  const common = meta?.common;
  const format = meta?.format;
  const fileBase = path.basename(opts.originalName ?? filePath, path.extname(opts.originalName ?? filePath));
  // "Artist - Title.mp3" heuristic when tags are missing
  const guess = guessFromFilename(fileBase);

  const rawArtist = firstNonEmpty(opts.overrides?.artist, common?.artist, common?.artists?.[0], common?.albumartist, guess.artist) ?? 'Неизвестный исполнитель';
  const title = firstNonEmpty(opts.overrides?.title, common?.title, guess.title, fileBase) ?? fileBase;
  const albumTitle = firstNonEmpty(opts.overrides?.album, common?.album);
  const albumArtistRaw = firstNonEmpty(common?.albumartist, common?.albumartists?.[0]);
  const year = opts.overrides?.year ?? common?.year ?? (common?.date ? Number.parseInt(common.date.slice(0, 4), 10) || null : null);
  const genre = firstNonEmpty(opts.overrides?.genre, common?.genre?.[0]);

  const { main: mainArtistName, featuring } = splitArtists(rawArtist, common?.artists);
  const albumArtistName = albumArtistRaw && !/various|сборник|разные/i.test(albumArtistRaw) ? splitArtists(albumArtistRaw).main : mainArtistName;

  // Storage
  let storedPath = filePath;
  if (opts.mode === 'move') {
    fs.mkdirSync(config.tracksDir, { recursive: true });
    const id = newId();
    storedPath = path.join(config.tracksDir, `${id}${ext}`);
    moveFile(filePath, storedPath);
  }

  const sidecars = findSidecars(opts.mode === 'move' ? filePath : storedPath);
  let coverName: string | null = null;
  const pic = selectCover(common?.picture);
  if (pic) coverName = saveCover(pic.data, pic.format);
  else if (sidecars.cover) coverName = saveCover(fs.readFileSync(sidecars.cover), mime.lookup(sidecars.cover) || 'image/jpeg');

  // Lyrics: embedded (synced or plain) or sidecar .lrc/.txt
  let lyricsPlain: string | null = null;
  let lyricsSynced: string | null = null;
  let lyricsSource: string | null = null;
  const lyr = common?.lyrics?.[0];
  if (lyr?.syncText?.length && lyr.syncText.some((l) => l.timestamp != null)) {
    lyricsSynced = linesToLrc(lyr.syncText.map((l) => ({ timeMs: Math.round(l.timestamp ?? 0), text: l.text })));
    lyricsPlain = lyr.syncText.map((l) => l.text).join('\n');
    lyricsSource = 'embedded';
  } else if (lyr?.text) {
    lyricsPlain = lyr.text;
    lyricsSource = 'embedded';
  }
  if (sidecars.lrc) {
    const txt = fs.readFileSync(sidecars.lrc, 'utf8');
    const { parseLrc, lrcToPlain } = await import('../lib/lyrics.js');
    if (parseLrc(txt)) { lyricsSynced = txt; lyricsPlain = lrcToPlain(txt); lyricsSource = 'lrc'; }
  } else if (!lyricsPlain && sidecars.txt) {
    lyricsPlain = fs.readFileSync(sidecars.txt, 'utf8');
    lyricsSource = 'txt';
  }

  let canvasPath: string | null = null;
  let canvasMime: string | null = null;
  if (sidecars.canvas) {
    const cext = path.extname(sidecars.canvas).toLowerCase();
    const cname = `${newId()}${cext}`;
    fs.copyFileSync(sidecars.canvas, path.join(config.canvasDir, cname));
    canvasPath = cname;
    canvasMime = (mime.lookup(cext) as string) || 'video/mp4';
  }

  const trackId = newId();
  const tx = db.transaction(() => {
    const mainArtistId = ensureArtist(db, mainArtistName);
    const albumArtistId = albumArtistName === mainArtistName ? mainArtistId : ensureArtist(db, albumArtistName);
    let albumId: string | null = null;
    if (albumTitle) {
      const albumType = common?.track?.of === 1 ? 'single' : null;
      albumId = ensureAlbum(db, albumArtistId, albumTitle, year ?? null, albumType);
      if (coverName) db.prepare('UPDATE albums SET cover_path = COALESCE(cover_path, ?) WHERE id = ?').run(coverName, albumId);
      if (!coverName) {
        const c = db.prepare('SELECT cover_path FROM albums WHERE id = ?').get(albumId) as any;
        coverName = c?.cover_path ?? null;
      }
    }
    db.prepare(
      `INSERT INTO tracks(id, album_id, artist_id, title, track_no, disc_no, duration_ms, file_path, file_size, file_hash, mime_type, bitrate, sample_rate, codec, explicit, genre, lyrics_plain, lyrics_synced, lyrics_source, canvas_path, canvas_mime, cover_path)
       VALUES (@id, @album_id, @artist_id, @title, @track_no, @disc_no, @duration_ms, @file_path, @file_size, @file_hash, @mime_type, @bitrate, @sample_rate, @codec, 0, @genre, @lyrics_plain, @lyrics_synced, @lyrics_source, @canvas_path, @canvas_mime, @cover_path)`,
    ).run({
      id: trackId,
      album_id: albumId,
      artist_id: mainArtistId,
      title,
      track_no: common?.track?.no ?? null,
      disc_no: common?.disk?.no ?? null,
      duration_ms: Math.round((format?.duration ?? 0) * 1000),
      file_path: storedPath,
      file_size: stat.size,
      file_hash: hash,
      mime_type: audioMime(storedPath),
      bitrate: format?.bitrate ? Math.round(format.bitrate) : null,
      sample_rate: format?.sampleRate ?? null,
      codec: format?.codec ?? format?.container ?? null,
      genre,
      lyrics_plain: lyricsPlain,
      lyrics_synced: lyricsSynced,
      lyrics_source: lyricsSource,
      canvas_path: canvasPath,
      canvas_mime: canvasMime,
      cover_path: albumId ? null : coverName,
    });
    featuring.forEach((name, i) => {
      const fid = ensureArtist(db, name);
      if (fid !== mainArtistId) db.prepare('INSERT OR IGNORE INTO track_artists(track_id, artist_id, position) VALUES (?,?,?)').run(trackId, fid, i);
    });
    indexTrack(db, trackId);
    if (albumId) indexAlbum(db, albumId);
  });
  tx();
  return { ok: true, trackId };
}

/** Recursively walk a directory and import every audio file that is not yet in the library. */
export async function scanDirectory(db: DB, dir: string, onProgress?: (msg: string) => void): Promise<{ imported: string[]; skipped: Array<{ file: string; reason: string }> }> {
  const imported: string[] = [];
  const skipped: Array<{ file: string; reason: string }> = [];
  const known = new Set((db.prepare('SELECT file_path FROM tracks').all() as any[]).map((r) => r.file_path));
  const walk = (d: string): string[] => {
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return []; }
    const files: string[] = [];
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) files.push(...walk(p));
      else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) files.push(p);
    }
    return files;
  };
  const files = walk(dir).sort();
  for (const f of files) {
    if (known.has(f)) continue;
    onProgress?.(f);
    try {
      const r = await importAudioFile(db, f, { mode: 'reference' });
      if (r.ok && r.trackId) imported.push(r.trackId);
      else skipped.push({ file: f, reason: r.reason ?? 'unknown' });
    } catch (e: any) {
      skipped.push({ file: f, reason: e?.message ?? String(e) });
    }
  }
  // Remove tracks whose referenced files disappeared
  for (const r of db.prepare('SELECT id, file_path FROM tracks').all() as any[]) {
    if (r.file_path.startsWith(dir) && !fs.existsSync(r.file_path)) {
      db.prepare('DELETE FROM tracks WHERE id = ?').run(r.id);
      db.prepare(`DELETE FROM search_index WHERE kind='track' AND entity_id=?`).run(r.id);
    }
  }
  cleanupOrphans(db);
  return { imported, skipped };
}

/** Delete albums/artists that no longer have tracks. */
export function cleanupOrphans(db: DB) {
  const albums = db.prepare('SELECT id FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL)').all() as any[];
  for (const a of albums) { db.prepare('DELETE FROM albums WHERE id = ?').run(a.id); db.prepare(`DELETE FROM search_index WHERE kind='album' AND entity_id=?`).run(a.id); }
  const artists = db.prepare('SELECT id FROM artists WHERE id NOT IN (SELECT artist_id FROM tracks) AND id NOT IN (SELECT artist_id FROM track_artists) AND id NOT IN (SELECT artist_id FROM albums)').all() as any[];
  for (const a of artists) { db.prepare('DELETE FROM artists WHERE id = ?').run(a.id); db.prepare(`DELETE FROM search_index WHERE kind='artist' AND entity_id=?`).run(a.id); }
}

export function deleteTrack(db: DB, trackId: string) {
  const t = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as any;
  if (!t) return;
  db.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);
  db.prepare(`DELETE FROM search_index WHERE kind='track' AND entity_id=?`).run(trackId);
  // Only delete files we own (uploads); referenced library files stay untouched.
  if (t.file_path.startsWith(config.tracksDir)) { try { fs.unlinkSync(t.file_path); } catch { /* ignore */ } }
  if (t.canvas_path) { try { fs.unlinkSync(path.join(config.canvasDir, t.canvas_path)); } catch { /* ignore */ } }
  cleanupOrphans(db);
}
