// Playlists the server fills itself:
//  - a blend: a playlist of several owners filled from each owner's taste (their most played and liked
//    tracks, songs they share first), refreshed every day; tracks the owners add by hand stay;
//  - the release radar: a listener's own playlist of fresh tracks by the artists they like, follow
//    or listen to, refreshed every week.
import type { DB } from '../lib/db.js';
import { newId } from '../lib/util.js';
import { createPlaylist, touch } from './playlists.js';

const HOUR = 3600_000;

/** Each owner's favourites: weight by plays in the last three months plus likes. */
function tasteOf(db: DB, userId: string, limit: number): string[] {
  return (db.prepare(`SELECT t.id, COALESCE(p.n, 0) * 1.0 + CASE WHEN l.entity_id IS NOT NULL THEN 4 ELSE 0 END AS w
    FROM tracks t
    LEFT JOIN (SELECT track_id, COUNT(*) n FROM plays WHERE user_id = ? AND ms_played >= 30000 AND played_at > datetime('now','-90 days') GROUP BY track_id) p ON p.track_id = t.id
    LEFT JOIN likes l ON l.entity_id = t.id AND l.entity_type = 'track' AND l.user_id = ?
    WHERE p.n IS NOT NULL OR l.entity_id IS NOT NULL
    ORDER BY w DESC, RANDOM() LIMIT ?`).all(userId, userId, limit) as any[]).map((r) => r.id as string);
}

export function playlistOwners(db: DB, playlistId: string): string[] {
  const p = db.prepare('SELECT owner_id FROM playlists WHERE id = ?').get(playlistId) as any;
  if (!p) return [];
  const members = (db.prepare('SELECT user_id FROM playlist_members WHERE playlist_id = ? ORDER BY added_at').all(playlistId) as any[]).map((r) => r.user_id as string);
  return [p.owner_id, ...members.filter((m) => m !== p.owner_id)];
}

/** Fills a blend anew: shared favourites first, then each owner's in turn (about 50 tracks). */
export function fillBlend(db: DB, playlistId: string, size = 50) {
  const owners = playlistOwners(db, playlistId);
  if (!owners.length) return;
  const tastes = owners.map((u) => ({ u, ids: tasteOf(db, u, 120) }));
  const count = new Map<string, number>();
  tastes.forEach((t) => t.ids.forEach((id) => count.set(id, (count.get(id) ?? 0) + 1)));
  const picked: Array<{ id: string; by: string }> = [];
  const seen = new Set<string>();
  // songs two or more owners love
  for (const t of tastes) for (const id of t.ids) {
    if ((count.get(id) ?? 0) >= 2 && !seen.has(id) && picked.length < size / 3) { seen.add(id); picked.push({ id, by: t.u }); }
  }
  // then each owner's in turn, a fair share each
  const cursors = tastes.map(() => 0);
  while (picked.length < size) {
    let progressed = false;
    tastes.forEach((t, i) => {
      while (cursors[i] < t.ids.length && seen.has(t.ids[cursors[i]])) cursors[i]++;
      if (cursors[i] < t.ids.length && picked.length < size) { const id = t.ids[cursors[i]++]; seen.add(id); picked.push({ id, by: t.u }); progressed = true; }
    });
    if (!progressed) break;
  }
  // a gentle shuffle so it does not play owner by owner
  for (let i = picked.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [picked[i], picked[j]] = [picked[j], picked[i]]; }
  replaceAuto(db, playlistId, picked);
}

/** Puts new server-chosen tracks in place of the old ones; tracks added by hand stay first. */
export function replaceAuto(db: DB, playlistId: string, picked: Array<{ id: string; by: string | null }>) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND auto = 1').run(playlistId);
    const manual = new Set((db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ?').all(playlistId) as any[]).map((r) => r.track_id as string));
    let pos = (db.prepare('SELECT COALESCE(MAX(position), -1) m FROM playlist_tracks WHERE playlist_id = ?').get(playlistId) as any).m + 1;
    const ins = db.prepare('INSERT OR IGNORE INTO playlist_tracks(playlist_id, track_id, position, added_by, auto) VALUES (?,?,?,?,1)');
    for (const p of picked) if (!manual.has(p.id)) ins.run(playlistId, p.id, pos++, p.by);
    db.prepare('UPDATE playlists SET auto_at = ? WHERE id = ?').run(new Date().toISOString(), playlistId);
    touch(db, playlistId);
  });
  tx();
}

