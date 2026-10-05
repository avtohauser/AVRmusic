import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { catalogAlbum, catalogArtist, catalogTrack, rawAlbum, rawArtist, rawTrack, searchCatalog } from '../services/catalog.js';
import { enqueue, findJob, getJob, listJobs, removeJob } from '../services/jobs.js';
import { clamp, parseIntSafe } from '../lib/util.js';
import { enqueueCanvasJob } from '../services/canvas.js';
import { Readable } from 'node:stream';
import { getTrack } from '../services/library.js';
import { forgetLive, liveSource } from '../services/live.js';

export default async function catalogRoutes(app: FastifyInstance) {
  const db = app.db;
  const guard = { preHandler: app.libraryAuth };
  const enabled = async () => { if (!config.catalogEnabled) throw notFound('Каталог отключён'); };

  app.get('/api/catalog/search', guard, async (req) => {
    await enabled();
    const q = z.object({ q: z.string().default(''), limit: z.string().optional() }).parse(req.query);
    return searchCatalog(db, q.q, clamp(parseIntSafe(q.limit, 10), 1, 50));
  });
  app.get('/api/catalog/artists/:id', guard, async (req) => {
    await enabled();
    const id = Number((req.params as any).id);
    const page = await catalogArtist(db, id);
    // is this listener following the artist's new releases
    const following = !!req.userId && !!(db.prepare('SELECT 1 FROM artist_follows WHERE user_id = ? AND deezer_artist_id = ?').get(req.userId, id)
      || db.prepare("SELECT 1 FROM likes l JOIN artists a ON a.id = l.entity_id WHERE l.user_id = ? AND l.entity_type = 'artist' AND a.deezer_id = ?").get(req.userId, id));
    return { ...page, following };
  });
  app.get('/api/catalog/albums/:id', guard, async (req) => { await enabled(); return catalogAlbum(db, Number((req.params as any).id)); });
  app.get('/api/catalog/tracks/:id', guard, async (req) => { await enabled(); const { raw: _r, ...t } = await catalogTrack(db, Number((req.params as any).id)); return t; });

  const canAcquire = async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (config.acquireRole === 'off') throw forbidden('Загрузка из каталога отключена');
    if (config.acquireRole === 'admin' && req.userRole !== 'admin') throw forbidden('Только администратор может добавлять треки из каталога');
    if (req.userRole !== 'admin' && (app.db.prepare('SELECT can_acquire FROM users WHERE id = ?').get(req.userId) as any)?.can_acquire === 0) throw forbidden('Администратор отключил вам добавление треков на сервер');
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

  /* ---------- instant play: a catalogue song plays in full at once, and is fetched meanwhile ---------- */

  const mayAcquire = (userId: string, role: string) => {
    if (config.acquireRole === 'off' || (config.acquireRole === 'admin' && role !== 'admin')) return false;
    return role === 'admin' || (db.prepare('SELECT can_acquire FROM users WHERE id = ?').get(userId) as any)?.can_acquire !== 0;
  };
  const libraryId = (deezerId: number) => (db.prepare('SELECT id FROM tracks WHERE deezer_id = ?').get(deezerId) as any)?.id as string | undefined;
  /** the fetching of this song, if one is queued or running (or finished in the last minutes) */
  const fetchJob = (deezerId: number) => findJob((j) => j.kind === 'acquire' && (j.payload as any)?.kind === 'track' && (j.payload as any)?.id === deezerId);

  /** Starts playing a catalogue song: the library's track when it is there, otherwise a live stream ("dz:<id>"). */
  app.post('/api/catalog/play', { preHandler: app.authenticate }, async (req) => {
    await enabled();
    const { id } = z.object({ id: z.number().int().positive() }).parse(req.body ?? {});
    const have = libraryId(id);
    if (have) return { track: getTrack(db, have, req.userId), ready: true };
    const t = await rawTrack(db, id);
    if (mayAcquire(req.userId!, req.userRole!) && !fetchJob(id)) {
      enqueue({ kind: 'acquire', title: `${t.artist?.name ?? ''} — ${t.title}`, requestedBy: req.userId }, { kind: 'track', id, instant: true });
    }
    const contributors = ((t.contributors ?? []) as any[]).filter((c) => c.id !== t.artist?.id).map((c) => ({ id: '', name: c.name, imageUrl: null }));
    return {
      ready: false,
      track: {
        id: `dz:${id}`, title: t.title, durationMs: Number(t.duration ?? 0) * 1000, explicit: !!t.explicit_lyrics,
        coverUrl: t.album?.cover_xl ?? t.album?.cover_big ?? null, mimeType: null,
        artist: { id: '', name: t.artist?.name ?? '', imageUrl: t.artist?.picture_big ?? null }, featuring: contributors,
        album: t.album ? { id: '', title: t.album.title } : null, hasCanvas: false, hasLyrics: false, hasSyncedLyrics: false,
      },
    };
  });

  /** Is the song in the library yet? (the apps then use the library's track for likes, lyrics, reactions) */
  app.get('/api/catalog/play/:id/status', { preHandler: app.authenticate }, async (req) => {
    const id = Number((req.params as any).id);
    const have = libraryId(id);
    if (have) return { status: 'ready', track: getTrack(db, have, req.userId) };
    const j = fetchJob(id);
    return { status: !j ? 'idle' : j.status === 'error' || j.status === 'done' ? 'failed' : 'fetching', job: j ? { status: j.status, progress: j.progress } : null };
  });

  /** The full song, passed through from its source (with seeking) until it is in the library. */
  app.get('/api/catalog/stream/:id', { preHandler: app.mediaAuth }, async (req, reply) => {
    await enabled();
    const id = Number((req.params as any).id);
    const q = req.query as any;
    const have = libraryId(id);
    if (have) return reply.redirect(`/api/stream/${have}?t=${encodeURIComponent(q.t ?? '')}${q.compat ? '&compat=1' : ''}`);
    const aac = q.compat === '1';
    for (let attempt = 0; attempt < 2; attempt++) {
      const src = await liveSource(db, id, aac);
      if (!src) throw notFound('Не нашлось, откуда играть этот трек');
      const abort = new AbortController();
      req.raw.on('close', () => abort.abort());
      const headers: Record<string, string> = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
      if (req.headers.range) headers.range = req.headers.range;
      let up: Response;
      try { up = await fetch(src.url, { headers, signal: abort.signal, redirect: 'follow' }); } catch { forgetLive(id); continue; }
      if (up.status === 403 || up.status === 410 || up.status >= 500) { forgetLive(id); try { await up.body?.cancel(); } catch { /* closed */ } continue; }
      reply.code(up.status === 206 ? 206 : up.ok ? 200 : up.status);
      reply.header('Content-Type', src.mime);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Cache-Control', 'no-store');
      for (const h of ['content-length', 'content-range']) { const v = up.headers.get(h); if (v) reply.header(h, v); }
      if (!up.body) return reply.send();
      return reply.send(Readable.fromWeb(up.body as any));
    }
    throw notFound('Источник не отвечает — попробуйте ещё раз');
  });

  /** A playlist from a Yandex Music or Spotify link: found in the library or fetched, song by song. */
  app.post('/api/import/link', { preHandler: app.authenticate }, async (req) => {
    const body = z.object({ url: z.string().url() }).parse(req.body ?? {});
    if (!/spotify\.com|music\.yandex\./i.test(body.url)) throw badRequest('Поддерживаются ссылки Яндекс Музыки и Spotify');
    let may = config.acquireRole !== 'off' && (config.acquireRole !== 'admin' || req.userRole === 'admin');
    if (may && req.userRole !== 'admin') may = (db.prepare('SELECT can_acquire FROM users WHERE id = ?').get(req.userId) as any)?.can_acquire !== 0;
    const job = enqueue({ kind: 'acquire', title: 'Импорт плейлиста по ссылке', requestedBy: req.userId }, { kind: 'link', url: body.url, userId: req.userId, canAcquire: may });
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
