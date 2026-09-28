import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { forbidden, notFound } from '../lib/errors.js';
import { catalogAlbum, catalogArtist, catalogTrack, rawAlbum, rawArtist, rawTrack, searchCatalog } from '../services/catalog.js';
import { enqueue, getJob, listJobs, removeJob } from '../services/jobs.js';
import { clamp, parseIntSafe } from '../lib/util.js';
import { enqueueCanvasJob } from '../services/canvas.js';

export default async function catalogRoutes(app: FastifyInstance) {
  const db = app.db;
  const guard = { preHandler: app.libraryAuth };
  const enabled = async () => { if (!config.catalogEnabled) throw notFound('Каталог отключён'); };

  app.get('/api/catalog/search', guard, async (req) => {
    await enabled();
    const q = z.object({ q: z.string().default(''), limit: z.string().optional() }).parse(req.query);
    return searchCatalog(db, q.q, clamp(parseIntSafe(q.limit, 10), 1, 50));
  });
  app.get('/api/catalog/artists/:id', guard, async (req) => { await enabled(); return catalogArtist(db, Number((req.params as any).id)); });
  app.get('/api/catalog/albums/:id', guard, async (req) => { await enabled(); return catalogAlbum(db, Number((req.params as any).id)); });
  app.get('/api/catalog/tracks/:id', guard, async (req) => { await enabled(); const { raw: _r, ...t } = await catalogTrack(db, Number((req.params as any).id)); return t; });

  const canAcquire = async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (config.acquireRole === 'off') throw forbidden('Загрузка из каталога отключена');
    if (config.acquireRole === 'admin' && req.userRole !== 'admin') throw forbidden('Только администратор может добавлять треки из каталога');
  };

  app.post('/api/catalog/acquire', { preHandler: canAcquire }, async (req) => {
    const body = z.object({ kind: z.enum(['track', 'album', 'artist']), id: z.number().int().positive() }).parse(req.body);
    let title = '';
    if (body.kind === 'track') { const t = await rawTrack(db, body.id); title = `${t.artist?.name ?? ''} — ${t.title}`; }
    else if (body.kind === 'album') { const a = await rawAlbum(db, body.id); title = `${a.artist?.name ?? ''} — ${a.title} (альбом)`; }
    else { const a = await rawArtist(db, body.id); title = `${a.name} — дискография`; }
    const dup = listJobs().find((j) => j.kind === 'acquire' && (j.status === 'queued' || j.status === 'running') && j.title === title);
    if (dup) return { jobId: dup.id, job: dup, duplicate: true };
    const job = enqueue({ kind: 'acquire', title, requestedBy: req.userId }, { kind: body.kind, id: body.id });
    return { jobId: job.id, job };
  });

  /** Users with acquire rights can ask for a canvas (slice of the official clip) for any library track. */
  app.post('/api/tracks/:id/canvas/fetch', { preHandler: canAcquire }, async (req) => {
    const id = (req.params as any).id;
    const t = db.prepare('SELECT t.title, a.name AS artist FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE t.id = ?').get(id) as any;
    if (!t) throw notFound('Трек не найден');
    const title = `Канвас: ${t.artist} — ${t.title}`;
    const dup = listJobs().find((j) => j.kind === 'canvas' && (j.status === 'queued' || j.status === 'running') && j.title === title);
    if (dup) return { jobId: dup.id, job: dup, duplicate: true };
    const job = enqueueCanvasJob(db, [id], title, { force: true, requestedBy: req.userId });
    return { jobId: job.id, job };
  });

  app.get('/api/catalog/jobs', { preHandler: app.authenticate }, async () => listJobs().filter((j) => j.kind === 'acquire' || j.kind === 'canvas'));
  app.delete('/api/catalog/jobs/:id', { preHandler: app.authenticate }, async (req) => {
    const j = getJob((req.params as any).id);
    if (!j) throw notFound('Задача не найдена');
    if (j.requestedBy !== req.userId && req.userRole !== 'admin') throw forbidden();
    removeJob(j.id);
    return { ok: true };
  });
}
