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
      const q = `${w.artist} - ${w.title}${w.featuring?.length ? ` feat. ${w.featuring.join(', ')}` : ''}`;
      const r = await run(config.ytdlpPath, [`${prefix}8:${q}`, '--flat-playlist', '--dump-single-json', '--no-warnings', '--ignore-errors']);
      const i = r.stdout.indexOf('{');
      if (i < 0) return [];
      let parsed: any;
      try { parsed = JSON.parse(r.stdout.slice(i)); } catch { return []; }
      return ((parsed.entries ?? []) as any[]).filter(Boolean).map((e): SourceCandidate => ({
        source: name, id: e.id, title: e.title ?? '', duration: e.duration ?? null, channel: e.channel ?? e.uploader ?? null, uploader: e.uploader ?? null, url: e.url ?? e.webpage_url,
        quality: name === 'soundcloud' ? { codec: 'mp3/opus', bitrate: 128 } : { codec: 'opus/aac', bitrate: 160 },
      }));
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
