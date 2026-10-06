// YouTube / SoundCloud via yt-dlp (search prefixes ytsearch: / scsearch:).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { capabilities } from '../ytdlp.js';
import type { CancelRef, DownloadMeta, Log, Source, SourceCandidate, UploadDetails, Want } from './types.js';
import { parseProvidedCredits, titleCredits, wantedGuests } from '../matching.js';
import { withAccount, withLookupCookies, type AccountUse } from '../youtubeAccounts.js';

interface RunOpts { onLine?: (l: string) => void; cancel?: CancelRef; timeoutMs?: number; idleMs?: number }

/**
 * Runs yt-dlp. It is killed when it runs longer than `timeoutMs` or prints nothing for `idleMs`
 * (a stalled download must never hold the queue); `timedOut` then says so.
 */
function run(bin: string, args: string[], opts: RunOpts = {}): Promise<{ code: number; stdout: string; timedOut?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut: string | undefined;
    const kill = (why: string) => { timedOut = why; child.kill('SIGKILL'); };
    const total = opts.timeoutMs ? setTimeout(() => kill(`нет ответа ${Math.round(opts.timeoutMs! / 1000)} с`), opts.timeoutMs) : null;
    let idle: NodeJS.Timeout | null = null;
    const alive = () => {
      if (!opts.idleMs) return;
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => kill(`загрузка стоит ${Math.round(opts.idleMs! / 1000)} с`), opts.idleMs);
    };
    alive();
    child.stdout.on('data', (d) => { alive(); const s = d.toString(); out += s; opts.onLine && s.split(/\r?\n|\r/).forEach((l: string) => l.trim() && opts.onLine!(l.trim())); });
    child.stderr.on('data', (d) => { alive(); opts.onLine && d.toString().split(/\r?\n/).forEach((l: string) => l.trim() && opts.onLine!(l.trim())); });
    child.on('error', (e) => reject(new Error(`Не удалось запустить ${bin}: ${e.message}`)));
    child.on('close', (code) => {
      if (total) clearTimeout(total);
      if (idle) clearTimeout(idle);
      resolve({ code: code ?? -1, stdout: out, timedOut });
    });
    if (opts.cancel) opts.cancel.cancel = () => child.kill('SIGTERM');
  });
}

// one lookup per upload per process: the same videos come up for a song's solo and feat. versions
const detailsCache = new Map<string, UploadDetails>();

