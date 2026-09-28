import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../../config.js';

export const UA = `AVRmusic/${config.version} (self-hosted music server)`;

export async function getJson<T = any>(url: string, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const EXT_BY_MIME: Record<string, string> = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/flac': '.flac', 'audio/x-flac': '.flac', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/webm': '.webm', 'audio/opus': '.opus' };

/** Stream a URL to a file (follows redirects). Extension is taken from the URL or the Content-Type. */
export async function downloadFile(url: string, dir: string, baseName: string, cancel?: { cancel?: () => void }, log?: (s: string) => void): Promise<string> {
  const ac = new AbortController();
  if (cancel) cancel.cancel = () => ac.abort();
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: ac.signal });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} при скачивании`);
  const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  let ext = path.extname(new URL(res.url || url).pathname).toLowerCase();
  if (!/^\.(mp3|flac|wav|ogg|oga|opus|m4a|aac|webm|aiff?)$/.test(ext)) ext = EXT_BY_MIME[ct] || '.mp3';
  const dest = path.join(dir, `${baseName}${ext}`);
  fs.mkdirSync(dir, { recursive: true });
  const total = Number(res.headers.get('content-length') || 0);
  let got = 0, lastPct = -1;
  const src = Readable.fromWeb(res.body as any);
  src.on('data', (chunk: Buffer) => {
    got += chunk.length;
    if (total && log) { const pct = Math.floor((got / total) * 10) * 10; if (pct !== lastPct) { lastPct = pct; log(`[download] ${pct}%`); } }
  });
  await pipeline(src, fs.createWriteStream(dest));
  if (!fs.statSync(dest).size) { fs.unlinkSync(dest); throw new Error('пустой файл'); }
  return dest;
}
