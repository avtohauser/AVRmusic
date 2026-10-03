import type { DB } from '../lib/db.js';
import type { Track, AlbumSummary, Album, Artist, ArtistSummary, Genre, Paginated } from '@avrmusic/shared';
import { colorFor, slugify } from '../lib/util.js';

/* ---------- URL helpers ---------- */

export function coverUrl(p: string | null | undefined): string | null {
  return p ? `/media/covers/${p}` : null;
}
export function avatarUrl(p: string | null | undefined): string | null {
  return p ? `/media/avatars/${p}` : null;
}
function canvasKind(mime: string | null): 'video' | 'image' | null {
  if (!mime) return null;
  return mime.startsWith('video/') ? 'video' : 'image';
}

/* ---------- Row -> DTO mapping ---------- */

export const TRACK_SELECT = `
  t.id, t.title, t.track_no, t.disc_no, t.duration_ms, t.explicit, t.genre, t.play_count, t.mime_type, t.file_size,
  t.bitrate, t.sample_rate, t.codec, t.created_at,
  (t.lyrics_plain IS NOT NULL OR t.lyrics_synced IS NOT NULL) AS has_lyrics,
  (t.lyrics_synced IS NOT NULL) AS has_synced,
  t.canvas_path, t.canvas_mime,
  COALESCE(t.cover_path, al.cover_path) AS cover_path,
  ar.id AS artist_id, ar.name AS artist_name, ar.image_path AS artist_image,
  al.id AS album_id, al.title AS album_title, al.year AS album_year
`;
export const TRACK_FROM = `FROM tracks t JOIN artists ar ON ar.id = t.artist_id LEFT JOIN albums al ON al.id = t.album_id`;

export function mapTrack(db: DB, r: any, userId?: string | null, likedSet?: Set<string>): Track {
  const featuring = db
    .prepare(`SELECT a.id, a.name, a.image_path FROM track_artists ta JOIN artists a ON a.id = ta.artist_id WHERE ta.track_id = ? ORDER BY ta.position`)
    .all(r.id)
    .map((a: any) => ({ id: a.id, name: a.name, imageUrl: coverUrl(a.image_path) }));
  const t: Track = {
    id: r.id,
    title: r.title,
    trackNo: r.track_no,
    discNo: r.disc_no,
    durationMs: r.duration_ms,
    explicit: !!r.explicit,
    genre: r.genre,
    playCount: r.play_count,
    mimeType: r.mime_type,
    fileSize: r.file_size,
    bitrate: r.bitrate,
    sampleRate: r.sample_rate,
    codec: r.codec,
    hasLyrics: !!r.has_lyrics,
    hasSyncedLyrics: !!r.has_synced,
    hasCanvas: !!r.canvas_path,
    canvasKind: canvasKind(r.canvas_mime),
    coverUrl: coverUrl(r.cover_path),
    artist: { id: r.artist_id, name: r.artist_name, imageUrl: coverUrl(r.artist_image) },
    featuring,
    album: r.album_id ? { id: r.album_id, title: r.album_title, year: r.album_year } : null,
    createdAt: r.created_at,
  };
  if (r.added_at) t.addedAt = r.added_at;
  if (userId) t.liked = likedSet ? likedSet.has(r.id) : isLiked(db, userId, 'track', r.id);
  return t;
}

export function mapTracks(db: DB, rows: any[], userId?: string | null): Track[] {
  const likedSet = userId ? likedIds(db, userId, 'track', rows.map((r) => r.id)) : undefined;
  return rows.map((r) => mapTrack(db, r, userId, likedSet));
}

export const ALBUM_SELECT = `
  al.id, al.deezer_id, al.title, al.year, al.type, al.cover_path, al.description, al.release_date, al.label, al.created_at,
  ar.id AS artist_id, ar.name AS artist_name, ar.image_path AS artist_image,
  (SELECT COUNT(*) FROM tracks t WHERE t.album_id = al.id) AS track_count,
  (SELECT COALESCE(SUM(duration_ms),0) FROM tracks t WHERE t.album_id = al.id) AS duration_ms
`;
export const ALBUM_FROM = `FROM albums al JOIN artists ar ON ar.id = al.artist_id`;

