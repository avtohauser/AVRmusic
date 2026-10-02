import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Lyrics } from '@avrmusic/shared';
import { notFound } from '../lib/errors.js';
import { parseLrc } from '../lib/lyrics.js';
import { clamp, parseIntSafe } from '../lib/util.js';
import { getAlbum, getArtist, getGenre, getTrack, getTrackRaw, getTracksByIds, listAlbums, listArtists, listGenres, listTracks, trackRadio } from '../services/library.js';
import { homeFeed } from '../services/home.js';
import { search, suggest } from '../services/search.js';

export default async function libraryRoutes(app: FastifyInstance) {
  const db = app.db;
  const guard = { preHandler: app.libraryAuth };

  // the feed is a dozen queries with random picks: kept per listener for 45 s, so reopening the app is instant
  const feeds = new Map<string, { at: number; feed: ReturnType<typeof homeFeed> }>();
  app.get('/api/home', guard, async (req) => {
    const key = req.userId ?? '';
    const hit = feeds.get(key);
    if (hit && Date.now() - hit.at < 45_000) return hit.feed;
    const feed = homeFeed(db, req.userId);
    feeds.set(key, { at: Date.now(), feed });
    return feed;
  });

  app.get('/api/search', guard, async (req) => {
    const q = z.object({ q: z.string().default(''), type: z.enum(['all', 'track', 'album', 'artist', 'playlist']).default('all'), limit: z.string().optional() }).parse(req.query);
    return search(db, q.q, req.userId, { type: q.type, limit: clamp(parseIntSafe(q.limit, 10), 1, 100) });
  });

  app.get('/api/search/suggest', guard, async (req) => {
    const q = z.object({ q: z.string().default('') }).parse(req.query);
    return suggest(db, q.q);
  });

  app.get('/api/tracks', guard, async (req) => {
    const q = req.query as any;
    if (q.ids) return getTracksByIds(db, String(q.ids).split(',').filter(Boolean).slice(0, 200), req.userId);
    return listTracks(db, { offset: parseIntSafe(q.offset, 0), limit: clamp(parseIntSafe(q.limit, 50), 1, 200), sort: q.sort }, req.userId);
  });

  app.get('/api/tracks/:id', guard, async (req) => {
    const t = getTrack(db, (req.params as any).id, req.userId);
    if (!t) throw notFound('Трек не найден');
    return t;
  });

  app.get('/api/tracks/:id/lyrics', guard, async (req): Promise<Lyrics> => {
    const r = getTrackRaw(db, (req.params as any).id);
    if (!r) throw notFound('Трек не найден');
    return { trackId: r.id, plain: r.lyrics_plain, synced: r.lyrics_synced ? parseLrc(r.lyrics_synced) : null, source: r.lyrics_source };
  });

  app.get('/api/tracks/:id/radio', guard, async (req) => trackRadio(db, (req.params as any).id, req.userId));

  app.get('/api/albums', guard, async (req) => {
    const q = req.query as any;
    return listAlbums(db, { offset: parseIntSafe(q.offset, 0), limit: clamp(parseIntSafe(q.limit, 50), 1, 200), sort: q.sort, artistId: q.artistId, type: q.type });
  });

  app.get('/api/albums/:id', guard, async (req) => {
    const a = getAlbum(db, (req.params as any).id, req.userId);
    if (!a) throw notFound('Альбом не найден');
    return a;
  });

  app.get('/api/artists', guard, async (req) => {
    const q = req.query as any;
    return listArtists(db, { offset: parseIntSafe(q.offset, 0), limit: clamp(parseIntSafe(q.limit, 50), 1, 200), sort: q.sort });
  });

  app.get('/api/artists/:id', guard, async (req) => {
    const a = getArtist(db, (req.params as any).id, req.userId);
    if (!a) throw notFound('Исполнитель не найден');
    return a;
  });

  app.get('/api/genres', guard, async () => listGenres(db));

  app.get('/api/genres/:slug', guard, async (req) => {
    const g = getGenre(db, (req.params as any).slug, req.userId);
    if (!g) throw notFound('Жанр не найден');
    return g;
  });
}
