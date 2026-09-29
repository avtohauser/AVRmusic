// YouTube / SoundCloud via yt-dlp (search prefixes ytsearch: / scsearch:).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { capabilities } from '../ytdlp.js';
import type { CancelRef, DownloadMeta, Log, Source, SourceCandidate, Want } from './types.js';
import { parseProvidedCredits, titleCredits, wantedGuests } from '../matching.js';

function run(bin: string, args: string[], onLine?: (l: string) => void, cancel?: CancelRef): Promise<{ code: number; stdout: string }> {
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

// one lookup per upload per process: the same videos come up for a song's solo and feat. versions
const detailsCache = new Map<string, NonNullable<Awaited<ReturnType<NonNullable<Source['details']>>>>>();

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
      if (guests.length) queries.push(`${prefix}8:${w.title} ${guests.join(' ')} ${w.artist}`);
      if (name === 'youtube') queries.push(`https://music.youtube.com/search?q=${encodeURIComponent([w.artist, w.title, ...guests].join(' '))}#songs`);
      const lists = await Promise.all(queries.map(async (q) => {
        const r = await run(config.ytdlpPath, [q, '--flat-playlist', '--playlist-end', '8', '--dump-single-json', '--no-warnings', '--ignore-errors']);
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
      const hit = detailsCache.get(`${name}:${c.id}`);
      if (hit) return hit;
      const url = name === 'soundcloud' ? (c.url ?? c.id) : `https://www.youtube.com/watch?v=${c.id}`;
      const r = await run(config.ytdlpPath, ['-J', '--skip-download', '--no-playlist', '--no-warnings', url]);
      const i = r.stdout.indexOf('{');
      if (r.code !== 0 || i < 0) return null;
      try {
        const j = JSON.parse(r.stdout.slice(i));
        const description = typeof j.description === 'string' ? j.description.slice(0, 1500) : null;
        const tagged: string[] = Array.isArray(j.artists) ? j.artists : j.artist ? String(j.artist).split(/\s*,\s*/) : [];
        // YouTube Music's own credits when present; otherwise the music tags and whatever the title names
        let credits = parseProvidedCredits(description);
        if (!credits) {
          const fromTitle = titleCredits(j.title ?? c.id);
          credits = { title: j.track || fromTitle.title, artists: [...new Set([...fromTitle.artists, ...tagged])], album: j.album ?? null, structured: false };
        }
        const out = { title: j.title ?? '', channel: j.channel ?? j.uploader ?? null, artist: tagged.join(', ') || null, description, credits, duration: typeof j.duration === 'number' ? j.duration : undefined };
        detailsCache.set(`${name}:${c.id}`, out);
        if (detailsCache.size > 500) detailsCache.delete(detailsCache.keys().next().value!);
        return out;
      } catch { return null; }
    },
    async download(c, dir, log: Log, cancel: CancelRef, meta: DownloadMeta) {
      const caps = await capabilities();
      fs.mkdirSync(dir, { recursive: true });
      const url = name === 'soundcloud' ? (c.url ?? c.id) : `https://www.youtube.com/watch?v=${c.id}`;
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
      const r = await run(config.ytdlpPath, args, (l) => { if (!/\[download\]\s+\d/.test(l)) log(l); }, cancel);
      if (r.code !== 0) throw new Error(`yt-dlp завершился с кодом ${r.code}`);
      const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.part') && !f.endsWith('.json'));
      if (!files.length) throw new Error('файл не скачан');
      return path.join(dir, files[0]);
    },
  };
}
