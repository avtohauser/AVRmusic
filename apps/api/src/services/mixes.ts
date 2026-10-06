// Playlists the server fills by rules:
//  - daily mixes: one per side of the listener's taste (their most played genres), a random pick of that
//    genre from the whole library with a few favourites in it — made and refreshed every day for everyone
//    who listened lately; they live on the home screen, not in the library list;
//  - smart playlists: the listener sets the rules (genres, artists, years, liked, not played for a while…),
//    the server keeps the playlist matching them, refilled every few hours.
import { z } from 'zod';
import type { SmartRules } from '@avrmusic/shared';
import type { DB } from '../lib/db.js';
import { createPlaylist } from './playlists.js';
import { autoFillers, replaceAuto } from './blend.js';

const HOUR = 3600_000;
const MIXES = 5;

/* ---------- daily mixes ---------- */

/** The listener's most played genres lately (each a mix). */
function topGenres(db: DB, userId: string): string[] {
  return (db.prepare(`SELECT t.genre g, COUNT(*) n FROM plays p JOIN tracks t ON t.id = p.track_id
    WHERE p.user_id = ? AND p.ms_played >= 30000 AND p.played_at > datetime('now','-120 days') AND COALESCE(t.genre, '') <> ''
    GROUP BY t.genre HAVING n >= 5 ORDER BY n DESC LIMIT ?`).all(userId, MIXES) as any[]).map((r) => r.g as string);
}

/**
 * A fresh random pick of the genre from the whole library each day — about forty songs, roughly one in
 * four a favourite (played or liked), the rest anything of that genre, heard or not.
 */
function fillMix(db: DB, playlistId: string, userId: string, rules: { genre?: string }) {
  const genre = rules.genre;
  if (!genre) return;
  const SIZE = 40;
  const loved = (db.prepare(`SELECT DISTINCT t.id FROM tracks t
    WHERE t.genre = ? AND (t.id IN (SELECT track_id FROM plays WHERE user_id = ? AND ms_played >= 30000)
      OR t.id IN (SELECT entity_id FROM likes WHERE user_id = ? AND entity_type = 'track'))
    ORDER BY RANDOM() LIMIT ?`).all(genre, userId, userId, Math.round(SIZE / 4)) as any[]).map((r) => r.id as string);
  // the rest is pure chance — but not what played here in the last two days
  const random = (db.prepare(`SELECT t.id FROM tracks t WHERE t.genre = ?
      AND t.id NOT IN (SELECT track_id FROM plays WHERE user_id = ? AND played_at > datetime('now','-2 days'))
    ORDER BY RANDOM() LIMIT ?`).all(genre, userId, SIZE) as any[]).map((r) => r.id as string).filter((id) => !loved.includes(id));
  const picked: string[] = [];
  while ((loved.length || random.length) && picked.length < SIZE) {
    picked.push(...random.splice(0, 3));
    if (loved.length) picked.push(loved.shift()!);
  }
  replaceAuto(db, playlistId, picked.slice(0, SIZE).map((id) => ({ id, by: null })));
}

/** Makes the listener's daily mixes match their taste now: one per top genre, the stale ones go. */
export function ensureMixes(db: DB, userId: string): string[] {
  const genres = topGenres(db, userId);
  const have = db.prepare(`SELECT id, auto_rules, auto_at FROM playlists WHERE owner_id = ? AND auto_kind = 'mix'`).all(userId) as any[];
  const byGenre = new Map(have.map((h) => [(JSON.parse(h.auto_rules || '{}') as { genre?: string }).genre, h]));
  const keep: string[] = [];
  genres.forEach((genre) => {
    const old = byGenre.get(genre);
    if (old) {
      keep.push(old.id);
      if (!old.auto_at || Date.parse(old.auto_at) < Date.now() - 22 * HOUR) fillMix(db, old.id, userId, { genre });
      return;
    }
    const id = createPlaylist(db, userId, { title: `Микс дня · ${genre}`, description: `Любимое и новое в жанре ${genre} — обновляется каждый день`, isPublic: false });
    db.prepare("UPDATE playlists SET auto_kind = 'mix', auto_rules = ? WHERE id = ?").run(JSON.stringify({ genre }), id);
    fillMix(db, id, userId, { genre });
    keep.push(id);
  });
  for (const h of have) if (!keep.includes(h.id)) db.prepare('DELETE FROM playlists WHERE id = ?').run(h.id);
  return keep;
}

/** The listener's daily mixes as they are (made the first time). */
export function mixesOf(db: DB, userId: string): string[] {
  const ids = (db.prepare(`SELECT id FROM playlists WHERE owner_id = ? AND auto_kind = 'mix' ORDER BY created_at`).all(userId) as any[]).map((r) => r.id as string);
  return ids.length ? ids : ensureMixes(db, userId);
}

/* ---------- smart playlists ---------- */

