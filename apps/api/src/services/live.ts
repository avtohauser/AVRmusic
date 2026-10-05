// Instant play from the catalogue: a song that is not in the library yet plays in full within seconds.
// The best source is picked the same careful way the fetching does (the right recording, the right
// guests), its direct audio address is asked for, and the audio is passed through this server to the
// player (with seeking). Meanwhile the song is fetched into the library as usual, with priority; the
// next time it plays from here.
import { spawn } from 'node:child_process';
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { rawTrack } from './catalog.js';
import { pickSources, wantOf } from './acquire.js';
import { withLookupCookies } from './youtubeAccounts.js';

export interface LiveSource { url: string; mime: string; expires: number; label: string }

const live = new Map<string, LiveSource>();
const resolving = new Map<string, Promise<LiveSource | null>>();

const MIME: Record<string, string> = { m4a: 'audio/mp4', mp4: 'audio/mp4', webm: 'audio/webm', opus: 'audio/ogg', ogg: 'audio/ogg', mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav' };

function mimeOf(ext: string | null | undefined, url?: string): string {
  const e = (ext || url?.split('?')[0].split('.').pop() || '').toLowerCase();
  return MIME[e] ?? 'audio/mpeg';
}

/** The direct address of an upload's audio (an AAC one when [aac] — iPhones play nothing else of these). */
function directUrl(pageUrl: string, aac: boolean): Promise<{ url: string; ext: string } | null> {
  const format = aac ? '140/bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]' : '140/bestaudio[ext=m4a]/bestaudio';
  return withLookupCookies((ck) => new Promise((resolve) => {
    const child = spawn(config.ytdlpPath, ['-f', format, '--no-playlist', '--no-warnings', '--print', '%(ext)s|%(url)s', ...ck, pageUrl], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', () => {
      clearTimeout(timer);
      const line = out.trim().split('\n').pop() ?? '';
      const i = line.indexOf('|');
      if (i < 0 || !line.slice(i + 1).startsWith('http')) return resolve(null);
      resolve({ ext: line.slice(0, i), url: line.slice(i + 1) });
    });
  }));
}

/** Where the full song can be streamed from right now, or null when no source fits. */
export async function liveSource(db: DB, deezerId: number, aac: boolean): Promise<LiveSource | null> {
  const key = `${deezerId}:${aac ? 'aac' : 'any'}`;
  const hit = live.get(key);
  if (hit && hit.expires > Date.now()) return hit;
  const pending = resolving.get(key);
  if (pending) return pending;
  const p = (async () => {
    const t = await rawTrack(db, deezerId);
    const { reliable } = await pickSources(db, wantOf(t), () => {});
    for (const r of reliable.slice(0, 4)) {
      // sources that serve files themselves (Audius, Jamendo, Internet Archive)
      if (r.c.downloadUrl) {
        const mime = mimeOf(r.c.quality?.format, r.c.downloadUrl);
        if (aac && !['audio/mp4', 'audio/mpeg', 'audio/wav'].includes(mime)) continue;
        return { url: r.c.downloadUrl, mime, expires: Date.now() + 6 * 3600_000, label: r.src.label };
      }
      if (r.c.source !== 'youtube' && r.c.source !== 'soundcloud') continue;
      const page = r.c.source === 'youtube' ? `https://www.youtube.com/watch?v=${r.c.id}` : (r.c.url ?? r.c.id);
      const d = await directUrl(page, aac);
      if (!d) continue;
      const mime = mimeOf(d.ext);
      if (aac && mime !== 'audio/mp4' && mime !== 'audio/mpeg') continue;
      // YouTube's addresses live about six hours
      const expireParam = Number(new URL(d.url).searchParams.get('expire') ?? 0) * 1000;
      const expires = Math.min(expireParam || Infinity, Date.now() + 3 * 3600_000) - 60_000;
      return { url: d.url, mime, expires, label: r.src.label };
    }
    return null;
  })();
  resolving.set(key, p);
  try {
    const s = await p;
    if (s) live.set(key, s);
    while (live.size > 300) live.delete(live.keys().next().value!);
    return s;
  } finally {
    resolving.delete(key);
  }
}

/** A stale address (YouTube refused it): forget it, the next request asks for a fresh one. */
export function forgetLive(deezerId: number) {
  for (const k of [...live.keys()]) if (k.startsWith(`${deezerId}:`)) live.delete(k);
}
