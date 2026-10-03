// iPhones can't play Opus, Vorbis or WebM audio (what YouTube imports usually are): for the iOS app such
// a track is converted once to AAC in an .m4a with its index up front (so the player can seek) and kept
// next to the database; later plays and offline saves reuse the file.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';

const APPLE_OK = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/flac', 'audio/x-flac', 'audio/wav', 'audio/x-wav', 'audio/aiff']);
const running = new Map<string, Promise<string>>();

export function needsCompat(mime: string | null | undefined): boolean {
  return !APPLE_OK.has(String(mime ?? '').toLowerCase());
}

/** The track as AAC (converted on first use; concurrent requests share one conversion). */
export function compatFile(id: string, src: string): Promise<string> {
  const out = path.join(config.dataDir, 'compat', `${id}.m4a`);
  try {
    if (fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) return Promise.resolve(out);
  } catch { /* not converted yet */ }
  let p = running.get(id);
  if (!p) {
    p = convert(src, out).finally(() => running.delete(id));
    running.set(id, p);
  }
  return p;
}

function convert(src: string, out: string): Promise<string> {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.part.m4a`;
  return new Promise((resolve, reject) => {
    const ff = spawn(config.ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-vn', '-map', '0:a:0',
      '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    ff.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    const timer = setTimeout(() => ff.kill('SIGKILL'), 3 * 60_000);
    ff.on('error', (e) => { clearTimeout(timer); fs.rmSync(tmp, { force: true }); reject(e); });
    ff.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size > 1024) {
        fs.renameSync(tmp, out);
        resolve(out);
      } else {
        fs.rmSync(tmp, { force: true });
        reject(new Error(`ffmpeg ${code}: ${err.trim()}`));
      }
    });
  });
}
