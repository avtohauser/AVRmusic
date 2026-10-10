// Moving a library here from Spotify, Yandex Music or a list (see services/transfer.ts).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { enqueue } from '../services/jobs.js';
import { parseList, parseVkPage, setSpotifyApp, spotifyApp, spotifyAuthorizeUrl, spotifyCallback, yandexLoginPoll, yandexLoginStart } from '../services/transfer.js';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** A small page for the browser after the Spotify sign-in. */
const page = (title: string, text: string) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;background:#141218;color:#e6e0e9;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
main{max-width:420px;padding:32px;text-align:center}h1{font-size:28px}p{color:#cac4d0;line-height:1.5}a{display:inline-block;margin-top:16px;padding:14px 24px;border-radius:999px;background:#d0bcff;color:#381e72;text-decoration:none;font-weight:600}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(text)}</p><a href="https://music.avthsr.space/jobs">Открыть AVRmusic</a></main></body></html>`;

export default async function transferRoutes(app: FastifyInstance) {
  const db = app.db;
  const auth = { preHandler: app.authenticate };

  const mayAcquire = (req: FastifyRequest) => {
    if (config.acquireRole === 'off' || (config.acquireRole === 'admin' && req.userRole !== 'admin')) return false;
    return req.userRole === 'admin' || (db.prepare('SELECT can_acquire FROM users WHERE id = ?').get(req.userId) as any)?.can_acquire !== 0;
  };
  const redirectUri = (req: FastifyRequest) => {
    const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'music.avthsr.space';
    const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
    return `${proto}://${host}/api/transfer/spotify/callback`;
  };

  app.get('/api/transfer/status', auth, async () => ({ spotify: !!spotifyApp(db) }));

  /* ---------- Spotify ---------- */

  app.get('/api/transfer/spotify/start', auth, async (req) => {
    try { return { url: spotifyAuthorizeUrl(db, req.userId!, redirectUri(req)) }; } catch (e: any) { throw badRequest(e.message); }
  });

  app.get('/api/transfer/spotify/callback', async (req, reply) => {
    const q = req.query as any;
    reply.type('text/html; charset=utf-8');
    if (q.error || !q.code || !q.state) return page('Перенос отменён', 'Spotify не дал доступ. Можно попробовать ещё раз из приложения.');
    try {
      const { payload } = await spotifyCallback(db, String(q.code), String(q.state));
      const role = (db.prepare('SELECT role FROM users WHERE id = ?').get(payload.userId) as any)?.role ?? 'user';
      const canAcquire = config.acquireRole !== 'off' && (config.acquireRole !== 'admin' || role === 'admin')
        && (role === 'admin' || (db.prepare('SELECT can_acquire FROM users WHERE id = ?').get(payload.userId) as any)?.can_acquire !== 0);
      enqueue({ kind: 'acquire', title: 'Перенос из Spotify', requestedBy: payload.userId }, { ...payload, canAcquire });
      const n = (payload.liked?.length ?? 0) + (payload.playlists ?? []).reduce((s, p) => s + p.tracks.length, 0);
      return page('Перенос начат', `Нашёл ${payload.liked?.length ?? 0} любимых треков, ${payload.playlists?.length ?? 0} плейлистов (всего ${n} треков) и ${payload.artists?.length ?? 0} исполнителей. Всё переедет само — ход видно в «Загрузках на сервер». Можно вернуться в приложение.`);
    } catch (e: any) {
      return page('Не получилось', e?.message ?? 'Что-то пошло не так');
    }
  });

  app.get('/api/admin/spotify', { preHandler: app.requireAdmin }, async (req) => {
    const a = spotifyApp(db);
    const id = (db.prepare("SELECT value FROM app_meta WHERE key = 'spotify.client_id'").get() as any)?.value ?? '';
    return { clientId: id, hasSecret: !!a, redirectUri: redirectUri(req) };
  });

  app.put('/api/admin/spotify', { preHandler: app.requireAdmin }, async (req) => {
    const b = z.object({ clientId: z.string().trim().min(10).max(100), secret: z.string().trim().max(100).optional() }).parse(req.body ?? {});
    if (!b.secret && !spotifyApp(db)) throw badRequest('Нужен и Client Secret');
    setSpotifyApp(db, b.clientId, b.secret || null);
    return { ok: true };
  });

  /* ---------- Yandex Music: a sign-in code, then the app sends the lists ---------- */

  app.post('/api/transfer/yandex/login', auth, async (req) => {
    try { return await yandexLoginStart(req.userId!); } catch (e: any) { throw badRequest(e.message); }
  });

  app.get('/api/transfer/yandex/login/:id', auth, async (req) => {
    try { return await yandexLoginPoll((req.params as any).id, req.userId!); } catch (e: any) { throw badRequest(e.message); }
  });

  /** A library the listener's app read from another service: likes, playlists, artists, albums. */
  const track = z.object({ title: z.string().trim().min(1).max(300), artist: z.string().trim().min(1).max(300), durationSec: z.number().nullish(), isrc: z.string().max(20).nullish() });
  app.post('/api/transfer/import', { ...auth, bodyLimit: 32 * 1024 * 1024 }, async (req) => {
    const b = z.object({
      source: z.enum(['yandex']),
      liked: z.array(track).max(50_000).default([]),
      playlists: z.array(z.object({ title: z.string().trim().max(120).default(''), tracks: z.array(track).max(20_000) })).max(1000).default([]),
      artists: z.array(z.string().trim().min(1).max(300)).max(5000).default([]),
      albums: z.array(z.object({ title: z.string().trim().min(1).max(300), artist: z.string().trim().max(300).default('') })).max(5000).default([]),
    }).parse(req.body ?? {});
    const playlists = b.playlists.filter((p) => p.tracks.length).map((p) => ({ title: p.title || 'Яндекс Музыка', tracks: p.tracks }));
    if (!b.liked.length && !playlists.length && !b.artists.length && !b.albums.length) throw badRequest('Нечего переносить');
    const job = enqueue({ kind: 'acquire', title: 'Перенос из Яндекс Музыки', requestedBy: req.userId }, {
      kind: 'transfer', source: b.source, userId: req.userId, canAcquire: mayAcquire(req), liked: b.liked, playlists, artists: b.artists, albums: b.albums,
    });
    return { jobId: job.id, liked: b.liked.length, playlists: playlists.length, artists: b.artists.length, albums: b.albums.length };
  });

  /* ---------- VK Music: pages the listener saved from the browser ---------- */

  app.post('/api/transfer/vk', { ...auth, bodyLimit: 96 * 1024 * 1024 }, async (req) => {
    const b = z.object({ pages: z.array(z.object({ name: z.string().max(300).default(''), content: z.string().min(1).max(40_000_000) })).min(1).max(50) }).parse(req.body ?? {});
    const liked: Array<{ title: string; artist: string; durationSec?: number | null }> = [];
    const playlists: Array<{ title: string; tracks: typeof liked }> = [];
    const empty: string[] = [];
    for (const page of b.pages) {
      const v = parseVkPage(page.content, page.name);
      if (!v.tracks.length) { empty.push(page.name || v.title || 'страница'); continue; }
      if (v.mine) liked.push(...v.tracks);
      else playlists.push({ title: (v.title || 'ВК Музыка').slice(0, 120), tracks: v.tracks });
    }
    if (!liked.length && !playlists.length) {
      throw badRequest('Не нашёл треков на странице. Откройте «Музыку» во ВКонтакте на компьютере, прокрутите список до самого конца и сохраните страницу (Ctrl+S, «Веб-страница полностью»)');
    }
    const job = enqueue({ kind: 'acquire', title: 'Перенос из ВК Музыки', requestedBy: req.userId }, {
      kind: 'transfer', source: 'vk', userId: req.userId, canAcquire: mayAcquire(req), liked, playlists,
    });
    return { jobId: job.id, liked: liked.length, playlists: playlists.map((p) => ({ title: p.title, tracks: p.tracks.length })), empty };
  });

  /* ---------- a list or a CSV ---------- */

  app.post('/api/transfer/list', auth, async (req) => {
    const b = z.object({ text: z.string().min(3).max(2_000_000), target: z.enum(['likes', 'playlist']).default('playlist'), title: z.string().trim().max(120).default('Перенесённый плейлист') }).parse(req.body ?? {});
    const tracks = parseList(b.text);
    if (!tracks.length) throw badRequest('Не нашёл ни одного трека: нужны строки «Исполнитель — Название» или CSV с колонками трека и исполнителя');
    const data = b.target === 'likes' ? { liked: tracks } : { playlists: [{ title: b.title || 'Перенесённый плейлист', tracks }] };
    const job = enqueue({ kind: 'acquire', title: b.target === 'likes' ? 'Перенос любимых треков' : `Перенос: ${b.title}`, requestedBy: req.userId }, { kind: 'transfer', source: 'list', userId: req.userId, canAcquire: mayAcquire(req), ...data });
    return { jobId: job.id, tracks: tracks.length };
  });
}