/** A new blend of these people: a private playlist they all own, filled at once. */
export function createBlend(db: DB, creatorId: string, friendIds: string[]): string {
  const people = [creatorId, ...friendIds.filter((f) => f !== creatorId)];
  const names = (db.prepare(`SELECT id, display_name FROM users WHERE id IN (${people.map(() => '?').join(',')})`).all(...people) as any[]);
  const nameOf = (id: string) => names.find((n) => n.id === id)?.display_name ?? '';
  const title = `Блендер: ${people.map(nameOf).filter(Boolean).join(' + ')}`.slice(0, 120);
  const id = createPlaylist(db, creatorId, { title, description: 'Смесь ваших вкусов — обновляется каждый день', isPublic: false });
  db.prepare("UPDATE playlists SET auto_kind = 'blend' WHERE id = ?").run(id);
  const ins = db.prepare('INSERT OR IGNORE INTO playlist_members (playlist_id, user_id) VALUES (?, ?)');
  const share = db.prepare('INSERT INTO shares (id, from_user, to_user, kind, ref_id, message) VALUES (?,?,?,?,?,?)');
  for (const f of people.slice(1)) {
    ins.run(id, f);
    share.run(newId(), creatorId, f, 'playlist', id, 'invite');
  }
  fillBlend(db, id);
  return id;
}

/* ---------- release radar ---------- */

/** The listener's release radar playlist (made the first time it is asked for). */
export function radarOf(db: DB, userId: string): string {
  const have = db.prepare("SELECT id FROM playlists WHERE owner_id = ? AND auto_kind = 'radar'").get(userId) as any;
  if (have) return have.id;
  const id = createPlaylist(db, userId, { title: 'Радар новинок', description: 'Свежие треки исполнителей, которых вы слушаете, — обновляется каждую неделю', isPublic: false });
  db.prepare("UPDATE playlists SET auto_kind = 'radar' WHERE id = ?").run(id);
  fillRadar(db, id, userId);
  return id;
}

/** Fresh tracks (added in the last three weeks) by artists the listener likes, follows or plays a lot. */
export function fillRadar(db: DB, playlistId: string, userId: string) {
  const ids = (db.prepare(`SELECT t.id FROM tracks t JOIN artists a ON a.id = t.artist_id
    WHERE t.created_at > datetime('now','-21 days') AND (
      t.artist_id IN (SELECT entity_id FROM likes WHERE user_id = ? AND entity_type = 'artist')
      OR a.deezer_id IN (SELECT deezer_artist_id FROM artist_follows WHERE user_id = ?)
      OR t.artist_id IN (SELECT t2.artist_id FROM plays p JOIN tracks t2 ON t2.id = p.track_id WHERE p.user_id = ? AND p.played_at > datetime('now','-120 days') GROUP BY t2.artist_id ORDER BY COUNT(*) DESC LIMIT 40)
      OR t.id IN (SELECT ta.track_id FROM track_artists ta WHERE ta.artist_id IN (SELECT entity_id FROM likes WHERE user_id = ? AND entity_type = 'artist'))
    )
    AND t.id NOT IN (SELECT track_id FROM plays WHERE user_id = ? AND ms_played >= 30000)
    ORDER BY t.created_at DESC LIMIT 60`).all(userId, userId, userId, userId, userId) as any[]).map((r) => ({ id: r.id as string, by: null }));
  replaceAuto(db, playlistId, ids);
}

/** Other kinds the server fills (daily mixes, smart playlists — services/mixes.ts): how often, and how. */
export const autoFillers = new Map<string, { every: number; fill: (db: DB, playlistId: string, ownerId: string, rules: any) => void }>();
const EVERY: Record<string, number> = { blend: 22 * HOUR, radar: 7 * 24 * HOUR };

/** Refreshes one playlist the server fills. */
export function refreshAuto(db: DB, playlistId: string) {
  const p = db.prepare('SELECT auto_kind, owner_id, auto_rules FROM playlists WHERE id = ?').get(playlistId) as any;
  if (p?.auto_kind === 'blend') fillBlend(db, playlistId);
  else if (p?.auto_kind === 'radar') fillRadar(db, playlistId, p.owner_id);
  else if (p?.auto_kind && autoFillers.has(p.auto_kind)) autoFillers.get(p.auto_kind)!.fill(db, playlistId, p.owner_id, JSON.parse(p.auto_rules || '{}'));
}

/** Blends every day, radars every week, the other kinds as they ask (checked once an hour). */
export function startAutoPlaylists(db: DB) {
  const tick = () => {
    try {
      const rows = db.prepare('SELECT id, auto_kind, auto_at FROM playlists WHERE auto_kind IS NOT NULL').all() as any[];
      for (const r of rows) {
        const every = EVERY[r.auto_kind] ?? autoFillers.get(r.auto_kind)?.every;
        if (every && (!r.auto_at || Date.parse(r.auto_at) < Date.now() - every)) refreshAuto(db, r.id);
      }
    } catch { /* tried again in an hour */ }
  };
  setTimeout(tick, 5 * 60_000).unref();
  setInterval(tick, HOUR).unref();
}
