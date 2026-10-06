import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { badRequest, notFound } from '../lib/errors.js';
import { addTracks, assertCanEdit, assertOwner, createPlaylist, getPlaylist, listPublicPlaylists, listUserPlaylists, removeTrack, reorder, touch } from '../services/playlists.js';
import { newId } from '../lib/util.js';
import { indexPlaylist, removeFromIndex } from '../services/search.js';
import { saveUploadedImage } from '../lib/uploads.js';
import { config } from '../config.js';
import { createBlend, radarOf, refreshAuto } from '../services/blend.js';
import { createSmart, ensureMixes, mixesOf, setSmartRules, smartRulesSchema } from '../services/mixes.js';
import { weeklyChart } from '../services/digest.js';

export default async function playlistRoutes(app: FastifyInstance) {
  const db = app.db;

  app.get('/api/playlists', { preHandler: app.authenticate }, async (req) => listUserPlaylists(db, req.userId!));
  app.get('/api/playlists/public', { preHandler: app.libraryAuth }, async (req) => listPublicPlaylists(db, req.userId, 50));

  app.post('/api/playlists', { preHandler: app.authenticate }, async (req) => {
    const body = z.object({ title: z.string().min(1).max(120), description: z.string().max(500).nullable().optional(), isPublic: z.boolean().optional(), trackIds: z.array(z.string()).optional() }).parse(req.body ?? {});
    const id = createPlaylist(db, req.userId!, body);
    if (body.trackIds?.length) addTracks(db, id, body.trackIds, req.userId!);
    indexPlaylist(db, id);
    return getPlaylist(db, id, req.userId);
  });

  app.get('/api/playlists/:id', { preHandler: app.libraryAuth }, async (req) => {
    const p = getPlaylist(db, (req.params as any).id, req.userId);
    if (!p) throw notFound('Плейлист не найден');
    return p;
  });

  app.patch('/api/playlists/:id', { preHandler: app.authenticate }, async (req) => {
    const id = (req.params as any).id;
    assertCanEdit(db, id, req.userId!, req.userRole!);
    const body = z.object({ title: z.string().min(1).max(120).optional(), description: z.string().max(500).nullable().optional(), isPublic: z.boolean().optional() }).parse(req.body ?? {});
    if (body.title !== undefined) db.prepare('UPDATE playlists SET title = ? WHERE id = ?').run(body.title, id);
    if (body.description !== undefined) db.prepare('UPDATE playlists SET description = ? WHERE id = ?').run(body.description, id);
    if (body.isPublic !== undefined) db.prepare('UPDATE playlists SET is_public = ? WHERE id = ?').run(body.isPublic ? 1 : 0, id);
    touch(db, id);
    indexPlaylist(db, id);
    return getPlaylist(db, id, req.userId);
  });

  app.delete('/api/playlists/:id', { preHandler: app.authenticate }, async (req) => {
    const id = (req.params as any).id;
    const p = assertOwner(db, id, req.userId!, req.userRole!);
    db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    db.prepare(`DELETE FROM likes WHERE entity_type='playlist' AND entity_id=?`).run(id);
    removeFromIndex(db, 'playlist', id);
    if (p.cover_path) { try { fs.unlinkSync(path.join(config.coversDir, p.cover_path)); } catch { /* ignore */ } }
    return { ok: true };
  });

  app.post('/api/playlists/:id/tracks', { preHandler: app.authenticate }, async (req) => {
    const id = (req.params as any).id;
    assertCanEdit(db, id, req.userId!, req.userRole!);
    const body = z.object({ trackIds: z.array(z.string()).min(1).max(500) }).parse(req.body);
    const added = addTracks(db, id, body.trackIds, req.userId!);
    return { added, playlist: getPlaylist(db, id, req.userId) };
  });

  app.delete('/api/playlists/:id/tracks/:trackId', { preHandler: app.authenticate }, async (req) => {
    const { id, trackId } = req.params as any;
    assertCanEdit(db, id, req.userId!, req.userRole!);
    removeTrack(db, id, trackId);
    return getPlaylist(db, id, req.userId);
  });

  app.put('/api/playlists/:id/order', { preHandler: app.authenticate }, async (req) => {
    const id = (req.params as any).id;
    assertCanEdit(db, id, req.userId!, req.userRole!);
    const body = z.object({ trackIds: z.array(z.string()) }).parse(req.body);
    reorder(db, id, body.trackIds);
    return getPlaylist(db, id, req.userId);
  });

  app.post('/api/playlists/:id/cover', { preHandler: app.authenticate }, async (req) => {
    const id = (req.params as any).id;
    const p = assertCanEdit(db, id, req.userId!, req.userRole!);
    const file = await req.file();
    if (!file) throw badRequest('Файл не передан');
    const name = await saveUploadedImage(file, config.coversDir);
    db.prepare('UPDATE playlists SET cover_path = ? WHERE id = ?').run(name, id);
    if (p.cover_path && p.cover_path !== name) { try { fs.unlinkSync(path.join(config.coversDir, p.cover_path)); } catch { /* ignore */ } }
    touch(db, id);
    return getPlaylist(db, id, req.userId);
  });

  /* ---------- edited together ---------- */

  /** An owner invites a friend to own the playlist too (they get it in their inbox). */
  app.post('/api/playlists/:id/members', { preHandler: app.authenticate }, async (req) => {
    const id = (req.params as any).id;
    const pl = assertCanEdit(db, id, req.userId!, req.userRole!);
    const body = z.object({ userId: z.string() }).parse(req.body ?? {});
    if (body.userId === req.userId || body.userId === pl.owner_id) throw badRequest('Он(а) и так владелец');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ? AND disabled = 0').get(body.userId)) throw notFound('Пользователь не найден');
    const r = db.prepare('INSERT OR IGNORE INTO playlist_members (playlist_id, user_id) VALUES (?, ?)').run(id, body.userId);
    if (r.changes) db.prepare(`INSERT INTO shares (id, from_user, to_user, kind, ref_id, message) VALUES (?,?,?,?,?,?)`).run(newId(), req.userId!, body.userId, 'playlist', id, 'invite');
    touch(db, id);
    return getPlaylist(db, id, req.userId);
  });

  /** A blend: a playlist of several owners the server fills from each one's taste, every day. */
  app.post('/api/playlists/blend', { preHandler: app.authenticate }, async (req) => {
    const b = z.object({ userIds: z.array(z.string()).min(1).max(5) }).parse(req.body ?? {});
    for (const u of b.userIds) if (!db.prepare('SELECT 1 FROM users WHERE id = ? AND disabled = 0').get(u)) throw notFound('Пользователь не найден');
    const id = createBlend(db, req.userId!, b.userIds);
    return getPlaylist(db, id, req.userId);
  });

  /** Fill a blend or a release radar anew right now. */
  app.post('/api/playlists/:id/refresh', { preHandler: app.authenticate }, async (req) => {
    const id = (req.params as any).id;
    const p = assertCanEdit(db, id, req.userId!, req.userRole!);
    if (!p.auto_kind) throw badRequest('Этот плейлист не обновляется сам');
    refreshAuto(db, id);
    return getPlaylist(db, id, req.userId);
  });

  /** A smart playlist: the server keeps it matching the rules. */
  app.post('/api/playlists/smart', { preHandler: app.authenticate }, async (req) => {
    const b = z.object({ title: z.string().trim().min(1).max(120), rules: smartRulesSchema }).parse(req.body ?? {});
    const id = createSmart(db, req.userId!, b.title, b.rules);
    indexPlaylist(db, id);
    return getPlaylist(db, id, req.userId);
  });

  app.put('/api/playlists/:id/rules', { preHandler: app.authenticate }, async (req) => {
    const id = (req.params as any).id;
    const p = assertCanEdit(db, id, req.userId!, req.userRole!);
    if (p.auto_kind !== 'smart') throw badRequest('Это не умный плейлист');
    setSmartRules(db, id, smartRulesSchema.parse((req.body as any)?.rules ?? req.body ?? {}));
    return getPlaylist(db, id, req.userId);
  });

  /** The listener's daily mixes (made the first time; `fresh=1` matches them to the taste now). */
  app.get('/api/me/mixes', { preHandler: app.authenticate }, async (req) => {
    const ids = (req.query as any)?.fresh ? ensureMixes(db, req.userId!) : mixesOf(db, req.userId!);
    return ids.map((id) => getPlaylist(db, id, req.userId)).filter(Boolean).map((p) => ({ ...p!, tracks: undefined }));
  });

  /** The company's week: songs, artists, who listened most. */
  app.get('/api/charts/week', { preHandler: app.authenticate }, async (req) => weeklyChart(db, req.userId!, 50));

  /** The listener's release radar (made the first time). */
  app.get('/api/me/radar', { preHandler: app.authenticate }, async (req) => getPlaylist(db, radarOf(db, req.userId!), req.userId));

  /** The creator removes an owner, or an owner leaves. */
  app.delete('/api/playlists/:id/members/:userId', { preHandler: app.authenticate }, async (req) => {
    const { id, userId } = req.params as any;
    if (userId !== req.userId) assertOwner(db, id, req.userId!, req.userRole!);
    db.prepare('DELETE FROM playlist_members WHERE playlist_id = ? AND user_id = ?').run(id, userId);
    touch(db, id);
    return userId === req.userId ? { ok: true } : getPlaylist(db, id, req.userId);
  });
}
