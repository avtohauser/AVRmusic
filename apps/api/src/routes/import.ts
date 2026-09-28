import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../lib/errors.js';
import { config } from '../config.js';
import { enqueue, listJobs, removeJob } from '../services/jobs.js';
import { capabilities, runUrlImport } from '../services/ytdlp.js';
import { fetchLyricsForTrack } from '../services/lrclib.js';
import { getTrack } from '../services/library.js';

export default async function importRoutes(app: FastifyInstance) {
  const db = app.db;
  const admin = { preHandler: app.requireAdmin };

  app.get('/api/admin/import/capabilities', admin, async () => {
    const caps = await capabilities();
    const { allSources } = await import('../services/sources/index.js');
    const enabled = new Set(config.acquireSources as string[]);
    const sources = await Promise.all(allSources().map(async (s) => { const a = await s.available(); return { name: s.name, label: s.label, enabled: enabled.has(s.name), ok: a.ok, reason: a.reason }; }));
    return { ...caps, sources };
  });
  app.get('/api/admin/import/jobs', admin, async () => listJobs());
  app.delete('/api/admin/import/jobs/:id', admin, async (req) => { if (!removeJob((req.params as any).id)) throw notFound('Задача не найдена'); return { ok: true }; });

  app.post('/api/admin/import/url', admin, async (req) => {
    const body = z.object({ url: z.string().url(), mode: z.enum(['audio', 'video']).default('audio'), artist: z.string().max(200).optional(), album: z.string().max(200).optional(), genre: z.string().max(60).optional() }).parse(req.body);
    if (!/^https?:\/\//i.test(body.url)) throw badRequest('Ожидается http(s) ссылка');
    const job = enqueue({ kind: 'url', url: body.url, mode: body.mode }, (j, api) => runUrlImport(db, j, body, api));
    return { jobId: job.id, job };
  });

  app.post('/api/admin/tracks/:id/lyrics/fetch', admin, async (req) => {
    const id = (req.params as any).id;
    if (!db.prepare('SELECT 1 FROM tracks WHERE id = ?').get(id)) throw notFound('Трек не найден');
    const found = await fetchLyricsForTrack(db, id);
    if (!found) throw notFound('Текст не найден в LRCLIB');
    return getTrack(db, id, req.userId);
  });

  /** Batch: look up lyrics for every track that has none. */
  app.post('/api/admin/lyrics/fetch-missing', admin, async () => {
    const job = enqueue({ kind: 'lyrics' }, async (j, api) => {
      const ids = (db.prepare(`SELECT id FROM tracks WHERE lyrics_synced IS NULL AND lyrics_plain IS NULL AND codec <> 'video' OR (lyrics_synced IS NULL AND lyrics_plain IS NULL AND codec IS NULL)`).all() as any[]).map((r) => r.id);
      j.stats = { missing: ids.length, found: 0, checked: 0 };
      let cancelled = false;
      api.onCancel(() => { cancelled = true; });
      for (const id of ids) {
        if (cancelled) throw new Error('Отменено');
        try {
          if (await fetchLyricsForTrack(db, id)) { j.stats.found++; const t = getTrack(db, id); if (t) api.log(`✓ ${t.artist.name} — ${t.title}`); }
        } catch (e: any) { api.log(`! ${id}: ${e?.message ?? e}`); }
        j.stats.checked++;
        api.progress((j.stats.checked / Math.max(1, ids.length)) * 100);
        await new Promise((r) => setTimeout(r, 250)); // be polite to the public API
      }
    });
    return { jobId: job.id, job };
  });
}
