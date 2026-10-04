// Two things measured once per track, quietly in the background: its loudness (EBU R128 integrated
// loudness, with ffmpeg) so the apps can even out the volume between tracks, and its tempo (the
// catalogue's BPM) for the wave's moods — running, focus, evening, party. A small batch every few
// minutes, at the lowest CPU priority, and only while nobody's download is waiting.
import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { rawTrack } from './catalog.js';
import { userJobWaiting } from './jobs.js';

/** Integrated loudness of a file in LUFS, or null when it can't be measured. */
export function measureLoudness(file: string): Promise<number | null> {
  return new Promise((resolve) => {
    if (!fs.existsSync(file)) return resolve(null);
    const child = spawn(config.ffmpegPath, ['-hide_banner', '-nostats', '-i', file, '-vn', '-filter_complex', 'ebur128=framelog=quiet', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (child.pid) { try { os.setPriority(child.pid, 19); } catch { /* not allowed */ } }
    let err = '';
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', () => {
      clearTimeout(timer);
      // the summary at the end: "Integrated loudness: … I: -9.3 LUFS"
      const m = /Integrated loudness:[\s\S]*?I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/.exec(err);
      const v = m ? Number(m[1]) : NaN;
      resolve(Number.isFinite(v) && v > -70 ? v : null);
    });
  });
}

let busy = false;

/** One batch: up to [n] tracks without a loudness, and tempos from the catalogue. */
export async function analyzeBatch(db: DB, n = 12): Promise<number> {
  if (busy) return 0;
  busy = true;
  let done = 0;
  try {
    for (const r of db.prepare(`SELECT id, file_path FROM tracks WHERE loudness IS NULL AND codec <> 'video' ORDER BY play_count DESC, created_at DESC LIMIT ?`).all(n) as any[]) {
      if (userJobWaiting()) break;
      const v = await measureLoudness(r.file_path);
      // 0 marks "tried": not measured again on every pass
      db.prepare('UPDATE tracks SET loudness = ? WHERE id = ?').run(v ?? 0, r.id);
      done++;
    }
    for (const r of db.prepare(`SELECT id, deezer_id FROM tracks WHERE bpm IS NULL AND deezer_id IS NOT NULL LIMIT ?`).all(n * 2) as any[]) {
      if (userJobWaiting()) break;
      let bpm = 0;
      try { bpm = Number((await rawTrack(db, Number(r.deezer_id)))?.bpm) || 0; } catch { /* the catalogue is down: try later */ continue; }
      db.prepare('UPDATE tracks SET bpm = ? WHERE id = ?').run(bpm, r.id);
      done++;
      await new Promise((res) => setTimeout(res, 300));
    }
    // tracks without a catalogue identity have no tempo to look up
    db.prepare('UPDATE tracks SET bpm = 0 WHERE bpm IS NULL AND deezer_id IS NULL').run();
  } finally {
    busy = false;
  }
  return done;
}

/** Every few minutes, a batch. */
export function startAnalysis(db: DB) {
  const tick = () => { analyzeBatch(db).catch(() => { /* next time */ }); };
  setTimeout(tick, 90_000).unref();
  setInterval(tick, 4 * 60_000).unref();
}