export function mapAlbumSummary(r: any): AlbumSummary {
  return {
    id: r.id,
    deezerId: r.deezer_id ?? null,
    title: r.title,
    year: r.year,
    type: r.type,
    coverUrl: coverUrl(r.cover_path),
    artist: { id: r.artist_id, name: r.artist_name, imageUrl: coverUrl(r.artist_image) },
    trackCount: r.track_count,
    durationMs: r.duration_ms,
  };
}

export function mapArtistSummary(r: any): ArtistSummary {
  return { id: r.id, name: r.name, imageUrl: coverUrl(r.image_path) };
}

/* ---------- Likes ---------- */

export type LikeType = 'track' | 'album' | 'artist' | 'playlist';

export function isLiked(db: DB, userId: string, type: LikeType, id: string): boolean {
  return !!db.prepare('SELECT 1 FROM likes WHERE user_id=? AND entity_type=? AND entity_id=?').get(userId, type, id);
}

export function likedIds(db: DB, userId: string, type: LikeType, ids: string[]): Set<string> {
  if (!ids.length) return new Set();
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = db
      .prepare(`SELECT entity_id FROM likes WHERE user_id=? AND entity_type=? AND entity_id IN (${chunk.map(() => '?').join(',')})`)
      .all(userId, type, ...chunk) as any[];
    rows.forEach((r) => out.add(r.entity_id));
  }
  return out;
}

/* ---------- Queries ---------- */

export function getTrack(db: DB, id: string, userId?: string | null): Track | null {
  const r = db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} WHERE t.id = ?`).get(id);
  return r ? mapTrack(db, r, userId) : null;
}

export function getTracksByIds(db: DB, ids: string[], userId?: string | null): Track[] {
  if (!ids.length) return [];
  const rows = db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} WHERE t.id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  return mapTracks(db, ordered, userId);
}

export function getTrackRaw(db: DB, id: string): any | null {
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) ?? null;
}

export function listAlbums(db: DB, opts: { offset?: number; limit?: number; sort?: 'new' | 'title' | 'popular' | 'year'; artistId?: string; type?: string } = {}): Paginated<AlbumSummary> {
  const { offset = 0, limit = 50, sort = 'new', artistId, type } = opts;
  const where: string[] = [];
  const params: any[] = [];
  if (artistId) { where.push('al.artist_id = ?'); params.push(artistId); }
  if (type) { where.push('al.type = ?'); params.push(type); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order =
    sort === 'title' ? 'al.title COLLATE NOCASE' :
    sort === 'year' ? 'al.year DESC NULLS LAST, al.created_at DESC' :
    sort === 'popular' ? '(SELECT COALESCE(SUM(play_count),0) FROM tracks t WHERE t.album_id = al.id) DESC' :
    'al.created_at DESC';
  const total = (db.prepare(`SELECT COUNT(*) c ${ALBUM_FROM} ${w}`).get(...params) as any).c;
  const rows = db.prepare(`SELECT ${ALBUM_SELECT} ${ALBUM_FROM} ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset) as any[];
  return { items: rows.map(mapAlbumSummary), total, offset, limit };
}

