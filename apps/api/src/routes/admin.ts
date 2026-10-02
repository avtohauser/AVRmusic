import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import mime from 'mime-types';
import type { AdminActivity, AdminStats, AdminUserDetail, AdminUserRow, UploadResult } from '@avrmusic/shared';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { CANVAS_IMAGE_EXT, CANVAS_VIDEO_EXT, config } from '../config.js';
import { badRequest, notFound } from '../lib/errors.js';
import { lrcToPlain, parseLrc } from '../lib/lyrics.js';
import { saveUploadedImage, spoolToTmp } from '../lib/uploads.js';
import { moveFile, newId } from '../lib/util.js';
import { getAlbum, getArtist, getTrack, getTracksByIds } from '../services/library.js';
import { cleanupOrphans, deleteTrack, ensureAlbum, ensureArtist, importAudioFile, scanDirectory } from '../services/importer.js';
import { indexAlbum, indexArtist, indexTrack, reindexAll, removeFromIndex } from '../services/search.js';
import { mapUser } from '../services/auth.js';
import { createInvite, deleteInvite, listInvites } from '../services/invites.js';
import { enqueueCanvasJob } from '../services/canvas.js';
import { addAccount, listAccounts, removeAccount, wakeAccount } from '../services/youtubeAccounts.js';

