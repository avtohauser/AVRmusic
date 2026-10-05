import type { DB } from '../lib/db.js';
import type { HomeFeed, HomeSection, Track, AlbumSummary } from '@avrmusic/shared';
import { ALBUM_FROM, ALBUM_SELECT, TRACK_FROM, TRACK_SELECT, listGenres, mapAlbumSummary, mapArtistSummary, mapTracks } from './library.js';
import { listPublicPlaylists, listUserPlaylists } from './playlists.js';
import { shuffle } from '../lib/util.js';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

/** Personalised recommendations: weighted by the user's liked/played genres and artists. */
export function recommendTracks(db: DB, userId: string | null, limit = 20, excludeIds: string[] = []): Track[] {
  if (!userId) {
    const rows = db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} ORDER BY t.play_count DESC, RANDOM() LIMIT ?`).all(limit) as any[];
    return mapTracks(db, rows, null);
  }
  const taste = db
    .prepare(
      `SELECT t.artist_id, t.genre, SUM(w) AS weight FROM (
         SELECT entity_id AS track_id, 3 AS w FROM likes WHERE user_id = @u AND entity_type = 'track'
         UNION ALL
         SELECT track_id, 1 AS w FROM plays WHERE user_id = @u AND played_at > datetime('now','-60 days')
       ) x JOIN tracks t ON t.id = x.track_id GROUP BY t.artist_id, t.genre`,
    )
    .all({ u: userId }) as Array<{ artist_id: string; genre: string | null; weight: number }>;
  const artistW = new Map<string, number>();
  const genreW = new Map<string, number>();
  for (const r of taste) {
    artistW.set(r.artist_id, (artistW.get(r.artist_id) ?? 0) + r.weight);
    if (r.genre) genreW.set(r.genre, (genreW.get(r.genre) ?? 0) + r.weight);
  }
  const heard = new Set<string>([
    ...excludeIds,
    ...(db.prepare(`SELECT track_id FROM plays WHERE user_id = ? AND played_at > datetime('now','-7 days')`).all(userId) as any[]).map((r) => r.track_id),
  ]);
  const candidates = db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} ORDER BY RANDOM() LIMIT 600`).all() as any[];
  const scored = candidates
    .filter((r) => !heard.has(r.id))
    .map((r) => ({ r, s: (artistW.get(r.artist_id) ?? 0) * 2 + (r.genre ? genreW.get(r.genre) ?? 0 : 0) + Math.log1p(r.play_count) * 0.3 + Math.random() }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.r);
  return mapTracks(db, scored, userId);
}

export function recentlyPlayedTracks(db: DB, userId: string, limit = 20): Track[] {
  const rows = db
    .prepare(`SELECT ${TRACK_SELECT}, MAX(p.played_at) AS last ${TRACK_FROM} JOIN plays p ON p.track_id = t.id WHERE p.user_id = ? GROUP BY t.id ORDER BY last DESC LIMIT ?`)
    .all(userId, limit) as any[];
  return mapTracks(db, rows, userId);
}

export function recentAlbums(db: DB, userId: string, limit = 12): AlbumSummary[] {
  const rows = db
    .prepare(`SELECT ${ALBUM_SELECT}, MAX(p.played_at) last ${ALBUM_FROM} JOIN tracks t ON t.album_id = al.id JOIN plays p ON p.track_id = t.id WHERE p.user_id = ? GROUP BY al.id ORDER BY last DESC LIMIT ?`)
    .all(userId, limit) as any[];
  return rows.map(mapAlbumSummary);
}