export const smartRulesSchema = z.object({
  genres: z.array(z.string().max(80)).max(30).optional(),
  artists: z.array(z.string().max(40)).max(50).optional(),
  yearFrom: z.number().int().min(1900).max(2100).nullish(),
  yearTo: z.number().int().min(1900).max(2100).nullish(),
  addedDays: z.number().int().min(1).max(3650).nullish(),
  liked: z.boolean().optional(),
  notPlayedDays: z.number().int().min(1).max(3650).nullish(),
  minPlays: z.number().int().min(1).max(1000).nullish(),
  noExplicit: z.boolean().optional(),
  sort: z.enum(['random', 'recent', 'popular', 'mostPlayed', 'newest']).default('random'),
  limit: z.number().int().min(5).max(500).default(100),
});

/** The tracks matching the rules, for their owner. */
export function smartTracks(db: DB, ownerId: string, rules: SmartRules): string[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const list = (n: number) => Array.from({ length: n }, () => '?').join(',');
  if (rules.genres?.length) { where.push(`t.genre IN (${list(rules.genres.length)})`); params.push(...rules.genres); }
  if (rules.artists?.length) {
    where.push(`(t.artist_id IN (${list(rules.artists.length)}) OR t.id IN (SELECT track_id FROM track_artists WHERE artist_id IN (${list(rules.artists.length)})))`);
    params.push(...rules.artists, ...rules.artists);
  }
  if (rules.yearFrom) { where.push('al.year >= ?'); params.push(rules.yearFrom); }
  if (rules.yearTo) { where.push('al.year <= ?'); params.push(rules.yearTo); }
  if (rules.addedDays) { where.push(`t.created_at > datetime('now', ?)`); params.push(`-${rules.addedDays} days`); }
  if (rules.liked) { where.push(`t.id IN (SELECT entity_id FROM likes WHERE user_id = ? AND entity_type = 'track')`); params.push(ownerId); }
  if (rules.notPlayedDays) { where.push(`t.id NOT IN (SELECT track_id FROM plays WHERE user_id = ? AND played_at > datetime('now', ?))`); params.push(ownerId, `-${rules.notPlayedDays} days`); }
  if (rules.minPlays) { where.push(`(SELECT COUNT(*) FROM plays WHERE user_id = ? AND track_id = t.id AND ms_played >= 30000) >= ?`); params.push(ownerId, rules.minPlays); }
  if (rules.noExplicit) where.push('t.explicit = 0');
  const order = ({
    recent: 't.created_at DESC',
    popular: 't.play_count DESC, RANDOM()',
    newest: 'al.year DESC, t.created_at DESC',
    mostPlayed: '(SELECT COUNT(*) FROM plays WHERE user_id = ? AND track_id = t.id) DESC, RANDOM()',
    random: 'RANDOM()',
  } as const)[rules.sort ?? 'random'];
  if (rules.sort === 'mostPlayed') params.push(ownerId);
  params.push(rules.limit ?? 100);
  return (db.prepare(`SELECT t.id FROM tracks t LEFT JOIN albums al ON al.id = t.album_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ?`).all(...params) as any[]).map((r) => r.id as string);
}

function fillSmart(db: DB, playlistId: string, ownerId: string, rules: SmartRules) {
  replaceAuto(db, playlistId, smartTracks(db, ownerId, rules).map((id) => ({ id, by: null })));
}

export function createSmart(db: DB, userId: string, title: string, rules: SmartRules): string {
  const id = createPlaylist(db, userId, { title, description: 'Умный плейлист — собирается сам по вашим правилам', isPublic: false });
  db.prepare("UPDATE playlists SET auto_kind = 'smart', auto_rules = ? WHERE id = ?").run(JSON.stringify(rules), id);
  fillSmart(db, id, userId, rules);
  return id;
}

export function setSmartRules(db: DB, playlistId: string, rules: SmartRules) {
  const p = db.prepare('SELECT owner_id FROM playlists WHERE id = ?').get(playlistId) as any;
  db.prepare('UPDATE playlists SET auto_rules = ? WHERE id = ?').run(JSON.stringify(rules), playlistId);
  fillSmart(db, playlistId, p.owner_id, rules);
}

// the auto-playlist refresher fills these too: mixes every day, smart playlists every six hours
autoFillers.set('mix', { every: 22 * HOUR, fill: (db, id, owner, rules) => fillMix(db, id, owner, rules) });
autoFillers.set('smart', { every: 6 * HOUR, fill: (db, id, owner, rules) => fillSmart(db, id, owner, rules) });

/** Once a day: daily mixes for everyone who listened in the last two weeks. */
export function startMixes(db: DB) {
  const tick = () => {
    try {
      const users = (db.prepare(`SELECT DISTINCT user_id FROM plays WHERE played_at > datetime('now','-14 days')`).all() as any[]).map((r) => r.user_id as string);
      for (const u of users) ensureMixes(db, u);
    } catch { /* tried again later */ }
  };
  setTimeout(tick, 10 * 60_000).unref();
  setInterval(tick, 6 * HOUR).unref();
}
