import type { DB } from '../lib/db.js';
import type { FriendRef, Playlist, PlaylistSummary, Track } from '@avrmusic/shared';
import { TRACK_FROM, TRACK_SELECT, avatarUrl, coverUrl, isLiked, mapTracks } from './library.js';
import { newId } from '../lib/util.js';
import { nowIso } from '../lib/db.js';
import { forbidden, notFound } from '../lib/errors.js';

export const PLAYLIST_SELECT = `
  p.id, p.title, p.description, p.cover_path, p.is_public, p.created_at, p.updated_at, p.auto_kind, p.auto_at, p.auto_rules,
  u.id AS owner_id, u.username AS owner_username, u.display_name AS owner_name,
  (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count,
  (SELECT COALESCE(SUM(t.duration_ms),0) FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id WHERE pt.playlist_id = p.id) AS duration_ms
`;
export const PLAYLIST_FROM = `FROM playlists p JOIN users u ON u.id = p.owner_id`;

export function mosaicFor(db: DB, playlistId: string): string[] {
  const rows = db
    .prepare(`SELECT COALESCE(t.cover_path, al.cover_path) c FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id LEFT JOIN albums al ON al.id = t.album_id WHERE pt.playlist_id = ? AND COALESCE(t.cover_path, al.cover_path) IS NOT NULL ORDER BY pt.position LIMIT 4`)
    .all(playlistId) as any[];
  return rows.map((r) => coverUrl(r.c)!).filter(Boolean);
}

export function mapPlaylistSummary(db: DB, r: any, userId?: string | null): PlaylistSummary & { mosaic: string[] } {
  const s: PlaylistSummary & { mosaic: string[] } = {
    id: r.id,
    title: r.title,
    description: r.description,
    coverUrl: coverUrl(r.cover_path),
    isPublic: !!r.is_public,
    owner: { id: r.owner_id, username: r.owner_username, displayName: r.owner_name },
    trackCount: r.track_count,
    durationMs: r.duration_ms,
    updatedAt: r.updated_at,
    mosaic: mosaicFor(db, r.id),
    autoKind: r.auto_kind ?? null,
    ...(r.auto_kind === 'smart' && r.auto_rules ? { autoRules: JSON.parse(r.auto_rules) } : {}),
  };
  if (userId) {
    s.liked = isLiked(db, userId, 'playlist', r.id);
    // everyone who keeps a playlist together owns it; only its creator can delete it
    s.isCreator = r.owner_id === userId;
    s.isOwner = s.isCreator || isMember(db, r.id, userId);
    s.canEdit = s.isOwner;
  }
  return s;
}

/** People who may edit a playlist besides its owner. */
export function playlistMembers(db: DB, playlistId: string): FriendRef[] {
  return (db.prepare(`SELECT u.id, u.display_name, u.avatar_path FROM playlist_members m JOIN users u ON u.id = m.user_id WHERE m.playlist_id = ? ORDER BY m.added_at`).all(playlistId) as any[])
    .map((u) => ({ id: u.id, displayName: u.display_name, avatarUrl: avatarUrl(u.avatar_path) }));
}

export function isMember(db: DB, playlistId: string, userId?: string | null): boolean {
  return !!userId && !!db.prepare('SELECT 1 FROM playlist_members WHERE playlist_id = ? AND user_id = ?').get(playlistId, userId);
}

export function getPlaylist(db: DB, id: string, userId?: string | null): Playlist | null {
  const r = db.prepare(`SELECT ${PLAYLIST_SELECT} ${PLAYLIST_FROM} WHERE p.id = ?`).get(id) as any;
  if (!r) return null;
  const member = isMember(db, id, userId);
  if (!r.is_public && r.owner_id !== userId && !member) throw forbidden('Плейлист приватный');
  const rows = db
    .prepare(`SELECT ${TRACK_SELECT}, pt.added_at, pt.added_by ${TRACK_FROM} JOIN playlist_tracks pt ON pt.track_id = t.id WHERE pt.playlist_id = ? ORDER BY pt.position`)
    .all(id) as any[];
  const members = playlistMembers(db, id);
  const tracks = mapTracks(db, rows, userId);
  // who put each track in, when the playlist is edited together
  if (members.length) {
    const people = new Map<string, FriendRef>();
    for (const u of db.prepare('SELECT id, display_name, avatar_path FROM users').all() as any[]) people.set(u.id, { id: u.id, displayName: u.display_name, avatarUrl: avatarUrl(u.avatar_path) });
    tracks.forEach((t, i) => { t.addedBy = rows[i].added_by ? people.get(rows[i].added_by) ?? null : null; });
  }
  const creator = db.prepare('SELECT id, display_name, avatar_path FROM users WHERE id = ?').get(r.owner_id) as any;
  const owners: FriendRef[] = [...(creator ? [{ id: creator.id, displayName: creator.display_name, avatarUrl: avatarUrl(creator.avatar_path) }] : []), ...members];
  return { ...mapPlaylistSummary(db, r, userId), tracks, members, owners, canEdit: !!userId && (r.owner_id === userId || member) };
}