export function getAlbum(db: DB, id: string, userId?: string | null): Album | null {
  const r = db.prepare(`SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE al.id = ?`).get(id) as any;
  if (!r) return null;
  const rows = db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} WHERE t.album_id = ? ORDER BY t.disc_no, t.track_no, t.title`).all(id) as any[];
  const album: Album = {
    ...mapAlbumSummary(r),
    description: r.description,
    releaseDate: r.release_date,
    label: r.label,
    tracks: mapTracks(db, rows, userId),
  };
  if (userId) album.liked = isLiked(db, userId, 'album', id);
  return album;
}

export function listArtists(db: DB, opts: { offset?: number; limit?: number; sort?: 'name' | 'popular' | 'new' } = {}): Paginated<ArtistSummary> {
  const { offset = 0, limit = 50, sort = 'popular' } = opts;
  const order =
    sort === 'name' ? 'a.name COLLATE NOCASE' :
    sort === 'new' ? 'a.created_at DESC' :
    '(SELECT COALESCE(SUM(play_count),0) FROM tracks t WHERE t.artist_id = a.id) DESC, a.name COLLATE NOCASE';
  const total = (db.prepare('SELECT COUNT(*) c FROM artists a').get() as any).c;
  const rows = db.prepare(`SELECT a.id, a.name, a.image_path FROM artists a ORDER BY ${order} LIMIT ? OFFSET ?`).all(limit, offset) as any[];
  return { items: rows.map(mapArtistSummary), total, offset, limit };
}

export function getArtist(db: DB, id: string, userId?: string | null): (Artist & { albums: AlbumSummary[]; topTracks: Track[]; related: ArtistSummary[]; appearsOn: AlbumSummary[] }) | null {
  const r = db.prepare('SELECT * FROM artists WHERE id = ?').get(id) as any;
  if (!r) return null;
  const followers = (db.prepare(`SELECT COUNT(*) c FROM likes WHERE entity_type='artist' AND entity_id=?`).get(id) as any).c;
  const monthly = (db.prepare(`SELECT COUNT(DISTINCT user_id) c FROM plays p JOIN tracks t ON t.id=p.track_id WHERE t.artist_id=? AND p.played_at > datetime('now','-30 days')`).get(id) as any).c;
  const albums = db.prepare(`SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE al.artist_id = ? ORDER BY al.year DESC NULLS LAST, al.created_at DESC`).all(id).map(mapAlbumSummary);
  const topRows = db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} WHERE t.artist_id = ? OR t.id IN (SELECT track_id FROM track_artists WHERE artist_id = ?) ORDER BY t.play_count DESC, t.created_at DESC LIMIT 10`).all(id, id) as any[];
  const appearsOn = db
    .prepare(`SELECT DISTINCT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE al.artist_id <> ? AND al.id IN (SELECT t.album_id FROM tracks t JOIN track_artists ta ON ta.track_id = t.id WHERE ta.artist_id = ?) ORDER BY al.year DESC`)
    .all(id, id)
    .map(mapAlbumSummary);
  // Related: artists sharing genres, then random fallback
  const genres = db.prepare('SELECT DISTINCT genre FROM tracks WHERE artist_id = ? AND genre IS NOT NULL').all(id).map((g: any) => g.genre as string);
  let related: ArtistSummary[] = [];
  if (genres.length) {
    related = db
      .prepare(`SELECT a.id, a.name, a.image_path, COUNT(*) score FROM artists a JOIN tracks t ON t.artist_id = a.id WHERE a.id <> ? AND t.genre IN (${genres.map(() => '?').join(',')}) GROUP BY a.id ORDER BY score DESC LIMIT 8`)
      .all(id, ...genres)
      .map(mapArtistSummary);
  }
  if (related.length < 4) {
    const more = db.prepare(`SELECT a.id, a.name, a.image_path FROM artists a WHERE a.id <> ? ORDER BY RANDOM() LIMIT ?`).all(id, 8 - related.length).map(mapArtistSummary);
    const seen = new Set(related.map((x) => x.id));
    for (const m of more) if (!seen.has(m.id)) related.push(m);
  }
  const artist: Artist & { albums: AlbumSummary[]; topTracks: Track[]; related: ArtistSummary[]; appearsOn: AlbumSummary[] } = {
    id: r.id,
    deezerId: r.deezer_id ?? null,
    name: r.name,
    imageUrl: coverUrl(r.image_path),
    headerUrl: coverUrl(r.header_path),
    bio: r.bio,
    verified: !!r.verified,
    followers,
    monthlyListeners: monthly,
    albums,
    topTracks: mapTracks(db, topRows, userId),
    related,
    appearsOn,
  };
  if (userId) artist.liked = isLiked(db, userId, 'artist', id);
  return artist;
}

