// YouTube / SoundCloud via yt-dlp (search prefixes ytsearch: / scsearch:).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { capabilities } from '../ytdlp.js';
import type { CancelRef, DownloadMeta, Log, Source, SourceCandidate, Want } from './types.js';

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

export function ytdlpSource(name: 'youtube' | 'soundcloud'): Source {
  const prefix = name === 'soundcloud' ? 'scsearch' : 'ytsearch';
  return {
    name,
    label: name === 'soundcloud' ? 'SoundCloud (yt-dlp)' : 'YouTube (yt-dlp)',
    async available() { const c = await capabilities(); return c.ytdlp ? { ok: true } : { ok: false, reason: 'yt-dlp не установлен' }; },
    async search(w: Want) {
      const feats = w.featuring ?? [];
      // A "feat." version gets a second query led by the guests, so the upload crediting them makes the list
      const queries = [`${w.artist} - ${w.title}${feats.length ? ` feat. ${feats.join(', ')}` : ''}`];
      if (feats.length) queries.push(`${w.title} ${feats.join(' ')} ${w.artist}`);
      const lists = await Promise.all(queries.map(async (q) => {
        const r = await run(config.ytdlpPath, [`${prefix}8:${q}`, '--flat-playlist', '--dump-single-json', '--no-warnings', '--ignore-errors']);
        const i = r.stdout.indexOf('{');
        if (i < 0) return [];
        try { return ((JSON.parse(r.stdout.slice(i)).entries ?? []) as any[]).filter(Boolean); } catch { return []; }
      }));
      const seen = new Set<string>();
      return lists.flat().filter((e) => e.id && !seen.has(e.id) && seen.add(e.id)).map((e): SourceCandidate => ({
        source: name, id: e.id, title: e.title ?? '', duration: e.duration ?? null, channel: e.channel ?? e.uploader ?? null, uploader: e.uploader ?? null, url: e.url ?? e.webpage_url,
        quality: name === 'soundcloud' ? { codec: 'mp3/opus', bitrate: 128 } : { codec: 'opus/aac', bitrate: 160 },
      }));
    },
    async details(c) {
      const url = name === 'soundcloud' ? (c.url ?? c.id) : `https://www.youtube.com/watch?v=${c.id}`;
      const r = await run(config.ytdlpPath, ['-J', '--skip-download', '--no-playlist', '--no-warnings', url]);
      const i = r.stdout.indexOf('{');
      if (r.code !== 0 || i < 0) return null;
      try {
        const j = JSON.parse(r.stdout.slice(i));
        const artists = Array.isArray(j.artists) ? j.artists.join(', ') : j.artist ?? j.creator ?? null;
        return { title: j.title ?? '', channel: j.channel ?? j.uploader ?? null, artist: artists, description: typeof j.description === 'string' ? j.description.slice(0, 600) : null };
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