export default async function adminRoutes(app: FastifyInstance) {
  const db = app.db;
  const admin = { preHandler: app.requireAdmin };

  app.get('/api/admin/stats', admin, async (): Promise<AdminStats> => {
    const c = (sql: string) => (db.prepare(sql).get() as any).c as number;
    return {
      users: c('SELECT COUNT(*) c FROM users'),
      artists: c('SELECT COUNT(*) c FROM artists'),
      albums: c('SELECT COUNT(*) c FROM albums'),
      tracks: c('SELECT COUNT(*) c FROM tracks'),
      playlists: c('SELECT COUNT(*) c FROM playlists'),
      plays: c('SELECT COUNT(*) c FROM plays'),
      storageBytes: c('SELECT COALESCE(SUM(file_size),0) c FROM tracks'),
      withLyrics: c('SELECT COUNT(*) c FROM tracks WHERE lyrics_plain IS NOT NULL OR lyrics_synced IS NOT NULL'),
      withCanvas: c('SELECT COUNT(*) c FROM tracks WHERE canvas_path IS NOT NULL'),
    };
  });

  /** Multipart upload of one or more audio files (+ optional fields title/artist/album/genre/year applied to all). */
  app.post('/api/admin/upload', admin, async (req): Promise<UploadResult> => {
    const imported: string[] = [];
    const skipped: Array<{ file: string; reason: string }> = [];
    const overrides: Record<string, string> = {};
    const spooled: Array<{ tmpPath: string; filename: string }> = [];
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        try {
          const s = await spoolToTmp(part);
          spooled.push({ tmpPath: s.tmpPath, filename: s.filename });
        } catch (e: any) {
          skipped.push({ file: part.filename, reason: e?.message ?? 'upload error' });
        }
      } else if (typeof part.value === 'string' && part.value.trim()) {
        overrides[part.fieldname] = part.value.trim();
      }
    }
    for (const f of spooled) {
      try {
        const named = f.tmpPath;
        const r = await importAudioFile(db, named, {
          mode: 'move',
          originalName: path.basename(f.filename),
          overrides: { title: overrides.title, artist: overrides.artist, album: overrides.album, genre: overrides.genre, year: overrides.year ? Number(overrides.year) : undefined },
        });
        if (r.ok && r.trackId) imported.push(r.trackId);
        else { skipped.push({ file: f.filename, reason: r.reason ?? 'unknown' }); try { fs.unlinkSync(named); } catch { /* ignore */ } }
      } catch (e: any) {
        skipped.push({ file: f.filename, reason: e?.message ?? String(e) });
        try { fs.unlinkSync(f.tmpPath); } catch { /* ignore */ }
      }
    }
    return { imported: getTracksByIds(db, imported, req.userId), skipped };
  });

  app.post('/api/admin/scan', admin, async (req) => {
    const body = z.object({ dir: z.string().optional() }).parse(req.body ?? {});
    const dir = body.dir ? path.resolve(body.dir) : config.musicDir;
    if (!dir) throw badRequest('MUSIC_DIR не задан. Укажите папку в .env или в запросе');
    if (!fs.existsSync(dir)) throw badRequest(`Папка не найдена: ${dir}`);
    const r = await scanDirectory(db, dir, (f) => app.log.info({ f }, 'scan'));
    return { dir, imported: r.imported.length, skipped: r.skipped, tracks: getTracksByIds(db, r.imported.slice(0, 100), req.userId) };
  });

  app.post('/api/admin/reindex', admin, async () => { reindexAll(db); return { ok: true }; });

  app.get('/api/admin/tracks', admin, async (req) => {
    const q = req.query as any;
    const limit = Math.min(Number(q.limit) || 100, 500);
    const offset = Number(q.offset) || 0;
    const filter = q.q ? `%${String(q.q).toLowerCase()}%` : null;
    const where = filter ? `WHERE lower(t.title) LIKE ? OR lower(ar.name) LIKE ? OR lower(al.title) LIKE ?` : '';
    const params = filter ? [filter, filter, filter] : [];
    const total = (db.prepare(`SELECT COUNT(*) c FROM tracks t JOIN artists ar ON ar.id=t.artist_id LEFT JOIN albums al ON al.id=t.album_id ${where}`).get(...params) as any).c;
    const ids = (db.prepare(`SELECT t.id FROM tracks t JOIN artists ar ON ar.id=t.artist_id LEFT JOIN albums al ON al.id=t.album_id ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as any[]).map((r) => r.id);
    return { items: getTracksByIds(db, ids, req.userId), total, limit, offset };
  });

  app.patch('/api/admin/tracks/:id', admin, async (req) => {
    const id = (req.params as any).id;
    const t = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as any;
    if (!t) throw notFound('Трек не найден');
    const body = z.object({
      title: z.string().min(1).max(200).optional(),
      artist: z.string().min(1).max(200).optional(),
      album: z.string().max(200).nullable().optional(),
      albumType: z.enum(['album', 'single', 'ep', 'compilation']).optional(),
      genre: z.string().max(60).nullable().optional(),
      year: z.number().int().nullable().optional(),
      trackNo: z.number().int().nullable().optional(),
      discNo: z.number().int().nullable().optional(),
      explicit: z.boolean().optional(),
      featuring: z.array(z.string()).optional(),
      lyricsPlain: z.string().nullable().optional(),
      lyricsSynced: z.string().nullable().optional(),
    }).parse(req.body ?? {});

    const tx = db.transaction(() => {
      let artistId = t.artist_id;
      if (body.artist) artistId = ensureArtist(db, body.artist);
      let albumId = t.album_id;
      if (body.album !== undefined) {
        albumId = body.album ? ensureAlbum(db, artistId, body.album, body.year ?? t.year ?? null, body.albumType ?? null) : null;
      } else if (body.artist && albumId) {
        db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(artistId, albumId);
      }
      if (albumId && body.year !== undefined) db.prepare('UPDATE albums SET year = ? WHERE id = ?').run(body.year, albumId);
      if (albumId && body.albumType) db.prepare('UPDATE albums SET type = ? WHERE id = ?').run(body.albumType, albumId);
      const sets: string[] = ['artist_id = @artist_id', 'album_id = @album_id'];
      const params: any = { id, artist_id: artistId, album_id: albumId };
      const set = (col: string, val: any) => { sets.push(`${col} = @${col}`); params[col] = val; };
      if (body.title !== undefined) set('title', body.title);
      if (body.genre !== undefined) set('genre', body.genre || null);
      if (body.trackNo !== undefined) set('track_no', body.trackNo);
      if (body.discNo !== undefined) set('disc_no', body.discNo);
      if (body.explicit !== undefined) set('explicit', body.explicit ? 1 : 0);
      if (body.lyricsSynced !== undefined) {
        if (body.lyricsSynced && !parseLrc(body.lyricsSynced)) throw badRequest('Синхронизированный текст должен быть в формате LRC: [mm:ss.xx] строка');
        set('lyrics_synced', body.lyricsSynced || null);
        if (body.lyricsSynced && body.lyricsPlain === undefined) set('lyrics_plain', lrcToPlain(body.lyricsSynced));
        set('lyrics_source', body.lyricsSynced ? 'manual' : null);
      }
      if (body.lyricsPlain !== undefined) { set('lyrics_plain', body.lyricsPlain || null); if (!params.lyrics_source) set('lyrics_source', body.lyricsPlain ? 'manual' : null); }
      db.prepare(`UPDATE tracks SET ${sets.join(', ')} WHERE id = @id`).run(params);
      if (body.featuring) {
        db.prepare('DELETE FROM track_artists WHERE track_id = ?').run(id);
        body.featuring.filter((n) => n.trim()).forEach((n, i) => {
          const fid = ensureArtist(db, n);
          if (fid !== artistId) db.prepare('INSERT OR IGNORE INTO track_artists(track_id, artist_id, position) VALUES (?,?,?)').run(id, fid, i);
        });
      }
      cleanupOrphans(db);
      indexTrack(db, id);
      if (albumId) indexAlbum(db, albumId);
      indexArtist(db, artistId);
    });
    tx();
    return getTrack(db, id, req.userId);
  });

  app.delete('/api/admin/tracks/:id', admin, async (req) => { deleteTrack(db, (req.params as any).id); return { ok: true }; });

  /** Raw lyrics for the editor (LRC text + plain) */
  app.get('/api/admin/tracks/:id/lyrics', admin, async (req) => {
    const r = db.prepare('SELECT lyrics_synced, lyrics_plain, lyrics_source FROM tracks WHERE id = ?').get((req.params as any).id) as any;
    if (!r) throw notFound('Трек не найден');
    return { lyricsSynced: r.lyrics_synced, lyricsPlain: r.lyrics_plain, source: r.lyrics_source };
  });

  /** Upload lyrics as .lrc / .txt file */
  app.post('/api/admin/tracks/:id/lyrics', admin, async (req) => {
    const id = (req.params as any).id;
    if (!db.prepare('SELECT 1 FROM tracks WHERE id = ?').get(id)) throw notFound('Трек не найден');
    const file = await req.file();
    if (!file) throw badRequest('Файл не передан');
    const text = (await file.toBuffer()).toString('utf8').replace(/^﻿/, '');
    const synced = parseLrc(text);
    if (synced) db.prepare(`UPDATE tracks SET lyrics_synced = ?, lyrics_plain = ?, lyrics_source = 'lrc' WHERE id = ?`).run(text, lrcToPlain(text), id);
    else db.prepare(`UPDATE tracks SET lyrics_plain = ?, lyrics_source = 'txt' WHERE id = ?`).run(text.trim(), id);
    return getTrack(db, id, req.userId);
  });

  /** Upload a canvas (short looping video mp4/webm or animated image gif/webp) */
  app.post('/api/admin/tracks/:id/canvas', admin, async (req) => {
    const id = (req.params as any).id;
    const t = db.prepare('SELECT canvas_path FROM tracks WHERE id = ?').get(id) as any;
    if (!t) throw notFound('Трек не найден');
    const file = await req.file();
    if (!file) throw badRequest('Файл не передан');
    const ext = path.extname(file.filename || '').toLowerCase();
    if (!CANVAS_VIDEO_EXT.has(ext) && !CANVAS_IMAGE_EXT.has(ext)) throw badRequest('Канвас: mp4/webm/mov или gif/webp/png/jpg/svg');
    const { tmpPath } = await spoolToTmp(file);
    const name = `${newId()}${ext}`;
    moveFile(tmpPath, path.join(config.canvasDir, name));
    db.prepare('UPDATE tracks SET canvas_path = ?, canvas_mime = ? WHERE id = ?').run(name, (mime.lookup(ext) as string) || file.mimetype, id);
    if (t.canvas_path) { try { fs.unlinkSync(path.join(config.canvasDir, t.canvas_path)); } catch { /* ignore */ } }
    return getTrack(db, id, req.userId);
  });

  /** Find the official clip on YouTube and cut a canvas out of it (replaces an existing canvas). */
  app.post('/api/admin/tracks/:id/canvas/fetch', admin, async (req) => {
    const id = (req.params as any).id;
    const t = db.prepare('SELECT t.title, a.name AS artist FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE t.id = ?').get(id) as any;
    if (!t) throw notFound('Трек не найден');
    const job = enqueueCanvasJob(db, [id], `Канвас: ${t.artist} — ${t.title}`, { force: true, requestedBy: req.userId });
    return { jobId: job.id, job };
  });
  /** Batch: canvases for every audio track that has none. */
  app.post('/api/admin/canvas/fetch-missing', admin, async (req) => {
    const ids = (db.prepare("SELECT id FROM tracks WHERE canvas_path IS NULL AND (codec IS NULL OR codec <> 'video')").all() as any[]).map((r) => r.id);
    const job = enqueueCanvasJob(db, ids, `Канвасы для всех треков (${ids.length})`, { requestedBy: req.userId });
    return { jobId: job.id, job };
  });

  app.delete('/api/admin/tracks/:id/canvas', admin, async (req) => {
    const id = (req.params as any).id;
    const t = db.prepare('SELECT canvas_path FROM tracks WHERE id = ?').get(id) as any;
    if (!t) throw notFound('Трек не найден');
    if (t.canvas_path) { try { fs.unlinkSync(path.join(config.canvasDir, t.canvas_path)); } catch { /* ignore */ } }
    db.prepare('UPDATE tracks SET canvas_path = NULL, canvas_mime = NULL WHERE id = ?').run(id);
    return getTrack(db, id, req.userId);
  });

  app.post('/api/admin/tracks/:id/cover', admin, async (req) => {
    const id = (req.params as any).id;
    const t = db.prepare('SELECT album_id FROM tracks WHERE id = ?').get(id) as any;
    if (!t) throw notFound('Трек не найден');
    const file = await req.file();
    if (!file) throw badRequest('Файл не передан');
    const name = await saveUploadedImage(file, config.coversDir);
    if (t.album_id) db.prepare('UPDATE albums SET cover_path = ? WHERE id = ?').run(name, t.album_id);
    else db.prepare('UPDATE tracks SET cover_path = ? WHERE id = ?').run(name, id);
    return getTrack(db, id, req.userId);
  });

  app.patch('/api/admin/albums/:id', admin, async (req) => {
    const id = (req.params as any).id;
    if (!db.prepare('SELECT 1 FROM albums WHERE id = ?').get(id)) throw notFound('Альбом не найден');
    const body = z.object({ title: z.string().min(1).max(200).optional(), year: z.number().int().nullable().optional(), type: z.enum(['album', 'single', 'ep', 'compilation']).optional(), description: z.string().max(2000).nullable().optional(), label: z.string().max(120).nullable().optional(), releaseDate: z.string().max(20).nullable().optional() }).parse(req.body ?? {});
    const cols: Record<string, string> = { title: 'title', year: 'year', type: 'type', description: 'description', label: 'label', releaseDate: 'release_date' };
    for (const [k, col] of Object.entries(cols)) if ((body as any)[k] !== undefined) db.prepare(`UPDATE albums SET ${col} = ? WHERE id = ?`).run((body as any)[k], id);
    indexAlbum(db, id);
    return getAlbum(db, id, req.userId);
  });

  app.post('/api/admin/albums/:id/cover', admin, async (req) => {
    const id = (req.params as any).id;
    if (!db.prepare('SELECT 1 FROM albums WHERE id = ?').get(id)) throw notFound('Альбом не найден');
    const file = await req.file();
    if (!file) throw badRequest('Файл не передан');
    const name = await saveUploadedImage(file, config.coversDir);
    db.prepare('UPDATE albums SET cover_path = ? WHERE id = ?').run(name, id);
    return getAlbum(db, id, req.userId);
  });

  app.delete('/api/admin/albums/:id', admin, async (req) => {
    const id = (req.params as any).id;
    for (const t of db.prepare('SELECT id FROM tracks WHERE album_id = ?').all(id) as any[]) deleteTrack(db, t.id);
    db.prepare('DELETE FROM albums WHERE id = ?').run(id);
    removeFromIndex(db, 'album', id);
    cleanupOrphans(db);
    return { ok: true };
  });

  app.patch('/api/admin/artists/:id', admin, async (req) => {
    const id = (req.params as any).id;
    if (!db.prepare('SELECT 1 FROM artists WHERE id = ?').get(id)) throw notFound('Исполнитель не найден');
    const body = z.object({ name: z.string().min(1).max(200).optional(), bio: z.string().max(4000).nullable().optional(), verified: z.boolean().optional() }).parse(req.body ?? {});
    if (body.name !== undefined) db.prepare('UPDATE artists SET name = ? WHERE id = ?').run(body.name, id);
    if (body.bio !== undefined) db.prepare('UPDATE artists SET bio = ? WHERE id = ?').run(body.bio, id);
    if (body.verified !== undefined) db.prepare('UPDATE artists SET verified = ? WHERE id = ?').run(body.verified ? 1 : 0, id);
    indexArtist(db, id);
    return getArtist(db, id, req.userId);
  });

  app.post('/api/admin/artists/:id/image', admin, async (req) => {
    const id = (req.params as any).id;
    if (!db.prepare('SELECT 1 FROM artists WHERE id = ?').get(id)) throw notFound('Исполнитель не найден');
    const kind = (req.query as any).kind === 'header' ? 'header_path' : 'image_path';
    const file = await req.file();
    if (!file) throw badRequest('Файл не передан');
    const name = await saveUploadedImage(file, config.coversDir);
    db.prepare(`UPDATE artists SET ${kind} = ? WHERE id = ?`).run(name, id);
    return getArtist(db, id, req.userId);
  });

  // ---- one-time invite codes
  app.get('/api/admin/invites', admin, async () => listInvites(db));
  app.post('/api/admin/invites', admin, async (req) => {
    const body = z.object({ note: z.string().max(100).optional(), expiresDays: z.number().int().min(1).max(365).optional() }).parse(req.body ?? {});
    return createInvite(db, req.userId!, body);
  });
  app.delete('/api/admin/invites/:code', admin, async (req) => { deleteInvite(db, (req.params as any).code); return { ok: true }; });

  /** YouTube accounts for yt-dlp (a cookies.txt each): status only (never the content), add, wake, remove. */
  app.get('/api/admin/youtube-accounts', admin, async () => listAccounts());
  app.post('/api/admin/youtube-accounts', admin, async (req) => {
    const file = await req.file();
    if (!file) throw badRequest('Файл не передан');
    const buf = await file.toBuffer();
    if (buf.length > 512 * 1024) throw badRequest('Слишком большой файл');
    const label = (file.fields as any)?.label?.value as string | undefined;
    return addAccount(buf.toString('utf8'), label);
  });
  app.get('/api/admin/client-errors', admin, async () => db.prepare(`SELECT e.*, u.username FROM client_errors e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 30`).all());
  app.post('/api/admin/youtube-accounts/:id/wake', admin, async (req) => wakeAccount((req.params as any).id));
  app.delete('/api/admin/youtube-accounts/:id', admin, async (req) => removeAccount((req.params as any).id));

  /* ---------- users: list with activity, details, management ---------- */
  const userRow = (r: any): AdminUserRow => ({
    ...mapUser(r), disabled: !!r.disabled, lastSeenAt: r.last_seen_at ?? null,
    plays: r.plays ?? 0, msListened: r.ms ?? 0, plays7d: r.plays7d ?? 0, likes: r.likes ?? 0, playlists: r.playlists ?? 0,
    added: r.added ?? 0, downloads: r.downloads ?? 0, downloadBytes: r.download_bytes ?? 0,
  });
  const USER_STATS = `SELECT u.*,
      (SELECT COUNT(*) FROM plays p WHERE p.user_id = u.id) plays,
      (SELECT COALESCE(SUM(ms_played),0) FROM plays p WHERE p.user_id = u.id) ms,
      (SELECT COUNT(*) FROM plays p WHERE p.user_id = u.id AND p.played_at > datetime('now','-7 days')) plays7d,
      (SELECT COUNT(*) FROM likes l WHERE l.user_id = u.id) likes,
      (SELECT COUNT(*) FROM playlists pl WHERE pl.owner_id = u.id) playlists,
      (SELECT COUNT(*) FROM tracks t WHERE t.added_by = u.id) added,
      (SELECT COUNT(*) FROM downloads d WHERE d.user_id = u.id) downloads,
      (SELECT COALESCE(SUM(bytes),0) FROM downloads d WHERE d.user_id = u.id) download_bytes
    FROM users u`;

  app.get('/api/admin/users', admin, async (): Promise<AdminUserRow[]> => (db.prepare(`${USER_STATS} ORDER BY u.created_at`).all() as any[]).map(userRow));

  app.get('/api/admin/users/:id', admin, async (req): Promise<AdminUserDetail> => {
    const id = (req.params as any).id;
    const r = db.prepare(`${USER_STATS} WHERE u.id = ?`).get(id);
    if (!r) throw notFound('Пользователь не найден');
    const daily = db.prepare(`SELECT substr(played_at,1,10) day, COUNT(*) plays, COALESCE(SUM(ms_played),0) ms FROM plays WHERE user_id = ? AND played_at > datetime('now','-30 days') GROUP BY day ORDER BY day`).all(id) as any[];
    const topArtists = db.prepare(`SELECT ar.id, ar.name, COUNT(*) plays FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists ar ON ar.id = t.artist_id WHERE p.user_id = ? GROUP BY ar.id ORDER BY plays DESC LIMIT 10`).all(id) as any[];
    const topTracks = db.prepare(`SELECT t.id, t.title, ar.name artist, COUNT(*) plays FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists ar ON ar.id = t.artist_id WHERE p.user_id = ? GROUP BY t.id ORDER BY plays DESC LIMIT 10`).all(id) as any[];
    const recentPlays = (db.prepare(`SELECT t.id trackId, t.title, ar.name artist, p.played_at playedAt, p.ms_played msPlayed FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists ar ON ar.id = t.artist_id WHERE p.user_id = ? ORDER BY p.played_at DESC LIMIT 30`).all(id) as any[]);
    const added = db.prepare(`SELECT t.id trackId, t.title, ar.name artist, t.created_at createdAt FROM tracks t JOIN artists ar ON ar.id = t.artist_id WHERE t.added_by = ? ORDER BY t.created_at DESC LIMIT 30`).all(id) as any[];
    const downloads = db.prepare(`SELECT d.kind, d.ref_id refId, d.bytes, d.created_at createdAt,
        COALESCE((SELECT title FROM tracks WHERE id = d.ref_id), (SELECT title FROM albums WHERE id = d.ref_id), (SELECT title FROM playlists WHERE id = d.ref_id)) title
      FROM downloads d WHERE d.user_id = ? ORDER BY d.created_at DESC LIMIT 30`).all(id) as any[];
    const jobs = { done: 0, error: 0, queued: 0 };
    for (const j of db.prepare(`SELECT status, COUNT(*) n FROM jobs WHERE requested_by = ? GROUP BY status`).all(id) as any[]) {
      if (j.status === 'done') jobs.done += j.n; else if (j.status === 'error') jobs.error += j.n; else jobs.queued += j.n;
    }
    return { user: userRow(r), daily, topArtists, topTracks, recentPlays, added, downloads, jobs };
  });

  app.patch('/api/admin/users/:id', admin, async (req) => {
    const id = (req.params as any).id;
    const body = z.object({ role: z.enum(['admin', 'user']).optional(), disabled: z.boolean().optional(), canAcquire: z.boolean().optional(), displayName: z.string().trim().min(1).max(60).optional() }).parse(req.body);
    if (id === req.userId && (body.role === 'user' || body.disabled)) throw badRequest('Нельзя снять права или заблокировать самого себя');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) throw notFound('Пользователь не найден');
    if (body.role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, id);
    if (body.disabled !== undefined) {
      db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(body.disabled ? 1 : 0, id);
      if (body.disabled) db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(id); // signed out everywhere
      app.forgetUserState(id);
    }
    if (body.canAcquire !== undefined) db.prepare('UPDATE users SET can_acquire = ? WHERE id = ?').run(body.canAcquire ? 1 : 0, id);
    if (body.displayName) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(body.displayName, id);
    return userRow(db.prepare(`${USER_STATS} WHERE u.id = ?`).get(id));
  });

  /** A new temporary password (shown once); the user is signed out everywhere. */
  app.post('/api/admin/users/:id/reset-password', admin, async (req) => {
    const id = (req.params as any).id;
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) throw notFound('Пользователь не найден');
    const password = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(password, 10), id);
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(id);
    return { password };
  });

  /** Activity of the whole service: listening per day, top tracks and artists, storage by source, jobs. */
  app.get('/api/admin/activity', admin, async (): Promise<AdminActivity> => {
    const daily = db.prepare(`SELECT substr(played_at,1,10) day, COUNT(*) plays, COALESCE(SUM(ms_played),0) ms, COUNT(DISTINCT user_id) users FROM plays WHERE played_at > datetime('now','-30 days') GROUP BY day ORDER BY day`).all() as any[];
    const topTracks = db.prepare(`SELECT t.id, t.title, ar.name artist, COUNT(*) plays FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists ar ON ar.id = t.artist_id WHERE p.played_at > datetime('now','-30 days') GROUP BY t.id ORDER BY plays DESC LIMIT 10`).all() as any[];
    const topArtists = db.prepare(`SELECT ar.id, ar.name, COUNT(*) plays FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists ar ON ar.id = t.artist_id WHERE p.played_at > datetime('now','-30 days') GROUP BY ar.id ORDER BY plays DESC LIMIT 10`).all() as any[];
    const sources = db.prepare(`SELECT COALESCE(substr(source, 1, instr(source || ':', ':') - 1), 'upload') source, COUNT(*) tracks, COALESCE(SUM(file_size),0) bytes FROM tracks GROUP BY 1 ORDER BY tracks DESC`).all() as any[];
    const jobs24h = { done: 0, error: 0, queued: 0, running: 0 };
    for (const j of db.prepare(`SELECT status, COUNT(*) n FROM jobs WHERE created_at > strftime('%Y-%m-%dT%H:%M:%fZ', datetime('now','-1 day')) OR status IN ('queued','running') GROUP BY status`).all() as any[]) (jobs24h as any)[j.status] = j.n;
    const activeUsers7d = (db.prepare(`SELECT COUNT(DISTINCT user_id) n FROM plays WHERE played_at > datetime('now','-7 days')`).get() as any).n;
    return { daily, topTracks, topArtists, sources: sources.map((x) => ({ ...x, source: x.source || 'upload' })), jobs24h, activeUsers7d };
  });

  app.delete('/api/admin/users/:id', admin, async (req) => {
    const id = (req.params as any).id;
    if (id === req.userId) throw badRequest('Нельзя удалить самого себя');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { ok: true };
  });
}