export function listGenres(db: DB): Genre[] {
  const rows = db
    .prepare(`SELECT t.genre AS name, COUNT(*) c, (SELECT COALESCE(t2.cover_path, al2.cover_path) FROM tracks t2 LEFT JOIN albums al2 ON al2.id=t2.album_id WHERE t2.genre = t.genre AND COALESCE(t2.cover_path, al2.cover_path) IS NOT NULL ORDER BY t2.play_count DESC LIMIT 1) cover FROM tracks t WHERE t.genre IS NOT NULL AND t.genre <> '' GROUP BY t.genre ORDER BY c DESC`)
    .all() as any[];
  // up to three different covers per genre (most played first), for the tiles' fanned artwork
  const covers = db.prepare(`SELECT COALESCE(al.cover_path, t.cover_path) c FROM tracks t LEFT JOIN albums al ON al.id = t.album_id
    WHERE t.genre = ? AND COALESCE(al.cover_path, t.cover_path) IS NOT NULL GROUP BY c ORDER BY MAX(t.play_count) DESC, MAX(t.created_at) DESC LIMIT 3`);
  return rows.map((r) => ({
    slug: slugify(r.name), name: r.name, color: colorFor(r.name), trackCount: r.c, coverUrl: coverUrl(r.cover),
    covers: (covers.all(r.name) as any[]).map((x) => coverUrl(x.c)).filter((u): u is string => !!u),
  }));
}

export function getGenre(db: DB, slug: string, userId?: string | null): { genre: Genre; tracks: Track[]; albums: AlbumSummary[]; artists: ArtistSummary[] } | null {
  const g = listGenres(db).find((x) => x.slug === slug);
  if (!g) return null;
  const tracks = mapTracks(db, db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} WHERE t.genre = ? ORDER BY t.play_count DESC, t.created_at DESC LIMIT 100`).all(g.name) as any[], userId);
  const albums = db.prepare(`SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE al.id IN (SELECT DISTINCT album_id FROM tracks WHERE genre = ?) ORDER BY al.year DESC LIMIT 40`).all(g.name).map(mapAlbumSummary);
  const artists = db.prepare(`SELECT a.id, a.name, a.image_path FROM artists a WHERE a.id IN (SELECT DISTINCT artist_id FROM tracks WHERE genre = ?) LIMIT 40`).all(g.name).map(mapArtistSummary);
  return { genre: g, tracks, albums, artists };
}

/** "Track radio": tracks similar to a seed (same artist, same genre, same album), excluding the seed. */
export function trackRadio(db: DB, trackId: string, userId?: string | null, limit = 30): Track[] {
  const seed = getTrackRaw(db, trackId);
  if (!seed) return [];
  const rows = db
    .prepare(
      `SELECT ${TRACK_SELECT},
        (CASE WHEN t.artist_id = @artist THEN 3 ELSE 0 END) +
        (CASE WHEN t.genre IS NOT NULL AND t.genre = @genre THEN 2 ELSE 0 END) +
        (CASE WHEN t.album_id IS NOT NULL AND t.album_id = @album THEN 1 ELSE 0 END) +
        (RANDOM() % 3) AS score
       ${TRACK_FROM} WHERE t.id <> @id ORDER BY score DESC, RANDOM() LIMIT @limit`,
    )
    .all({ id: trackId, artist: seed.artist_id, genre: seed.genre, album: seed.album_id, limit }) as any[];
  return mapTracks(db, rows, userId);
}

export function listTracks(db: DB, opts: { offset?: number; limit?: number; sort?: 'new' | 'popular' | 'title' } = {}, userId?: string | null): Paginated<Track> {
  const { offset = 0, limit = 50, sort = 'new' } = opts;
  const order = sort === 'popular' ? 't.play_count DESC, t.created_at DESC' : sort === 'title' ? 't.title COLLATE NOCASE' : 't.created_at DESC';
  const total = (db.prepare('SELECT COUNT(*) c FROM tracks').get() as any).c;
  const rows = db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} ORDER BY ${order} LIMIT ? OFFSET ?`).all(limit, offset) as any[];
  return { items: mapTracks(db, rows, userId), total, offset, limit };
}