export function ytdlpSource(name: 'youtube' | 'soundcloud'): Source {
  const prefix = name === 'soundcloud' ? 'scsearch' : 'ytsearch';
  return {
    name,
    label: name === 'soundcloud' ? 'SoundCloud (yt-dlp)' : 'YouTube (yt-dlp)',
    async available() { const c = await capabilities(); return c.ytdlp ? { ok: true } : { ok: false, reason: 'yt-dlp не установлен' }; },
    async search(w: Want) {
      const guests = wantedGuests(w);
      // the song with every credited artist; a version with guests gets a second query led by them,
      // and YouTube Music's "Songs" search lists the official audio uploads (with exact credits)
      const queries = [`${prefix}8:${w.artist} - ${w.title}${guests.length ? ` feat. ${guests.join(', ')}` : ''}`];
      if (name === 'youtube') queries.push(`https://music.youtube.com/search?q=${encodeURIComponent([w.artist, w.title, ...guests].join(' '))}#songs`);
      const lists = await Promise.all(queries.map(async (q) => {
        const r = await withLookupCookies((ck) => run(config.ytdlpPath, [q, '--flat-playlist', '--playlist-end', '8', '--dump-single-json', '--no-warnings', '--ignore-errors', ...ck], { timeoutMs: 60_000 }));
        const i = r.stdout.indexOf('{');
        if (i < 0) return [];
        const ytm = q.startsWith('https://music.youtube.com/');
        try { return ((JSON.parse(r.stdout.slice(i)).entries ?? []) as any[]).filter(Boolean).map((e) => ({ ...e, ytm })); } catch { return []; }
      }));
      const seen = new Set<string>();
      return lists.flat().filter((e) => e.id && !seen.has(e.id) && seen.add(e.id)).map((e): SourceCandidate => ({
        source: name, id: e.id, title: e.title ?? '', duration: e.duration ?? null, channel: e.channel ?? e.uploader ?? null, uploader: e.uploader ?? null, url: e.url ?? e.webpage_url,
        quality: name === 'soundcloud' ? { codec: 'mp3/opus', bitrate: 128 } : { codec: 'opus/aac', bitrate: 160 },
        // a YouTube Music "Songs" result: an official audio upload, looked at first
        extra: e.ytm ? { ytmSong: true } : undefined,
      }));
    },
    async details(c) {
      return (await this.detailsMany!([c])).get(c.id) ?? null;
    },
    async detailsMany(cs) {
      const out = new Map<string, UploadDetails>();
      const todo = cs.filter((c) => { const hit = detailsCache.get(`${name}:${c.id}`); if (hit) out.set(c.id, hit); return !hit; });
      if (!todo.length) return out;
      const urls = todo.map((c) => (name === 'soundcloud' ? (c.url ?? c.id) : `https://www.youtube.com/watch?v=${c.id}`));
      // one yt-dlp run for the whole batch: one JSON line per upload
      const r = await withLookupCookies((ck) => run(config.ytdlpPath, ['-j', '--skip-download', '--no-playlist', '--no-warnings', '--ignore-errors', '--ignore-no-formats-error', ...ck, ...urls], { timeoutMs: 120_000 }));
      for (const line of r.stdout.split('\n')) {
        const i = line.indexOf('{');
        if (i < 0) continue;
        let j: any;
        try { j = JSON.parse(line.slice(i)); } catch { continue; }
        const c = todo.find((x) => x.id === j.id || x.url === j.webpage_url || x.url === j.original_url);
        if (!c) continue;
        const description = typeof j.description === 'string' ? j.description.slice(0, 1500) : null;
        const tagged: string[] = Array.isArray(j.artists) ? j.artists : j.artist ? String(j.artist).split(/\s*,\s*/) : [];
        // YouTube Music's own credits when present; otherwise the music tags and whatever the title names
        let credits = parseProvidedCredits(description);
        if (!credits) {
          const fromTitle = titleCredits(j.title ?? c.id);
          credits = { title: j.track || fromTitle.title, artists: [...new Set([...fromTitle.artists, ...tagged])], album: j.album ?? null, structured: false };
        }
        const d: UploadDetails = { title: j.title ?? '', channel: j.channel ?? j.uploader ?? null, artist: tagged.join(', ') || null, description, credits, duration: typeof j.duration === 'number' ? j.duration : undefined };
        detailsCache.set(`${name}:${c.id}`, d);
        out.set(c.id, d);
      }
      while (detailsCache.size > 500) detailsCache.delete(detailsCache.keys().next().value!);
      return out;
    },
    async download(c, dir, log: Log, cancel: CancelRef, meta: DownloadMeta) {
      const caps = await capabilities();
      fs.mkdirSync(dir, { recursive: true });
      const url = name === 'soundcloud' ? (c.url ?? c.id) : `https://www.youtube.com/watch?v=${c.id}`;
      // chunked requests keep YouTube from throttling a single long download; DASH parts come in parallel
      const args = ['-f', 'bestaudio/best', '--no-playlist', '--no-warnings', '--newline', '--http-chunk-size', '10M', '--retries', '3', '-o', path.join(dir, '%(id)s.%(ext)s')];
      if (caps.ffmpeg) {
        args.push('-x', '--audio-format', 'best', '--audio-quality', '0', '--embed-metadata');
        const lit = (s: string) => s.replace(/%/g, '%%').replace(/:/g, ' ');
        args.push('--parse-metadata', `${lit(meta.title)}:(?P<meta_title>.+)`, '--parse-metadata', `${lit(meta.artist)}:(?P<meta_artist>.+)`);
        if (meta.album) args.push('--parse-metadata', `${lit(meta.album)}:(?P<meta_album>.+)`);
        if (meta.track) args.push('--parse-metadata', `${meta.track}:(?P<meta_track>.+)`);
        if (meta.year) args.push('--parse-metadata', `${meta.year}:(?P<meta_date>.+)`);
      }
      args.push(url);
      let cancelled = false;
      const current: CancelRef = {};
      cancel.cancel = () => { cancelled = true; current.cancel?.(); };
      // one download per YouTube account at a time; a refused account hands over to the next one
      const fetchWith = async (a: AccountUse) => {
        if (cancelled) throw new Error('Отменено');
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        if (a.cookies || a.proxy) log(`   ⤓ ${a.cookies ? 'аккаунт YouTube: ' : ''}${a.label}`);
        let lastError = '';
        const r = await run(config.ytdlpPath, [...(a.cookies ? ['--cookies', a.cookies] : []), ...(a.proxy ? ['--proxy', a.proxy] : []), ...args], {
          onLine: (l) => { if (/^ERROR/i.test(l)) lastError = l.replace(/^ERROR:\s*/i, ''); if (!/\[download\]\s+\d/.test(l)) log(l); },
          cancel: current,
          idleMs: 120_000,
          timeoutMs: 15 * 60_000,
        });
        if (cancelled) throw new Error('Отменено');
        if (r.timedOut) throw new Error(`yt-dlp: ${r.timedOut} — прервано`);
        if (r.code !== 0) throw new Error(lastError ? `yt-dlp: ${lastError.slice(0, 200)}` : `yt-dlp завершился с кодом ${r.code}`);
      };
      await (name === 'youtube' ? withAccount(fetchWith, { log, cancelled: () => cancelled }) : fetchWith({ cookies: null, label: '', proxy: null }));
      const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.part') && !f.endsWith('.json'));
      if (!files.length) throw new Error('файл не скачан');
      return path.join(dir, files[0]);
    },
  };
}
