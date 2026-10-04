// Friends: who is on the server and what they play right now, their pages and how close their taste is,
// things sent to each other, reactions at a moment of a track, "listen together" sessions and the
// listener's recap.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/util.js';
import { ALBUM_FROM, ALBUM_SELECT, avatarUrl, getTrack, mapAlbumSummary, mapArtistSummary } from '../services/library.js';
import { PLAYLIST_FROM, PLAYLIST_SELECT, mapPlaylistSummary } from '../services/playlists.js';
import { applyJam, friendRef, getJam, jamOf, jamView, joinJam, leaveJam, listJams, nowPlaying, setNowPlaying, startJam, waitJam, type JamOp } from '../services/social.js';
import { compatibility, profileStats, recap } from '../services/stats.js';

export default async function socialRoutes(app: FastifyInstance) {
  const db = app.db;
  const auth = { preHandler: app.authenticate };

  const userRow = (id: string) => db.prepare('SELECT id, username, display_name, avatar_path, created_at, last_seen_at, disabled FROM users WHERE id = ?').get(id) as any;
  const person = (u: any, viewer: string) => {
    const jam = jamOf(u.id);
    return {
      id: u.id, username: u.username, displayName: u.display_name, avatarUrl: avatarUrl(u.avatar_path),
      lastSeenAt: u.last_seen_at ?? null, now: nowPlaying(db, u.id, viewer), jamId: jam?.id ?? null,
    };
  };

  /** Everyone on the server (the listener's friends), those listening right now first. */
  app.get('/api/users', auth, async (req) => {
    const rows = db.prepare('SELECT id, username, display_name, avatar_path, created_at, last_seen_at FROM users WHERE disabled = 0 AND id <> ? ORDER BY last_seen_at DESC').all(req.userId!) as any[];
    const list = rows.map((u) => person(u, req.userId!));
    return list.sort((a, b) => Number(!!b.now) - Number(!!a.now));
  });

  /** A friend's page. */
  app.get('/api/users/:id', auth, async (req) => {
    const id = (req.params as any).id as string;
    const u = userRow(id);
    if (!u || u.disabled) throw notFound('Пользователь не найден');
    const playlists = (db.prepare(`SELECT ${PLAYLIST_SELECT} ${PLAYLIST_FROM} WHERE p.owner_id = ? AND (p.is_public = 1 OR p.id IN (SELECT playlist_id FROM playlist_members WHERE user_id = ?)) ORDER BY p.updated_at DESC LIMIT 20`).all(id, req.userId!) as any[])
      .map((r) => mapPlaylistSummary(db, r, req.userId));
    return {
      ...person(u, req.userId!),
      createdAt: u.created_at,
      stats: profileStats(db, id, req.userId!),
      compat: id === req.userId ? null : compatibility(db, req.userId!, id, req.userId!),
      playlists,
    };
  });

  app.get('/api/users/:id/compat', auth, async (req) => compatibility(db, req.userId!, (req.params as any).id, req.userId!));

  /** What this listener plays now (sent on every change and every 15 s while playing). */
  app.post('/api/me/now', auth, async (req) => {
    const b = z.object({ trackId: z.string().nullable(), positionMs: z.number().min(0).default(0), playing: z.boolean().default(false) }).parse(req.body ?? {});
    setNowPlaying(req.userId!, b.trackId, b.positionMs, b.playing);
    return { ok: true };
  });

  /** The listener's recap of a month or a year (offset 1 = the previous one); tz = minutes east of UTC. */
  app.get('/api/me/recap', auth, async (req) => {
    const q = z.object({ period: z.enum(['month', 'year']).default('month'), offset: z.coerce.number().int().min(0).max(20).default(0), tz: z.coerce.number().int().min(-840).max(840).default(0) }).parse(req.query ?? {});
    return recap(db, req.userId!, q.period, q.offset, q.tz);
  });

  /* ---------- sending things to friends ---------- */

  const resolveRef = (kind: string, refId: string, viewer: string): any => {
    switch (kind) {
      case 'track': return getTrack(db, refId, viewer);
      case 'album': { const r = db.prepare(`SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE al.id = ?`).get(refId); return r ? mapAlbumSummary(r) : null; }
      case 'artist': { const r = db.prepare('SELECT id, name, image_path FROM artists WHERE id = ?').get(refId); return r ? mapArtistSummary(r) : null; }
      case 'playlist': { const r = db.prepare(`SELECT ${PLAYLIST_SELECT} ${PLAYLIST_FROM} WHERE p.id = ?`).get(refId) as any; return r ? mapPlaylistSummary(db, r, viewer) : null; }
      // an invitation to listen together: gone once the session ends
      case 'jam': { const j = getJam(refId); if (!j) return null; const v = jamView(db, j, viewer); return { id: v.id, host: v.host, members: v.members, track: v.queue[v.index] ?? null, playing: v.playing }; }
      default: return null;
    }
  };
  const mapShare = (r: any, viewer: string) => ({
    id: r.id, from: friendRef(db, r.from_user), kind: r.kind, refId: r.ref_id, item: resolveRef(r.kind, r.ref_id, viewer),
    message: r.message, seen: !!r.seen, createdAt: r.created_at,
  });

  app.post('/api/shares', auth, async (req) => {
    const b = z.object({
      to: z.array(z.string()).min(1).max(20),
      kind: z.enum(['track', 'album', 'artist', 'playlist', 'jam']),
      refId: z.string().min(1),
      message: z.string().trim().max(500).default(''),
    }).parse(req.body ?? {});
    if (!resolveRef(b.kind, b.refId, req.userId!)) throw notFound('Нечего отправить');
    const ins = db.prepare('INSERT INTO shares (id, from_user, to_user, kind, ref_id, message) VALUES (?,?,?,?,?,?)');
    let sent = 0;
    for (const to of new Set(b.to)) {
      if (to === req.userId || !userRow(to)) continue;
      ins.run(newId(), req.userId!, to, b.kind, b.refId, b.message);
      sent++;
    }
    if (!sent) throw badRequest('Некому отправить');
    return { sent };
  });

  /** What friends sent to this listener, newest first; `after` (ISO) keeps only what came since. */
  app.get('/api/shares', auth, async (req) => {
    const after = (req.query as any)?.after as string | undefined;
    const rows = after
      ? db.prepare('SELECT * FROM shares WHERE to_user = ? AND created_at > ? ORDER BY created_at DESC LIMIT 100').all(req.userId!, after)
      : db.prepare('SELECT * FROM shares WHERE to_user = ? ORDER BY created_at DESC LIMIT 100').all(req.userId!);
    return (rows as any[]).map((r) => mapShare(r, req.userId!)).filter((s) => s.item);
  });

  app.post('/api/shares/seen', auth, async (req) => {
    db.prepare('UPDATE shares SET seen = 1 WHERE to_user = ? AND seen = 0').run(req.userId!);
    return { ok: true };
  });

  /* ---------- reactions at a moment of a track ---------- */

  const mapReaction = (r: any) => ({ id: r.id, user: friendRef(db, r.user_id), atMs: r.at_ms, emoji: r.emoji, text: r.text, createdAt: r.created_at });

  app.get('/api/tracks/:id/reactions', auth, async (req) =>
    (db.prepare('SELECT * FROM reactions WHERE track_id = ? ORDER BY at_ms LIMIT 500').all((req.params as any).id) as any[]).map(mapReaction));

  app.post('/api/tracks/:id/reactions', auth, async (req) => {
    const trackId = (req.params as any).id as string;
    if (!db.prepare('SELECT 1 FROM tracks WHERE id = ?').get(trackId)) throw notFound('Трек не найден');
    const b = z.object({ atMs: z.number().int().min(0), emoji: z.string().max(16).default(''), text: z.string().trim().max(200).default('') }).parse(req.body ?? {});
    if (!b.emoji && !b.text) throw badRequest('Пустая реакция');
    const id = newId();
    db.prepare('INSERT INTO reactions (id, track_id, user_id, at_ms, emoji, text) VALUES (?,?,?,?,?,?)').run(id, trackId, req.userId!, b.atMs, b.emoji, b.text);
    return mapReaction(db.prepare('SELECT * FROM reactions WHERE id = ?').get(id));
  });

  app.delete('/api/reactions/:id', auth, async (req) => {
    const r = db.prepare('SELECT * FROM reactions WHERE id = ?').get((req.params as any).id) as any;
    if (!r) throw notFound('Реакция не найдена');
    if (r.user_id !== req.userId && req.userRole !== 'admin') throw forbidden('Это не ваша реакция');
    db.prepare('DELETE FROM reactions WHERE id = ?').run(r.id);
    return { ok: true };
  });

  /* ---------- listen together ---------- */

  const jamOrThrow = (id: string) => { const j = getJam(id); if (!j) throw notFound('Сессия закончилась'); return j; };

  /** Sessions going on now (to join from a friend's card). */
  app.get('/api/jams', auth, async (req) => listJams().map((j) => {
    const v = jamView(db, j, req.userId!);
    return { id: v.id, host: v.host, members: v.members, track: v.queue[v.index] ?? null, playing: v.playing };
  }));

  /** This listener's session, if any. */
  app.get('/api/jam', auth, async (req) => { const j = jamOf(req.userId!); return j ? jamView(db, j, req.userId!) : null; });

  app.post('/api/jam', auth, async (req) => {
    const b = z.object({ trackIds: z.array(z.string()).max(500).default([]), index: z.number().int().min(0).default(0), positionMs: z.number().min(0).default(0), playing: z.boolean().default(true) }).parse(req.body ?? {});
    return jamView(db, startJam(req.userId!, b.trackIds, b.index, b.positionMs, b.playing), req.userId!);
  });

  /** The session; with `v` it waits (up to 25 s) until it changes past that version. */
  app.get('/api/jam/:id', auth, async (req) => {
    const j = jamOrThrow((req.params as any).id);
    if (!j.members.has(req.userId!)) throw forbidden('Вы не в этой сессии');
    j.members.set(req.userId!, Date.now());
    const v = Number((req.query as any)?.v);
    if (Number.isFinite(v)) await waitJam(j, v, 25_000);
    const now = getJam(j.id);
    if (!now || !now.members.has(req.userId!)) return null;
    now.members.set(req.userId!, Date.now());
    return jamView(db, now, req.userId!);
  });

  app.post('/api/jam/:id/join', auth, async (req) => {
    const j = jamOrThrow((req.params as any).id);
    joinJam(j, req.userId!);
    return jamView(db, j, req.userId!);
  });

  app.post('/api/jam/leave', auth, async (req) => { leaveJam(req.userId!); return { ok: true }; });

  app.post('/api/jam/:id/op', auth, async (req) => {
    const j = jamOrThrow((req.params as any).id);
    if (!j.members.has(req.userId!)) throw forbidden('Вы не в этой сессии');
    const o = z.discriminatedUnion('op', [
      z.object({ op: z.literal('play') }), z.object({ op: z.literal('pause') }),
      z.object({ op: z.literal('seek'), positionMs: z.number().min(0) }),
      z.object({ op: z.literal('skip'), index: z.number().int().min(0) }),
      z.object({ op: z.literal('next') }), z.object({ op: z.literal('prev') }),
      z.object({ op: z.literal('add'), trackIds: z.array(z.string()).min(1).max(200), next: z.boolean().optional() }),
      z.object({ op: z.literal('remove'), index: z.number().int().min(0) }),
      z.object({ op: z.literal('move'), from: z.number().int().min(0), to: z.number().int().min(0) }),
      z.object({ op: z.literal('replace'), trackIds: z.array(z.string()).min(1).max(500), index: z.number().int().min(0), positionMs: z.number().min(0).optional() }),
    ]).parse(req.body ?? {}) as JamOp;
    applyJam(j, req.userId!, o);
    return jamView(db, j, req.userId!);
  });
}
