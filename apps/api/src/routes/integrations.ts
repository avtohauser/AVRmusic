// The outside services: the Telegram bot, Last.fm, concerts in the listener's city; and the admin's
// nightly copies of the database.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { setTelegramToken, telegramBot, telegramLink, telegramLinkUrl, unlinkTelegram } from '../services/telegram.js';
import { lastfmApp, lastfmAuthUrl, lastfmCallback, lastfmLink, setLastfmApp, unlinkLastfm } from '../services/lastfm.js';
import { checkCitySoon, concertCities, concertsOf } from '../services/concerts.js';
import { backupNow, listBackups } from '../services/backup.js';
import { getMeta } from '../services/meta.js';

const page = (title: string, text: string) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B4248;color:#E6F4F1;font:16px system-ui,sans-serif}
main{max-width:420px;padding:24px;text-align:center}h1{font-weight:500}</style></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;
const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default async function integrationRoutes(app: FastifyInstance) {
  const db = app.db;
  const auth = { preHandler: app.authenticate };
  const admin = { preHandler: app.requireAdmin };

  /** What the listener has connected (and what the admin made available). */
  app.get('/api/me/integrations', auth, async (req) => ({
    telegram: { available: !!telegramBot(db), bot: telegramBot(db), linked: telegramLink(db, req.userId!) },
    lastfm: { available: !!lastfmApp(db), linked: lastfmLink(db, req.userId!) },
    city: (db.prepare('SELECT city FROM users WHERE id = ?').get(req.userId!) as any)?.city ?? null,
  }));

  /* ---------- Telegram ---------- */

  app.post('/api/me/telegram/link', auth, async (req) => {
    try { return { url: telegramLinkUrl(db, req.userId!) }; } catch (e: any) { throw badRequest(e.message); }
  });
  app.delete('/api/me/telegram', auth, async (req) => { unlinkTelegram(db, req.userId!); return { ok: true }; });

  app.get('/api/admin/telegram', admin, async () => ({ configured: !!getMeta(db, 'telegram.token'), bot: telegramBot(db) }));
  app.put('/api/admin/telegram', admin, async (req) => {
    const b = z.object({ token: z.string().trim().regex(/^\d+:[\w-]{30,}$/, 'Это не похоже на токен от @BotFather').nullable() }).parse(req.body ?? {});
    try { return await setTelegramToken(db, b.token); } catch (e: any) { throw badRequest(`Telegram не принял токен: ${e.message}`); }
  });

  /* ---------- Last.fm ---------- */

  app.get('/api/me/lastfm/start', auth, async (req) => {
    try { return { url: lastfmAuthUrl(db, req.userId!) }; } catch (e: any) { throw badRequest(e.message); }
  });
  app.delete('/api/me/lastfm', auth, async (req) => { unlinkLastfm(db, req.userId!); return { ok: true }; });

  app.get('/api/lastfm/callback', async (req, reply) => {
    const q = req.query as any;
    reply.type('text/html; charset=utf-8');
    if (!q.token || !q.s) return page('Не подключено', 'Last.fm не дал доступ. Можно попробовать ещё раз из приложения.');
    try {
      const name = await lastfmCallback(db, String(q.token), String(q.s));
      return page('Last.fm подключён', `Всё, что вы слушаете, теперь уходит в профиль <b>${html(name)}</b>. Можно вернуться в приложение.`);
    } catch (e: any) {
      return page('Не получилось', html(e?.message ?? 'Что-то пошло не так'));
    }
  });

  app.get('/api/admin/lastfm', admin, async () => ({ key: getMeta(db, 'lastfm.key') ?? '', hasSecret: !!lastfmApp(db) }));
  app.put('/api/admin/lastfm', admin, async (req) => {
    const b = z.object({ key: z.string().trim().regex(/^[0-9a-f]{32}$/i, 'API key — 32 символа'), secret: z.string().trim().regex(/^[0-9a-f]{32}$/i, 'Shared secret — 32 символа').optional().or(z.literal('')) }).parse(req.body ?? {});
    if (!b.secret && !lastfmApp(db)) throw badRequest('Нужен и Shared secret');
    setLastfmApp(db, b.key, b.secret || null);
    return { ok: true };
  });

  /* ---------- concerts ---------- */

  app.get('/api/concerts/cities', auth, async () => concertCities());

  app.put('/api/me/city', auth, async (req) => {
    const b = z.object({ city: z.string().trim().regex(/^[a-z0-9-]{2,40}$/).nullable() }).parse(req.body ?? {});
    db.prepare('UPDATE users SET city = ? WHERE id = ?').run(b.city, req.userId!);
    if (b.city && !concertsOf(db, req.userId!)) checkCitySoon(db, b.city);
    return { city: b.city };
  });

  /** Upcoming concerts of the listener's artists in their city (checked weekly; the first time — now). */
  app.get('/api/me/concerts', auth, async (req) => {
    const city = (db.prepare('SELECT city FROM users WHERE id = ?').get(req.userId!) as any)?.city ?? null;
    const c = concertsOf(db, req.userId!);
    if (city && !c) checkCitySoon(db, city);
    return { city, checkedAt: c?.at ?? null, concerts: c?.list ?? [] };
  });

  /* ---------- backups ---------- */

  app.get('/api/admin/backups', admin, async () => ({ last: getMeta(db, 'backup.last'), files: listBackups() }));
  app.post('/api/admin/backups', admin, async () => {
    try { return await backupNow(db); } catch (e: any) { throw badRequest(e.message); }
  });
}
