// Badges, the servers' state for the admin, spare YouTube accounts friends give for faster downloads,
// and the automatic fetching of loved artists' discographies.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../lib/errors.js';
import { allBadges, badgesOf, giveBadge, holdersOf, saveBadge, takeBadge } from '../services/badges.js';
import { serverStats } from '../services/serverStats.js';
import { addAccount, listAccounts, MAX_GIVEN, removeAccount } from '../services/youtubeAccounts.js';
import { autofetchOn, lovedArtists } from '../services/autofetch.js';
import { getMeta, setMeta } from '../services/meta.js';
import { friendRef } from '../services/social.js';
import { rawAlbum } from '../services/catalog.js';
import { nameKey } from '../lib/util.js';

export default async function extraRoutes(app: FastifyInstance) {
  const db = app.db;
  const auth = { preHandler: app.authenticate };
  const admin = { preHandler: app.requireAdmin };

  /* ---------- badges ---------- */

  app.get('/api/badges', auth, async () => allBadges(db));
  app.get('/api/me/badges', auth, async (req) => badgesOf(db, req.userId!));

  const badgeBody = z.object({
    title: z.string().trim().min(1).max(40),
    emoji: z.string().trim().min(1).max(16),
    color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default('#F2A0C4'),
    description: z.string().trim().max(200).default(''),
  });
  app.post('/api/admin/badges', admin, async (req) => saveBadge(db, null, badgeBody.parse(req.body ?? {})));
  app.put('/api/admin/badges/:id', admin, async (req) => {
    const id = (req.params as any).id as string;
    if (!db.prepare('SELECT 1 FROM badges WHERE id = ?').get(id)) throw notFound('Ачивка не найдена');
    return saveBadge(db, id, badgeBody.parse(req.body ?? {}));
  });
  app.delete('/api/admin/badges/:id', admin, async (req) => { db.prepare('DELETE FROM badges WHERE id = ?').run((req.params as any).id); return { ok: true }; });
  /** Who has it (to give it to more people or take it back). */
  app.get('/api/admin/badges/:id/holders', admin, async (req) => holdersOf(db, (req.params as any).id).map((u) => friendRef(db, u)).filter(Boolean));
  app.post('/api/admin/badges/:id/give', admin, async (req) => {
    const id = (req.params as any).id as string;
    const { userIds } = z.object({ userIds: z.array(z.string()).min(1).max(50) }).parse(req.body ?? {});
    if (!db.prepare('SELECT 1 FROM badges WHERE id = ?').get(id)) throw notFound('Ачивка не найдена');
    let given = 0;
    for (const u of userIds) if (db.prepare('SELECT 1 FROM users WHERE id = ?').get(u) && giveBadge(db, id, u, req.userId!)) given++;
    return { given };
  });
  app.delete('/api/admin/badges/:id/give/:userId', admin, async (req) => {
    const p = req.params as any;
    takeBadge(db, p.id, p.userId);
    return { ok: true };
  });

  /* ---------- is a library album whole? ---------- */

  /** The album's tracks in the catalogue against the ones on the server: what is missing (to fetch it). */
  app.get('/api/albums/:id/completeness', auth, async (req) => {
    const al = db.prepare('SELECT id, deezer_id FROM albums WHERE id = ?').get((req.params as any).id) as any;
    if (!al) throw notFound('Альбом не найден');
    if (!al.deezer_id) return { checkable: false, total: 0, have: 0, missing: [], deezerId: null };
    let raw: any;
    try { raw = await rawAlbum(db, Number(al.deezer_id)); } catch (e: any) { throw badRequest(`Каталог не ответил: ${e?.message ?? e}`); }
    const want = ((raw.tracks?.data ?? []) as any[]).map((t) => ({ id: Number(t.id), title: String(t.title ?? ''), duration: Number(t.duration ?? 0) }));
    const mine = db.prepare('SELECT deezer_id, title, duration_ms FROM tracks WHERE album_id = ?').all(al.id) as any[];
    const byId = new Set(mine.map((t) => Number(t.deezer_id)).filter(Boolean));
    const byTitle = new Set(mine.map((t) => nameKey(t.title)));
    // the same recording may sit on the server under another catalogue id (a single, a re-release)
    const elsewhere = db.prepare('SELECT 1 FROM tracks WHERE deezer_id = ?');
    const missing = want.filter((t) => !byId.has(t.id) && !byTitle.has(nameKey(t.title)) && !elsewhere.get(t.id));
    return { checkable: true, total: want.length, have: want.length - missing.length, missing: missing.map((t) => ({ id: t.id, title: t.title })), deezerId: Number(al.deezer_id) };
  });

  /* ---------- the servers' state ---------- */

  app.get('/api/admin/server', admin, async () => serverStats(db));

  /* ---------- spare YouTube accounts from friends ---------- */

  const given = (userId: string) => listAccounts().filter((a) => a.owner === userId);
  app.get('/api/me/youtube-accounts', auth, async (req) => ({ max: MAX_GIVEN, accounts: given(req.userId!) }));
  app.post('/api/me/youtube-accounts', auth, async (req) => {
    const file = await req.file();
    if (!file) throw badRequest('Файл не передан');
    const buf = await file.toBuffer();
    if (buf.length > 512 * 1024) throw badRequest('Слишком большой файл');
    const name = (db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.userId!) as any)?.display_name ?? '';
    addAccount(buf.toString('utf8'), `От ${name}`, req.userId!);
    return { max: MAX_GIVEN, accounts: given(req.userId!) };
  });
  app.delete('/api/me/youtube-accounts/:id', auth, async (req) => {
    const id = (req.params as any).id as string;
    if (!given(req.userId!).some((a) => a.id === id)) throw notFound('Аккаунт не найден');
    removeAccount(id);
    return { max: MAX_GIVEN, accounts: given(req.userId!) };
  });

  /* ---------- loved artists' discographies, fetched by themselves ---------- */

  app.get('/api/admin/autofetch', admin, async () => ({
    on: autofetchOn(db),
    next: lovedArtists(db).filter((a) => Date.now() - Number(getMeta(db, `autofetch.a.${a.deezerId}`) ?? 0) > 45 * 86400_000).slice(0, 8).map((a) => a.name),
  }));
  app.put('/api/admin/autofetch', admin, async (req) => {
    const { on } = z.object({ on: z.boolean() }).parse(req.body ?? {});
    setMeta(db, 'autofetch.off', on ? null : '1');
    return { on: autofetchOn(db) };
  });
}
