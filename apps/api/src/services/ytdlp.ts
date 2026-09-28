// Import audio/video from URLs (YouTube, SoundCloud, Bandcamp, direct links …) via yt-dlp.
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import mime from 'mime-types';
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { newId } from '../lib/util.js';
import { guessFromFilename, importAudioFile, saveCover } from './importer.js';
import { indexTrack } from './search.js';
import type { Job } from './jobs.js';

export interface Capabilities { ytdlp: boolean; ytdlpVersion: string | null; ffmpeg: boolean; musicDir: string | null; mediaDir: string; sources?: Array<{ name: string; label: string; enabled: boolean; ok: boolean; reason?: string }> }

function which(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(bin, args, { timeout: 8000 }, (err, stdout) => resolve(err ? null : String(stdout).trim().split('\n')[0]));
    } catch {
      resolve(null);
    }
  });
}

let capsCache: { at: number; value: Capabilities } | null = null;
export async function capabilities(): Promise<Capabilities> {
  if (capsCache && Date.now() - capsCache.at < 60_000) return capsCache.value;
  const [yt, ff] = await Promise.all([which(config.ytdlpPath, ['--version']), which(config.ffmpegPath, ['-version'])]);
  const value: Capabilities = { ytdlp: !!yt, ytdlpVersion: yt, ffmpeg: !!ff, musicDir: config.musicDir, mediaDir: config.mediaDir };
  capsCache = { at: Date.now(), value };
  return value;
}

export interface UrlImportOptions { url: string; mode: 'audio' | 'video'; artist?: string; album?: string; genre?: string }

