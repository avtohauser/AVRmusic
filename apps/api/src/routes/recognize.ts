// "What's playing?": a few seconds recorded by the phone are recognised (Shazam's matching through the
// shazamio library on the server) and found in the catalogue, ready to be played or fetched.
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { badRequest, notFound } from '../lib/errors.js';
import { newId } from '../lib/util.js';
import { config } from '../config.js';
import { mapRawTracks, rawSearchTracks } from '../services/catalog.js';

const SCRIPT = `
import asyncio, json, sys
from shazamio import Shazam

async def main():
    s = Shazam()
    try:
        out = await s.recognize(sys.argv[1])
    except AttributeError:
        out = await s.recognize_song(sys.argv[1])
    t = (out or {}).get('track') or {}
    print(json.dumps({'title': t.get('title'), 'artist': t.get('subtitle'), 'cover': (t.get('images') or {}).get('coverart'), 'isrc': t.get('isrc')}))

asyncio.run(main())
`;

function run(bin: string, args: string[], timeoutMs: number): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, out, err }); });
  });
}

export default async function recognizeRoutes(app: FastifyInstance) {
  const db = app.db;
  const script = path.join(config.tmpDir, 'recognize.py');

  app.post('/api/recognize', { preHandler: app.authenticate, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const file = await req.file();
    if (!file) throw badRequest('Нет записи');
    fs.mkdirSync(config.tmpDir, { recursive: true });
    if (!fs.existsSync(script)) fs.writeFileSync(script, SCRIPT);
    const id = newId();
    const raw = path.join(config.tmpDir, `rec-${id}${path.extname(file.filename || '') || '.m4a'}`);
    const wav = path.join(config.tmpDir, `rec-${id}.wav`);
    try {
      await pipeline(file.file, fs.createWriteStream(raw));
      // any phone format → plain WAV, what the matcher reads best
      const ff = await run(config.ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-t', '15', '-ac', '1', '-ar', '16000', wav], 30_000);
      if (ff.code !== 0) throw badRequest('Не удалось прочитать запись');
      const r = await run('python3', [script, wav], 30_000);
      if (r.code !== 0) { req.log.warn({ err: r.err }, 'recognition failed'); throw new Error('Распознавание недоступно на сервере'); }
      let found: any = {};
      try { found = JSON.parse(r.out.trim().split('\n').pop() ?? '{}'); } catch { /* nothing recognised */ }
      if (!found.title) throw notFound('Не узнал эту песню — попробуйте поближе к звуку');
      const raws = await rawSearchTracks(db, `${found.artist ?? ''} ${found.title}`.trim(), 8).catch(() => [] as any[]);
      return { title: found.title, artist: found.artist ?? '', coverUrl: found.cover ?? null, isrc: found.isrc ?? null, catalog: mapRawTracks(db, raws) };
    } finally {
      for (const f of [raw, wav]) fs.rm(f, { force: true }, () => {});
    }
  });
}
