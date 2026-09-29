// Automatic canvases: find the official music video on YouTube and cut a short vertical loop out of it.
// Spotify-style: 9 s, 9:16, no audio, H.264 → plays behind the track in "Now playing".
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import mime from 'mime-types';
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { moveFile, newId } from '../lib/util.js';
import { notFound } from '../lib/errors.js';
import { capabilities } from './ytdlp.js';
import { enqueue, type Job, type JobApi } from './jobs.js';

export interface VideoCandidate { id: string; title: string; duration: number | null; channel: string | null; viewCount: number | null }
export interface WantVideo { title: string; artist: string; durationSec: number }
type Log = (s: string) => void;
type CancelRef = { cancel?: () => void };

function run(bin: string, args: string[], onLine?: Log, cancel?: CancelRef): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { const s = d.toString(); out += s; onLine && s.split(/\r?\n|\r/).forEach((l: string) => l.trim() && onLine(l.trim())); });
    child.stderr.on('data', (d) => { onLine && d.toString().split(/\r?\n/).forEach((l: string) => l.trim() && onLine(l.trim())); });
    child.on('error', (e) => reject(new Error(`Не удалось запустить ${bin}: ${e.message}`)));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout: out }));
    if (cancel) cancel.cancel = () => child.kill('SIGTERM');
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (s: string) => norm(s).split(' ').filter((w) => w.length > 1);
/** Things that are not the official clip. Words that also appear in the track title (e.g. "Remix") are allowed. */
const BAD_WORDS = ['lyric', 'lyrics', 'audio', 'live', 'cover', 'karaoke', 'reaction', 'slowed', 'sped', 'nightcore', '8d', 'instrumental', 'tutorial', 'choreography', 'choreo', 'dance', 'fanmade', 'fan', 'teaser', 'trailer', 'behind', 'making', 'snippet', 'shorts', 'remix', 'mashup', 'acoustic', 'unplugged', 'piano', 'guitar', 'bass', 'boosted', 'extended', 'hour', 'loop', 'reverb', 'edit', 'concert', 'session', 'sessions', 'rehearsal',
  'текст', 'караоке', 'кавер', 'реакция', 'акустика', 'разбор', 'урок', 'минус', 'бэкстейдж', 'тизер', 'трейлер', 'концерт', 'репетиция', 'ремикс'];

/** Rank a YouTube search result as "the official video of this track". ≥ 40 is trusted. */
export function scoreVideo(v: VideoCandidate, want: WantVideo): number {
  const title = norm(v.title);
  const wantTitle = norm(want.title);
  const artist = norm(want.artist);
  const chan = norm(v.channel ?? '');
  const tw = words(want.title);
  const hit = tw.length ? tw.filter((w) => title.includes(w)).length / tw.length : (title.includes(wantTitle) ? 1 : 0);
  if (hit < 0.6) return -100; // another song
  let s = 30 * hit;
  const artistHit = title.includes(artist) || chan.includes(artist) || (artist.length > 3 && chan.replace(/\s/g, '').includes(artist.replace(/\s/g, '')));
  s += artistHit ? 20 : -15;
  if (/official/i.test(v.title) || /официальн/i.test(v.title)) s += 25;
  if (/\b(video|clip|m\/v|mv)\b|клип/i.test(v.title)) s += 12;
  if (/vevo/i.test(v.channel ?? '')) s += 15;
  if (chan === artist) s += 10;
  if (/visuali[sz]er/i.test(v.title)) s -= 8;
  if (/\btopic\b/i.test(v.channel ?? '')) s -= 40; // auto-generated audio uploads: static artwork
  const allowed = new Set(words(want.title));
  const titleWords = new Set(words(v.title).concat(words(v.title).map((w) => w.replace(/s$/, ''))));
  if (BAD_WORDS.some((b) => titleWords.has(b) && !allowed.has(b))) s -= 60;
  if (v.duration && want.durationSec) {
    const r = v.duration / want.durationSec;
    if (r >= 0.8 && r <= 1.5) s += 20; else if (r < 0.5 || r > 2.5) s -= 30; else s -= 5;
  }
  if (v.viewCount) s += Math.min(10, Math.log10(v.viewCount + 1) * 1.5);
  return s;
}

