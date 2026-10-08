// Friends: who is on the server and what they play right now, their pages and how close their taste is,
// things sent to each other, reactions at a moment of a track, "listen together" sessions and the
// listener's recap.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { resolveDigest } from '../services/digest.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/util.js';
import { enqueue } from '../services/jobs.js';
import { ALBUM_FROM, ALBUM_SELECT, avatarUrl, getTrack, mapAlbumSummary, mapArtistSummary } from '../services/library.js';
import { PLAYLIST_FROM, PLAYLIST_SELECT, mapPlaylistSummary } from '../services/playlists.js';
import { applyJam, friendRef, getJam, jamOf, jamView, joinJam, leaveJam, listJams, nowPlaying, nowVersionOf, setNowPlaying, startJam, waitJam, waitNow, type JamOp } from '../services/social.js';
import { compatibility, profileStats, recap } from '../services/stats.js';
import { getGame } from '../services/game.js';
import { badgesOf } from '../services/badges.js';
import { lastfmNowPlaying } from '../services/lastfm.js';
import { tgSync } from '../services/tgProfile.js';

export default async function socialRoutes(app: FastifyInstance) {
  const db = app.db;
  const auth = { preHandler: app.authenticate };

  const userRow = (id: string) => db.prepare('SELECT id, username, display_name, avatar_path, created_at, last_seen_at, disabled FROM users WHERE id = ?').get(id) as any;
  const person = (u: any, viewer: string) => {
    const jam = jamOf(u.id);
    return {
      id: u.id, username: u.username, displayName: u.display_name, avatarUrl: avatarUrl(u.avatar_path),
      lastSeenAt: u.last_seen_at ?? null, now: nowPlaying(db, u.id, viewer), jamId: jam?.id ?? null,
      badges: badgesOf(db, u.id),
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

  /** Listening along: what a friend plays now; with `v` it waits (up to 25 s) until that changes. */
  app.get('/api/users/:id/now', auth, async (req) => {
    const id = (req.params as any).id as string;
    if (!userRow(id)) throw notFound('Пользователь не найден');
    const v = Number((req.query as any)?.v);
    if (Number.isFinite(v)) await waitNow(id, v, 25_000);
    return { version: nowVersionOf(id), now: nowPlaying(db, id, req.userId!), serverNow: Date.now() };
  });

  app.get('/api/users/:id/compat', auth, async (req) => compatibility(db, req.userId!, (req.params as any).id, req.userId!));

  /** What this listener plays now (sent on every change and every 15 s while playing). */
  app.post('/api/me/now', auth, async (req) => {
    const b = z.object({ trackId: z.string().nullable(), positionMs: z.number().min(0).default(0), playing: z.boolean().default(false) }).parse(req.body ?? {});
    setNowPlaying(req.userId!, b.trackId, b.positionMs, b.playing);
    lastfmNowPlaying(db, req.userId!, b.trackId, b.playing);
    tgSync(db, req.userId!);
    return { ok: true };
  });

  /** The listener's recap of a month or a year (offset 1 = the previous one); tz = minutes east of UTC. */
  app.get('/api/me/recap', auth, async (req) => {
    const q = z.object({ period: z.enum(['month', 'year']).default('month'), offset: z.coerce.number().int().min(0).max(20).default(0), tz: z.coerce.number().int().min(-840).max(840).default(0) }).parse(req.query ?? {});
    return recap(db, req.userId!, q.period, q.offset, q.tz);
  });

  /* ---------- sending things to friends ---------- */

  const resolveRef = (kind: string, refId: string, viewer: string, message = ''): any => {
    switch (kind) {
      // a new release announced by the server: what the catalogue said, and the library album once it is fetched
      case 'release': {
        let info: any = {};
        try { info = JSON.parse(message); } catch { /* old */ }
        const lib = db.prepare('SELECT id FROM albums WHERE deezer_id = ?').get(Number(refId)) as any;
        return { id: Number(refId), title: info.title ?? '', artist: info.artist ?? '', coverUrl: info.coverUrl ?? null, type: info.type ?? 'album', year: info.year ?? null, libraryAlbumId: lib?.id ?? null };
      }
      case 'report': return getTrack(db, refId, viewer);
      // the Sunday digest of the company's week
      case 'digest': return resolveDigest(db, message, viewer);
      // a concert of an artist the listener follows, in their city
      case 'concert': { try { return JSON.parse(message); } catch { return null; } }
      case 'track': return getTrack(db, refId, viewer);
      case 'album': { const r = db.prepare(`SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE al.id = ?`).get(refId); return r ? mapAlbumSummary(r) : null; }
      case 'artist': { const r = db.prepare('SELECT id, name, image_path FROM artists WHERE id = ?').get(refId); return r ? mapArtistSummary(r) : null; }
      case 'playlist': { const r = db.prepare(`SELECT ${PLAYLIST_SELECT} ${PLAYLIST_FROM} WHERE p.id = ?`).get(refId) as any; return r ? mapPlaylistSummary(db, r, viewer) : null; }
      // an invitation to listen together: gone once the session ends
      // a badge the admin gave
      case 'badge': return db.prepare('SELECT id, title, emoji, color, description FROM badges WHERE id = ?').get(refId) ?? null;
      // an invitation to a game of "guess the melody": gone once it ends
      case 'game': { const g = getGame(refId); if (!g || g.state === 'done') return null; return { id: g.id, host: friendRef(db, g.hostId), players: g.players.size, state: g.state, rounds: g.rounds }; }
      case 'jam': { const j = getJam(refId); if (!j) return null; const v = jamView(db, j, viewer); return { id: v.id, host: v.host, members: v.members, track: v.queue[v.index] ?? null, playing: v.playing }; }
      default: return null;
    }
  };
  const mapShare = (r: any, viewer: string) => ({
    id: r.id, from: r.from_user ? friendRef(db, r.from_user) : null, kind: r.kind, refId: r.ref_id, item: resolveRef(r.kind, r.ref_id, viewer, r.message),
    message: ['release', 'digest', 'concert'].includes(r.kind) ? r.kind : r.message, seen: !!r.seen, createdAt: r.created_at,
  });

  app.post('/api/shares', auth, async (req) => {
    const b = z.object({
      to: z.array(z.string()).min(1).max(20),
      kind: z.enum(['track', 'album', 'artist', 'playlist', 'jam', 'game']),
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

  /* ---------- reports of wrong tracks ---------- */

  const REASONS = ['wrong', 'quality', 'cut', 'other'] as const;
  const resolveTrack = (id: string): string | null => {
    if (id.startsWith('dz:')) return (db.prepare('SELECT id FROM tracks WHERE deezer_id = ?').get(Number(id.slice(3))) as any)?.id ?? null;
    return db.prepare('SELECT 1 FROM tracks WHERE id = ?').get(id) ? id : null;
  };

  /** "Не та версия", "плохой звук", "обрезан": the admin sees it and fetches the track again in one tap. */
  app.post('/api/tracks/:id/report', auth, async (req) => {
    const trackId = resolveTrack((req.params as any).id);
    if (!trackId) throw notFound('Трек не найден');
    const b = z.object({ reason: z.enum(REASONS), note: z.string().trim().max(500).default('') }).parse(req.body ?? {});
    const open = db.prepare("SELECT id FROM track_reports WHERE track_id = ? AND user_id = ? AND status = 'open'").get(trackId, req.userId!) as any;
    if (open) { db.prepare('UPDATE track_reports SET reason = ?, note = ? WHERE id = ?').run(b.reason, b.note, open.id); return { ok: true }; }
    db.prepare('INSERT INTO track_reports (id, track_id, user_id, reason, note) VALUES (?,?,?,?,?)').run(newId(), trackId, req.userId!, b.reason, b.note);
    // the admins get a notification
    for (const a of db.prepare("SELECT id FROM users WHERE role = 'admin' AND disabled = 0 AND id <> ?").all(req.userId!) as any[]) {
      db.prepare('INSERT INTO shares (id, from_user, to_user, kind, ref_id, message) VALUES (?,?,?,?,?,?)').run(newId(), req.userId!, a.id, 'report', trackId, b.reason);
    }
    return { ok: true };
  });

  app.get('/api/admin/reports', { preHandler: app.requireAdmin }, async (req) => {
    const rows = db.prepare(`SELECT r.*, u.display_name reporter FROM track_reports r LEFT JOIN users u ON u.id = r.user_id
      WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 200`).all() as any[];
    return rows.map((r) => ({ id: r.id, reason: r.reason, note: r.note, createdAt: r.created_at, reporter: r.reporter ?? null, track: getTrack(db, r.track_id, req.userId) })).filter((r) => r.track);
  });

  /** Fetch the reported track again (another source); the report is closed. */
  app.post('/api/admin/reports/:id/refetch', { preHandler: app.requireAdmin }, async (req) => {
    const r = db.prepare('SELECT * FROM track_reports WHERE id = ?').get((req.params as any).id) as any;
    if (!r) throw notFound('Жалоба не найдена');
    const t = db.prepare('SELECT t.title, a.name artist FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE t.id = ?').get(r.track_id) as any;
    const job = enqueue({ kind: 'acquire', title: `Перекачать: ${t?.artist ?? ''} — ${t?.title ?? ''}`, requestedBy: req.userId }, { kind: 'refetch', trackIds: [r.track_id] });
    db.prepare("UPDATE track_reports SET status = 'fixed', resolved_at = ? WHERE track_id = ? AND status = 'open'").run(new Date().toISOString(), r.track_id);
    return { jobId: job.id };
  });

  app.post('/api/admin/reports/:id/dismiss', { preHandler: app.requireAdmin }, async (req) => {
    db.prepare("UPDATE track_reports SET status = 'dismissed', resolved_at = ? WHERE id = ?").run(new Date().toISOString(), (req.params as any).id);
    return { ok: true };
  });

  /* ---------- following catalogue artists (new releases) ---------- */

  app.get('/api/me/follows', auth, async (req) =>
    (db.prepare('SELECT deezer_artist_id id, name, created_at FROM artist_follows WHERE user_id = ? ORDER BY created_at DESC').all(req.userId!) as any[]));

  app.put('/api/catalog/artists/:id/follow', auth, async (req) => {
    const id = Number((req.params as any).id);
    const b = z.object({ name: z.string().max(200).default('') }).parse(req.body ?? {});
    db.prepare('INSERT OR IGNORE INTO artist_follows (user_id, deezer_artist_id, name) VALUES (?,?,?)').run(req.userId!, id, b.name);
    return { following: true };
  });

  app.delete('/api/catalog/artists/:id/follow', auth, async (req) => {
    db.prepare('DELETE FROM artist_follows WHERE user_id = ? AND deezer_artist_id = ?').run(req.userId!, Number((req.params as any).id));
    return { following: false };
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
      z.object({ op: z.literal('suggest'), trackIds: z.array(z.string()).min(1).max(20) }),
      z.object({ op: z.literal('vote'), trackId: z.string().min(1), up: z.boolean() }),
    ]).parse(req.body ?? {}) as JamOp;
    if (o.op === 'suggest') o.trackIds = o.trackIds.filter((id) => getTrack(db, id, req.userId!));
    applyJam(j, req.userId!, o);
    return jamView(db, j, req.userId!);
  });
}