/** Runs yt-dlp into a temp dir, then imports every produced media file. Streams progress into the job. */
export async function runUrlImport(db: DB, job: Job, opts: UrlImportOptions, api: { log: (s: string) => void; progress: (p: number) => void; onCancel: (fn: () => void) => void }) {
  const caps = await capabilities();
  if (!caps.ytdlp) throw new Error('yt-dlp не установлен на сервере (pip install yt-dlp)');
  const work = path.join(config.tmpDir, `ytdlp-${newId()}`);
  fs.mkdirSync(work, { recursive: true });

  const args = [
    '--no-playlist-reverse', '--yes-playlist', '--ignore-errors', '--no-warnings', '--newline', '--progress',
    '--write-info-json', '--write-thumbnail', '--convert-thumbnails', 'jpg',
    '--restrict-filenames', '--no-overwrites', '--no-mtime',
    '-o', path.join(work, '%(playlist_index|)s%(playlist_index&-|)s%(title).120s [%(id)s].%(ext)s'),
  ];
  if (!caps.ffmpeg) args.splice(args.indexOf('--convert-thumbnails'), 2); // thumbnail conversion needs ffmpeg
  if (opts.mode === 'audio') {
    args.push('-f', 'bestaudio/best');
    if (caps.ffmpeg) args.push('-x', '--audio-format', 'best', '--audio-quality', '0', '--embed-metadata', '--embed-thumbnail');
  } else {
    args.push('-f', caps.ffmpeg ? 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best' : 'best[ext=mp4]/best');
    if (caps.ffmpeg) args.push('--merge-output-format', 'mp4', '--embed-metadata');
  }
  args.push(opts.url);

  api.log(`$ yt-dlp ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(config.ytdlpPath, args, { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
    let cancelled = false;
    api.onCancel(() => { cancelled = true; child.kill('SIGTERM'); });
    const onLine = (line: string) => {
      line = line.trim();
      if (!line) return;
      const m = /\[download\]\s+([\d.]+)%/.exec(line);
      if (m) api.progress(Number(m[1]) * 0.9);
      else api.log(line);
    };
    let buf = '';
    child.stdout.on('data', (d) => { buf += d.toString(); const parts = buf.split(/\r?\n|\r/); buf = parts.pop() ?? ''; parts.forEach(onLine); });
    child.stderr.on('data', (d) => d.toString().split(/\r?\n/).forEach((l: string) => l.trim() && api.log(l.trim())));
    child.on('error', (e) => reject(new Error(`Не удалось запустить yt-dlp: ${e.message}`)));
    child.on('close', (code) => {
      if (cancelled) return reject(new Error('Отменено'));
      // yt-dlp returns 1 when some playlist entries failed but others succeeded; we import whatever exists.
      if (code !== 0 && code !== 1) return reject(new Error(`yt-dlp завершился с кодом ${code}`));
      resolve();
    });
  });

  const files = fs.readdirSync(work).filter((f) => !f.endsWith('.json') && !/\.(jpg|jpeg|png|webp)$/i.test(f) && !f.endsWith('.part'));
  if (!files.length) throw new Error('yt-dlp ничего не скачал (проверьте ссылку и лог)');
  api.log(`Файлов для импорта: ${files.length}`);
  let done = 0;
  for (const f of files.sort()) {
    const full = path.join(work, f);
    const base = f.replace(/\.[^.]+$/, '');
    let info: any = null;
    try { info = JSON.parse(fs.readFileSync(path.join(work, `${base}.info.json`), 'utf8')); } catch { /* optional */ }
    const thumb = ['jpg', 'jpeg', 'png', 'webp'].map((e) => path.join(work, `${base}.${e}`)).find((p) => fs.existsSync(p));
    let title: string = info?.track || cleanTitle(info?.title || base.replace(/ \[[^\]]+\]$/, ''));
    let artist: string | undefined = opts.artist || info?.artist || info?.creator || undefined;
    if (!artist) {
      // "Artist - Song" in the title beats the uploader/channel name (e.g. "ArtistVEVO")
      const g = guessFromFilename(title);
      if (g.artist) { artist = g.artist; title = g.title; }
      else artist = info?.uploader || info?.channel || undefined;
    }
    const album = opts.album || info?.album || info?.playlist_title || undefined;
    const genre = opts.genre || (Array.isArray(info?.genres) ? info.genres[0] : info?.genre) || undefined;
    const year = info?.release_year || (info?.upload_date ? Number(String(info.upload_date).slice(0, 4)) : undefined);
    try {
      if (opts.mode === 'video') {
        const trackId = await importVideo(db, full, { title, artist, album, genre, year, thumb, info });
        job.imported.push(...(await import('./library.js')).getTracksByIds(db, [trackId]));
      } else {
        const r = await importAudioFile(db, full, { mode: 'move', originalName: f, overrides: { title, artist, album, genre, year } });
        if (r.ok && r.trackId) {
          if (thumb) applyThumb(db, r.trackId, thumb);
          job.imported.push(...(await import('./library.js')).getTracksByIds(db, [r.trackId]));
        } else api.log(`Пропущено ${f}: ${r.reason}`);
      }
    } catch (e: any) {
      api.log(`Ошибка ${f}: ${e?.message ?? e}`);
    }
    done++;
    api.progress(90 + (done / files.length) * 10);
  }
  fs.rmSync(work, { recursive: true, force: true });
}

/** Strip YouTube-style suffixes: "(Official Video)", "[Lyrics]", "(Audio)", "| HQ" … */
export function cleanTitle(t: string): string {
  const kw = '(?:official|video|audio|lyric|lyrics|visuali[sz]er|hd|hq|4k|remaster(?:ed)?|clip|премьера|клип|official music)';
  const bracket = new RegExp(`\\s*[\\(\\[][^\\)\\]]*(?<![\\p{L}\\p{N}])${kw}(?![\\p{L}\\p{N}])[^\\)\\]]*[\\)\\]]`, 'giu');
  return t
    .replace(bracket, '')
    .replace(/\s*\|\s*(official|hd|hq|4k|lyrics?).*$/iu, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || t;
}

function applyThumb(db: DB, trackId: string, thumb: string) {
  const t = db.prepare('SELECT album_id, cover_path FROM tracks WHERE id = ?').get(trackId) as any;
  if (!t) return;
  const has = t.cover_path || (t.album_id && (db.prepare('SELECT cover_path FROM albums WHERE id = ?').get(t.album_id) as any)?.cover_path);
  if (has) return;
  const name = saveCover(fs.readFileSync(thumb), (mime.lookup(thumb) as string) || 'image/jpeg');
  if (t.album_id) db.prepare('UPDATE albums SET cover_path = COALESCE(cover_path, ?) WHERE id = ?').run(name, t.album_id);
  else db.prepare('UPDATE tracks SET cover_path = ? WHERE id = ?').run(name, trackId);
}

/** Store a downloaded video as a library item (playable audio, downloadable mp4; the video doubles as its own canvas). */
async function importVideo(db: DB, file: string, m: { title: string; artist?: string; album?: string; genre?: string; year?: number; thumb?: string; info: any }): Promise<string> {
  const { ensureArtist, ensureAlbum } = await import('./importer.js');
  const { hashFile } = await import('../lib/util.js');
  const ext = path.extname(file).toLowerCase() || '.mp4';
  const id = newId();
  const dest = path.join(config.videosDir, `${id}${ext}`);
  fs.mkdirSync(config.videosDir, { recursive: true });
  fs.renameSync(file, dest);
  const hash = await hashFile(dest);
  const stat = fs.statSync(dest);
  const cover = m.thumb ? saveCover(fs.readFileSync(m.thumb), (mime.lookup(m.thumb) as string) || 'image/jpeg') : null;
  const tx = db.transaction(() => {
    const artistId = ensureArtist(db, m.artist || 'Видео');
    const albumId = m.album ? ensureAlbum(db, artistId, m.album, m.year ?? null, 'compilation') : null;
    if (albumId && cover) db.prepare('UPDATE albums SET cover_path = COALESCE(cover_path, ?) WHERE id = ?').run(cover, albumId);
    db.prepare(`INSERT INTO tracks(id, album_id, artist_id, title, duration_ms, file_path, file_size, file_hash, mime_type, codec, genre, cover_path, canvas_path, canvas_mime)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, albumId, artistId, m.title, Math.round((m.info?.duration ?? 0) * 1000), dest, stat.size, hash, (mime.lookup(ext) as string) || 'video/mp4', 'video', m.genre ?? null, albumId ? null : cover, null, null);
    indexTrack(db, id);
  });
  tx();
  return id;
}
