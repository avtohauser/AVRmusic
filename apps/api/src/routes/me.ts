import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import type { HistoryEntry } from '@avrmusic/shared';
import { ALBUM_FROM, ALBUM_SELECT, TRACK_FROM, TRACK_SELECT, mapAlbumSummary, mapArtistSummary, mapTracks } from '../services/library.js';
import { likedTracks } from '../services/playlists.js';
import { badRequest, notFound } from '../lib/errors.js';
import { saveUploadedImage } from '../lib/uploads.js';
import { config } from '../config.js';
import { getUser } from '../services/auth.js';
import { clamp, parseIntSafe } from '../lib/util.js';
import { recentlyPlayedTracks } from '../services/home.js';

const LikeType = z.enum(['track', 'album', 'artist', 'playlist']);

export default async function meRoutes(app: FastifyInstance) {
  const db = app.db;
  const auth = { preHandler: app.authenticate };

  app.get('/api/me/likes/tracks', auth, async (req) => likedTracks(db, req.userId!));

  app.get('/api/me/likes/albums', auth, async (req) => {
    const rows = db.prepare(`SELECT ${ALBUM_SELECT} ${ALBUM_FROM} JOIN likes l ON l.entity_id = al.id AND l.entity_type='album' WHERE l.user_id = ? ORDER BY l.created_at DESC`).all(req.userId) as any[];
    return rows.map(mapAlbumSummary);
  });

  app.get('/api/me/likes/artists', auth, async (req) => {
    const rows = db.prepare(`SELECT a.id, a.name, a.image_path FROM artists a JOIN likes l ON l.entity_id = a.id AND l.entity_type='artist' WHERE l.user_id = ? ORDER BY l.created_at DESC`).all(req.userId) as any[];
    return rows.map(mapArtistSummary);
  });

  app.get('/api/me/likes/ids', auth, async (req) => {
    const rows = db.prepare('SELECT entity_type, entity_id FROM likes WHERE user_id = ?').all(req.userId) as any[];
    const out: Record<string, string[]> = { track: [], album: [], artist: [], playlist: [] };
    for (const r of rows) (out[r.entity_type] ??= []).push(r.entity_id);
    return out;
  });

  /** "dz:<catalogue id>": a song playing straight from the catalogue — the library's track once it is fetched */
  const libraryOf = (id: string): string | null => {
    if (!id.startsWith('dz:')) return id;
    return (db.prepare('SELECT id FROM tracks WHERE deezer_id = ?').get(Number(id.slice(3))) as any)?.id ?? null;
  };

  app.put('/api/me/likes/:type/:id', auth, async (req) => {
    const p = z.object({ type: LikeType, id: z.string() }).parse(req.params);
    const type = p.type;
    // a song still being fetched: the like waits for it
    if (type === 'track' && p.id.startsWith('dz:') && !libraryOf(p.id)) {
      db.prepare('INSERT OR IGNORE INTO pending_likes (user_id, deezer_id) VALUES (?, ?)').run(req.userId, Number(p.id.slice(3)));
      return { liked: true, pending: true };
    }
    const id = type === 'track' ? libraryOf(p.id) ?? p.id : p.id;
    const table = type === 'track' ? 'tracks' : type === 'album' ? 'albums' : type === 'artist' ? 'artists' : 'playlists';
    if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) throw notFound();
    db.prepare('INSERT OR IGNORE INTO likes(user_id, entity_type, entity_id) VALUES (?,?,?)').run(req.userId, type, id);
    return { liked: true };
  });

  app.delete('/api/me/likes/:type/:id', auth, async (req) => {
    const p = z.object({ type: LikeType, id: z.string() }).parse(req.params);
    const type = p.type;
    if (type === 'track' && p.id.startsWith('dz:')) db.prepare('DELETE FROM pending_likes WHERE user_id = ? AND deezer_id = ?').run(req.userId, Number(p.id.slice(3)));
    const id = type === 'track' ? libraryOf(p.id) ?? p.id : p.id;
    db.prepare('DELETE FROM likes WHERE user_id = ? AND entity_type = ? AND entity_id = ?').run(req.userId, type, id);
    return { liked: false };
  });

  app.post('/api/me/plays', auth, async (req) => {
    const body = z.object({ trackId: z.string(), msPlayed: z.number().int().min(0).default(0), context: z.string().max(120).optional() }).parse(req.body);
    body.trackId = libraryOf(body.trackId) ?? body.trackId;
    if (!db.prepare('SELECT 1 FROM tracks WHERE id = ?').get(body.trackId)) throw notFound('Трек не найден');
    db.prepare('INSERT INTO plays(user_id, track_id, ms_played, context) VALUES (?,?,?,?)').run(req.userId, body.trackId, body.msPlayed, body.context ?? null);
    // Count as a play once >= 30s or >= half the track was heard (Spotify-like rule).
    const dur = (db.prepare('SELECT duration_ms d FROM tracks WHERE id = ?').get(body.trackId) as any).d as number;
    if (body.msPlayed >= 30_000 || (dur > 0 && body.msPlayed >= dur / 2)) {
      db.prepare('UPDATE tracks SET play_count = play_count + 1 WHERE id = ?').run(body.trackId);
    }
    return { ok: true };
  });

  app.get('/api/me/history', auth, async (req): Promise<HistoryEntry[]> => {
    const limit = clamp(parseIntSafe((req.query as any).limit, 50), 1, 200);
    const rows = db.prepare(`SELECT p.id play_id, p.played_at, p.ms_played, p.context, ${TRACK_SELECT} FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists ar ON ar.id = t.artist_id LEFT JOIN albums al ON al.id = t.album_id WHERE p.user_id = ? ORDER BY p.played_at DESC LIMIT ?`).all(req.userId, limit) as any[];
    const tracks = mapTracks(db, rows, req.userId);
    return rows.map((r, i) => ({ id: r.play_id, playedAt: r.played_at, msPlayed: r.ms_played, context: r.context, track: tracks[i] }));
  });

  app.get('/api/me/recent', auth, async (req) => recentlyPlayedTracks(db, req.userId!, clamp(parseIntSafe((req.query as any).limit, 30), 1, 100)));

  app.delete('/api/me/history', auth, async (req) => {
    db.prepare('DELETE FROM plays WHERE user_id = ?').run(req.userId);
    return { ok: true };
  });

  app.get('/api/me/stats', auth, async (req) => {
    const u = req.userId;
    const totals = db.prepare(`SELECT COUNT(*) plays, COALESCE(SUM(ms_played),0) ms FROM plays WHERE user_id = ?`).get(u) as any;
    const topTracks = mapTracks(db, db.prepare(`SELECT ${TRACK_SELECT}, COUNT(p.id) n ${TRACK_FROM} JOIN plays p ON p.track_id = t.id WHERE p.user_id = ? GROUP BY t.id ORDER BY n DESC LIMIT 10`).all(u) as any[], u);
    const topArtists = db.prepare(`SELECT a.id, a.name, a.image_path, COUNT(p.id) n FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id WHERE p.user_id = ? GROUP BY a.id ORDER BY n DESC LIMIT 10`).all(u).map(mapArtistSummary);
    const topGenres = db.prepare(`SELECT t.genre name, COUNT(*) n FROM plays p JOIN tracks t ON t.id = p.track_id WHERE p.user_id = ? AND t.genre IS NOT NULL GROUP BY t.genre ORDER BY n DESC LIMIT 6`).all(u);
    return { plays: totals.plays, msListened: totals.ms, topTracks, topArtists, topGenres };
  });

  app.post('/api/me/avatar', auth, async (req) => {
    const file = await req.file();
    if (!file) throw badRequest('Файл не передан');
    const prev = (db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(req.userId) as any)?.avatar_path;
    const name = await saveUploadedImage(file, config.avatarsDir);
    db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(name, req.userId);
    if (prev) { try { fs.unlinkSync(path.join(config.avatarsDir, prev)); } catch { /* ignore */ } }
    return getUser(db, req.userId!);
  });

  app.delete('/api/me/avatar', auth, async (req) => {
    const prev = (db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(req.userId) as any)?.avatar_path;
    db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?').run(req.userId);
    if (prev) { try { fs.unlinkSync(path.join(config.avatarsDir, prev)); } catch { /* ignore */ } }
    return getUser(db, req.userId!);
  });
}