export function homeFeed(db: DB, userId: string | null): HomeFeed {
  const sections: HomeSection[] = [];
  const quickPicks: HomeFeed['quickPicks'] = [];

  if (userId) {
    const likedCount = (db.prepare(`SELECT COUNT(*) c FROM likes WHERE user_id=? AND entity_type='track'`).get(userId) as any).c;
    quickPicks.push({ id: 'liked', kind: 'liked', title: 'Любимые треки', trackCount: likedCount });
    const ra = recentAlbums(db, userId, 5);
    quickPicks.push(...ra);
    const pls = listUserPlaylists(db, userId).slice(0, Math.max(0, 8 - quickPicks.length));
    quickPicks.push(...pls);

    const recent = recentlyPlayedTracks(db, userId, 12);
    if (recent.length) sections.push({ id: 'recent', title: 'Недавно слушали', kind: 'tracks', items: recent });

    // what kept coming back this week
    const repeatIds = (db.prepare(`SELECT track_id, COUNT(*) n FROM plays WHERE user_id = ? AND played_at > datetime('now','-7 days') AND ms_played >= 30000
      GROUP BY track_id HAVING n >= 2 ORDER BY n DESC, MAX(played_at) DESC LIMIT 20`).all(userId) as any[]).map((r) => r.track_id as string);
    const repeat = byIds(db, repeatIds, userId);
    if (repeat.length >= 3) sections.push({ id: 'repeat', title: 'Повтор недели', subtitle: 'Что крутилось у вас чаще всего', kind: 'tracks', items: repeat });

    // loved once, then left: many plays (or a like) but nothing for a month and a half
    const forgottenIds = (db.prepare(`SELECT t.id, COUNT(p.id) n FROM tracks t LEFT JOIN plays p ON p.track_id = t.id AND p.user_id = ? AND p.ms_played >= 30000
      WHERE t.id IN (SELECT track_id FROM plays WHERE user_id = ? UNION SELECT entity_id FROM likes WHERE user_id = ? AND entity_type = 'track')
      GROUP BY t.id
      HAVING (n >= 4 OR t.id IN (SELECT entity_id FROM likes WHERE user_id = ? AND entity_type = 'track'))
        AND COALESCE(MAX(p.played_at), '') < datetime('now','-45 days')
      ORDER BY n DESC, RANDOM() LIMIT 20`).all(userId, userId, userId, userId) as any[]).map((r) => r.id as string);
    const forgotten = byIds(db, forgottenIds, userId);
    if (forgotten.length >= 3) sections.push({ id: 'forgotten', title: 'Забытые любимые', subtitle: 'Вы много это слушали — давно не возвращались', kind: 'tracks', items: forgotten });

    const rec = recommendTracks(db, userId, 12, recent.map((t) => t.id));
    if (rec.length) sections.push({ id: 'for-you', title: 'Подобрано для вас', subtitle: 'На основе ваших лайков и истории', kind: 'tracks', items: rec });
  }

  const newReleases = db.prepare(`SELECT ${ALBUM_SELECT} ${ALBUM_FROM} ORDER BY al.created_at DESC LIMIT 12`).all().map(mapAlbumSummary);
  if (newReleases.length) sections.push({ id: 'new', title: 'Новые релизы', kind: 'albums', items: newReleases });

  const popular = mapTracks(db, db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} ORDER BY t.play_count DESC, t.created_at DESC LIMIT 12`).all() as any[], userId);
  if (popular.length) sections.push({ id: 'popular', title: 'Популярно сейчас', kind: 'tracks', items: popular });

  const artists = db
    .prepare(`SELECT a.id, a.name, a.image_path FROM artists a ORDER BY (SELECT COALESCE(SUM(play_count),0) FROM tracks t WHERE t.artist_id = a.id) DESC, RANDOM() LIMIT 12`)
    .all()
    .map(mapArtistSummary);
  if (artists.length) sections.push({ id: 'artists', title: 'Исполнители', kind: 'artists', items: artists });

  const publicPls = listPublicPlaylists(db, userId, 12);
  if (publicPls.length) sections.push({ id: 'playlists', title: 'Плейлисты сообщества', kind: 'playlists', items: publicPls });

  const genres = listGenres(db).slice(0, 12);
  if (genres.length) sections.push({ id: 'genres', title: 'Жанры и настроения', kind: 'genres', items: genres });

  const discover = mapTracks(db, shuffle(db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} ORDER BY RANDOM() LIMIT 12`).all() as any[]), userId);
  if (discover.length) sections.push({ id: 'discover', title: 'Открой для себя', subtitle: 'Случайная подборка из библиотеки', kind: 'tracks', items: discover });

  return { greeting: greeting(), quickPicks, sections };
}

/** Tracks by id, in the given order. */
function byIds(db: DB, ids: string[], userId: string): Track[] {
  if (!ids.length) return [];
  const rows = db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} WHERE t.id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
  const map = new Map(mapTracks(db, rows, userId).map((t) => [t.id, t]));
  return ids.map((i) => map.get(i)).filter((t): t is Track => !!t);
}