export function listUserPlaylists(db: DB, userId: string): PlaylistSummary[] {
  const rows = db
    .prepare(`SELECT ${PLAYLIST_SELECT} ${PLAYLIST_FROM} WHERE (p.owner_id = ? OR p.id IN (SELECT entity_id FROM likes WHERE user_id = ? AND entity_type = 'playlist') OR p.id IN (SELECT playlist_id FROM playlist_members WHERE user_id = ?)) AND COALESCE(p.auto_kind, '') <> 'mix' ORDER BY p.updated_at DESC`)
    .all(userId, userId, userId) as any[];
  return rows.map((r) => mapPlaylistSummary(db, r, userId));
}

export function listPublicPlaylists(db: DB, userId: string | null, limit = 20): PlaylistSummary[] {
  const rows = db
    .prepare(`SELECT ${PLAYLIST_SELECT} ${PLAYLIST_FROM} WHERE p.is_public = 1 AND (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) > 0 ORDER BY (SELECT COUNT(*) FROM likes l WHERE l.entity_type='playlist' AND l.entity_id=p.id) DESC, p.updated_at DESC LIMIT ?`)
    .all(limit) as any[];
  return rows.map((r) => mapPlaylistSummary(db, r, userId));
}

export function createPlaylist(db: DB, ownerId: string, data: { title: string; description?: string | null; isPublic?: boolean }): string {
  const id = newId();
  db.prepare(`INSERT INTO playlists(id, owner_id, title, description, is_public) VALUES (?,?,?,?,?)`).run(id, ownerId, data.title, data.description ?? null, data.isPublic === false ? 0 : 1);
  return id;
}

export function assertOwner(db: DB, playlistId: string, userId: string, role: string): any {
  const p = db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId) as any;
  if (!p) throw notFound('Плейлист не найден');
  if (p.owner_id !== userId && role !== 'admin') throw forbidden('Это не ваш плейлист');
  return p;
}

/** The owner, a member (a playlist edited together) or an admin may change its tracks. */
export function assertCanEdit(db: DB, playlistId: string, userId: string, role: string): any {
  const p = db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId) as any;
  if (!p) throw notFound('Плейлист не найден');
  if (p.owner_id !== userId && role !== 'admin' && !isMember(db, playlistId, userId)) throw forbidden('Это не ваш плейлист');
  return p;
}

export function touch(db: DB, playlistId: string) {
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(nowIso(), playlistId);
}

export function addTracks(db: DB, playlistId: string, trackIds: string[], userId: string): number {
  const maxPos = (db.prepare('SELECT COALESCE(MAX(position), -1) m FROM playlist_tracks WHERE playlist_id = ?').get(playlistId) as any).m as number;
  const ins = db.prepare('INSERT OR IGNORE INTO playlist_tracks(playlist_id, track_id, position, added_by) VALUES (?,?,?,?)');
  const exists = db.prepare('SELECT 1 FROM tracks WHERE id = ?');
  let added = 0;
  const tx = db.transaction(() => {
    let pos = maxPos + 1;
    for (const tid of trackIds) {
      if (!exists.get(tid)) continue;
      const r = ins.run(playlistId, tid, pos, userId);
      if (r.changes) { added++; pos++; }
    }
    touch(db, playlistId);
  });
  tx();
  return added;
}

export function removeTrack(db: DB, playlistId: string, trackId: string) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlistId, trackId);
    renumber(db, playlistId);
    touch(db, playlistId);
  });
  tx();
}

export function reorder(db: DB, playlistId: string, trackIds: string[]) {
  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?');
    trackIds.forEach((tid, i) => upd.run(i, playlistId, tid));
    renumber(db, playlistId);
    touch(db, playlistId);
  });
  tx();
}

function renumber(db: DB, playlistId: string) {
  const rows = db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position, added_at').all(playlistId) as any[];
  const upd = db.prepare('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?');
  rows.forEach((r, i) => upd.run(i, playlistId, r.track_id));
}

export function likedTracks(db: DB, userId: string): Track[] {
  const rows = db
    .prepare(`SELECT ${TRACK_SELECT}, l.created_at AS added_at ${TRACK_FROM} JOIN likes l ON l.entity_id = t.id AND l.entity_type = 'track' WHERE l.user_id = ? ORDER BY l.created_at DESC`)
    .all(userId) as any[];
  return mapTracks(db, rows, userId);
}