export async function searchOfficialVideo(want: WantVideo): Promise<Array<{ v: VideoCandidate; s: number }>> {
  const caps = await capabilities();
  if (!caps.ytdlp) throw new Error('yt-dlp не установлен на сервере');
  const q = `${want.artist} - ${want.title} official video`;
  const r = await run(config.ytdlpPath, [`ytsearch10:${q}`, '--flat-playlist', '--dump-single-json', '--no-warnings', '--ignore-errors']);
  const i = r.stdout.indexOf('{');
  if (i < 0) return [];
  let parsed: any;
  try { parsed = JSON.parse(r.stdout.slice(i)); } catch { return []; }
  const cands = ((parsed.entries ?? []) as any[]).filter((e) => e && e.id).map((e): VideoCandidate => ({
    id: e.id, title: e.title ?? '', duration: e.duration ?? null, channel: e.channel ?? e.uploader ?? null, viewCount: e.view_count ?? null,
  }));
  return cands.map((v) => ({ v, s: scoreVideo(v, want) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
}

/** Download a short slice of the video and turn it into a 720×1280 silent H.264 loop. Returns the mp4 path (in a temp dir). */
export async function makeCanvasFromVideo(videoId: string, videoDuration: number | null, log: Log, cancel: CancelRef): Promise<{ file: string; mime: string; dir: string }> {
  const caps = await capabilities();
  if (!caps.ytdlp) throw new Error('yt-dlp не установлен на сервере');
  if (!caps.ffmpeg) throw new Error('для нарезки канваса нужен ffmpeg');
  const dir = path.join(config.tmpDir, `canvas-${newId()}`);
  fs.mkdirSync(dir, { recursive: true });
  const len = config.canvasSeconds;
  const dur = videoDuration ?? 0;
  // Skip intros: start about 38 % in (never earlier than 20 s), but leave room for the slice at the end.
  const start = dur > len + 25 ? Math.min(Math.max(20, Math.round(dur * 0.38)), Math.floor(dur - len - 3)) : 0;
  const args = ['--no-playlist', '--no-warnings', '--newline', '-f', 'bv*[height<=1080][ext=mp4]/bv*[height<=1080]/bv*/b',
    '--download-sections', `*${start}-${start + len + 2}`, '-o', path.join(dir, '%(id)s.%(ext)s'), `https://www.youtube.com/watch?v=${videoId}`];
  const r = await run(config.ytdlpPath, args, (l) => { if (!/\[download\]\s+\d/.test(l)) log(`   ${l}`); }, cancel);
  if (r.code !== 0) throw new Error(`yt-dlp завершился с кодом ${r.code}`);
  const raw = fs.readdirSync(dir).filter((f) => !f.endsWith('.part') && !f.endsWith('.json')).map((f) => path.join(dir, f))[0];
  if (!raw) throw new Error('видео не скачано');
  const out = path.join(dir, 'canvas.mp4');
  const ff = await run(config.ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-t', String(len), '-an',
    '-vf', "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=720:1280:flags=lanczos,fps=30",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], (l) => log(`   ffmpeg: ${l}`), cancel);
  if (ff.code !== 0 || !fs.existsSync(out) || fs.statSync(out).size < 1024) throw new Error(`ffmpeg не смог собрать канвас (код ${ff.code})`);
  return { file: out, mime: 'video/mp4', dir };
}

/** Attach a canvas file to the track (replacing the previous one). */
export function setCanvas(db: DB, trackId: string, file: string, mimeType: string) {
  const ext = path.extname(file).toLowerCase() || '.mp4';
  const name = `${trackId}-${Date.now().toString(36)}${ext}`;
  fs.mkdirSync(config.canvasDir, { recursive: true });
  const dest = path.join(config.canvasDir, name);
  moveFile(file, dest);
  const old = (db.prepare('SELECT canvas_path FROM tracks WHERE id = ?').get(trackId) as any)?.canvas_path;
  db.prepare('UPDATE tracks SET canvas_path = ?, canvas_mime = ? WHERE id = ?').run(name, mimeType || (mime.lookup(ext) as string) || 'video/mp4', trackId);
  if (old && old !== name) { try { fs.unlinkSync(path.join(config.canvasDir, old)); } catch { /* ignore */ } }
}

/** Find the official clip for a library track and store a slice of it as the canvas. */
export async function fetchCanvasForTrack(db: DB, trackId: string, log: Log, cancel: CancelRef): Promise<boolean> {
  const t = db.prepare('SELECT t.id, t.title, t.duration_ms, a.name AS artist FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE t.id = ?').get(trackId) as any;
  if (!t) throw notFound('Трек не найден');
  const want: WantVideo = { title: t.title, artist: t.artist, durationSec: (t.duration_ms ?? 0) / 1000 };
  log(`🎬 ${want.artist} — ${want.title}`);
  const ranked = await searchOfficialVideo(want);
  const good = ranked.filter((r) => r.s >= 40).slice(0, 2);
  if (!good.length) {
    log(`   клип не найден${ranked[0] ? ` (лучшее: ${ranked[0].v.title} · ${ranked[0].s.toFixed(0)})` : ''}`);
    return false;
  }
  for (const { v, s } of good) {
    log(`   → ${v.title} [${v.channel ?? '?'}] ${v.duration ?? '?'}s (score ${s.toFixed(0)})`);
    let dir: string | null = null;
    try {
      const made = await makeCanvasFromVideo(v.id, v.duration, log, cancel);
      dir = made.dir;
      setCanvas(db, trackId, made.file, made.mime);
      log('   ✓ канвас сохранён');
      return true;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      log(`   ✗ ${msg}`);
      if (/Отменено|abort/i.test(msg)) throw e;
    } finally {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  return false;
}

/** Queue a canvas job for the given tracks (those that already have one are skipped unless `force`). */
export function enqueueCanvasJob(db: DB, trackIds: string[], title: string, opts: { force?: boolean; requestedBy?: string | null } = {}): Job {
  void db;
  return enqueue({ kind: 'canvas', title, requestedBy: opts.requestedBy ?? null }, { trackIds, force: !!opts.force });
}

/** Runner for canvas jobs (also used when the queue resumes after a restart). */
export async function runCanvasJob(db: DB, job: Job, payload: { trackIds?: string[]; force?: boolean }, api: JobApi) {
  const cancelRef: CancelRef = {};
  let cancelled = false;
  api.onCancel(() => { cancelled = true; cancelRef.cancel?.(); });
  const ids = (payload.trackIds ?? []).filter((id) => {
    const r = db.prepare('SELECT canvas_path, codec FROM tracks WHERE id = ?').get(id) as any;
    return r && r.codec !== 'video' && (payload.force || !r.canvas_path);
  });
  job.stats = { total: ids.length, found: 0, checked: 0 };
  for (const id of ids) {
    if (cancelled) throw new Error('Отменено');
    try { if (await fetchCanvasForTrack(db, id, api.log, cancelRef)) job.stats.found++; }
    catch (e: any) { if (/Отменено/.test(e?.message ?? '')) throw e; api.log(`   ! ${e?.message ?? e}`); }
    job.stats.checked++;
    api.progress((job.stats.checked / Math.max(1, ids.length)) * 100);
  }
}

/** After a catalogue acquisition: fetch canvases for the imported tracks in a follow-up job. */
export function queueCanvasesForImported(db: DB, job: Job) {
  if (!config.canvasAuto) return;
  const ids = job.imported.filter((t) => !t.hasCanvas).map((t) => t.id);
  if (ids.length) enqueueCanvasJob(db, ids, `Канвасы: ${job.title ?? ''}`.trim(), { requestedBy: job.requestedBy ?? null });
}
