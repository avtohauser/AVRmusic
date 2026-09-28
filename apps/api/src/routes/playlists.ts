import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { badRequest, notFound } from '../lib/errors.js';
import { addTracks, assertOwner, createPlaylist, getPlaylist, listPublicPlaylists, listUserPlaylists, removeTrack, reorder, touch } from '../services/playlists.js';
import { indexPlaylist, removeFromIndex } from '../services/search.js';
import { saveUploadedImage } from '../lib/uploads.js';
import { config } from '../config.js';

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
    assertOwner(db, id, req.userId!, req.userRole!);
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
    assertOwner(db, id, req.userId!, req.userRole!);
    const body = z.object({ trackIds: z.array(z.string()).min(1).max(500) }).parse(req.body);
    const added = addTracks(db, id, body.trackIds, req.userId!);
    return { added, playlist: getPlaylist(db, id, req.userId) };
  });

  app.delete('/api/playlists/:id/tracks/:trackId', { preHandler: app.authenticate }, async (req) => {
    const { id, trackId } = req.params as any;
    assertOwner(db, id, req.userId!, req.userRole!);
    removeTrack(db, id, trackId);
    return getPlaylist(db, id, req.userId);
  });

  app.put('/api/playlists/:id/order', { preHandler: app.authenticate }, async (req) => {
    const id = (req.params as any).id;
    assertOwner(db, id, req.userId!, req.userRole!);
    const body = z.object({ trackIds: z.array(z.string()) }).parse(req.body);
    reorder(db, id, body.trackIds);
    return getPlaylist(db, id, req.userId);
  });

  app.post('/api/playlists/:id/cover', { preHandler: app.authenticate }, async (req) => {
    const id = (req.params as any).id;
    const p = assertOwner(db, id, req.userId!, req.userRole!);
    const file = await req.file();
    if (!file) throw badRequest('Файл не передан');
    const name = await saveUploadedImage(file, config.coversDir);
    db.prepare('UPDATE playlists SET cover_path = ? WHERE id = ?').run(name, id);
    if (p.cover_path && p.cover_path !== name) { try { fs.unlinkSync(path.join(config.coversDir, p.cover_path)); } catch { /* ignore */ } }
    touch(db, id);
    return getPlaylist(db, id, req.userId);
  });
}
