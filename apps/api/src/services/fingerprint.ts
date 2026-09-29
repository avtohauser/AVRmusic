// Acoustic check of a download against the catalogue's own 30-second preview of the recording
// (chromaprint `fpcalc`). The preview is searched for inside the downloaded track: the same recording
// lines up with few differing bits (bit error rate ≈ 0.05–0.2), another song doesn't (≈ 0.5).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { newId } from '../lib/util.js';

let available: Promise<boolean> | null = null;
/** Is fpcalc installed? (checked once) */
export function fingerprintAvailable(): Promise<boolean> {
  available ??= new Promise((resolve) => {
    const p = spawn(config.fpcalcPath, ['-version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
  return available;
}

/** Raw chromaprint of (the first `seconds` of) a file: one 32-bit value per ~0.124 s. */
export function fingerprint(file: string, seconds = 900): Promise<number[] | null> {
  return new Promise((resolve) => {
    const p = spawn(config.fpcalcPath, ['-raw', '-json', '-length', String(seconds), file], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', () => {
      try { const j = JSON.parse(out); resolve(Array.isArray(j.fingerprint) && j.fingerprint.length ? j.fingerprint.map((x: number) => x >>> 0) : null); }
      catch { resolve(null); }
    });
  });
}

function popcount(x: number) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Lowest bit error rate of `part` slid along `whole` (0 = identical, ~0.5 = unrelated audio). */
export function bestAlignment(part: number[], whole: number[]): number {
  if (part.length > whole.length) [part, whole] = [whole, part];
  const n = part.length;
  if (!n) return 1;
  const limit = n * 32;
  let best = limit;
  for (let off = 0; off + n <= whole.length; off++) {
    let err = 0;
    for (let i = 0; i < n && err < best; i++) err += popcount((part[i] ^ whole[off + i]) >>> 0);
    if (err < best) best = err;
  }
  return best / limit;
}

/**
 * How well a downloaded file matches the catalogue preview of the recording: the bit error rate of
 * the best alignment, or null when it can't be told (no fpcalc, no preview, unreadable audio).
 */
export async function previewMismatch(previewUrl: string | null | undefined, file: string): Promise<number | null> {
  if (!previewUrl || !(await fingerprintAvailable())) return null;
  const tmp = path.join(config.tmpDir, `preview-${newId()}.mp3`);
  try {
    const res = await fetch(previewUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    fs.mkdirSync(config.tmpDir, { recursive: true });
    fs.writeFileSync(tmp, new Uint8Array(await res.arrayBuffer()));
    const [p, f] = await Promise.all([fingerprint(tmp, 60), fingerprint(file)]);
    if (!p || !f || p.length < 40) return null;
    return bestAlignment(p, f);
  } catch { return null; }
  finally { try { fs.unlinkSync(tmp); } catch { /* not written */ } }
}
