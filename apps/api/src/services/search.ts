import type { DB } from '../lib/db.js';
import type { SearchResult, PlaylistSummary, Track } from '@avrmusic/shared';
import { ALBUM_FROM, ALBUM_SELECT, TRACK_FROM, TRACK_SELECT, mapAlbumSummary, mapArtistSummary, mapTracks } from './library.js';
import { PLAYLIST_FROM, PLAYLIST_SELECT, mapPlaylistSummary } from './playlists.js';

type Kind = 'track' | 'album' | 'artist' | 'playlist';

/* ---- index maintenance ---- */

export function indexTrack(db: DB, id: string) {
  const r = db.prepare(`SELECT t.title, ar.name artist, al.title album, t.genre, (SELECT GROUP_CONCAT(a2.name, ' ') FROM track_artists ta JOIN artists a2 ON a2.id=ta.artist_id WHERE ta.track_id=t.id) feat FROM tracks t JOIN artists ar ON ar.id=t.artist_id LEFT JOIN albums al ON al.id=t.album_id WHERE t.id=?`).get(id) as any;
  db.prepare(`DELETE FROM search_index WHERE kind='track' AND entity_id=?`).run(id);
  if (r) db.prepare(`INSERT INTO search_index(kind, entity_id, title, subtitle, extra) VALUES ('track', ?, ?, ?, ?)`).run(id, r.title, [r.artist, r.feat].filter(Boolean).join(' '), [r.album, r.genre].filter(Boolean).join(' '));
}
export function indexAlbum(db: DB, id: string) {
  const r = db.prepare(`SELECT al.title, ar.name artist, al.year FROM albums al JOIN artists ar ON ar.id=al.artist_id WHERE al.id=?`).get(id) as any;
  db.prepare(`DELETE FROM search_index WHERE kind='album' AND entity_id=?`).run(id);
  if (r) db.prepare(`INSERT INTO search_index(kind, entity_id, title, subtitle, extra) VALUES ('album', ?, ?, ?, ?)`).run(id, r.title, r.artist, String(r.year ?? ''));
}
export function indexArtist(db: DB, id: string) {
  const r = db.prepare(`SELECT name FROM artists WHERE id=?`).get(id) as any;
  db.prepare(`DELETE FROM search_index WHERE kind='artist' AND entity_id=?`).run(id);
  if (r) db.prepare(`INSERT INTO search_index(kind, entity_id, title, subtitle, extra) VALUES ('artist', ?, ?, '', '')`).run(id, r.name);
}
export function indexPlaylist(db: DB, id: string) {
  const r = db.prepare(`SELECT p.title, p.description, u.display_name owner, p.is_public FROM playlists p JOIN users u ON u.id=p.owner_id WHERE p.id=?`).get(id) as any;
  db.prepare(`DELETE FROM search_index WHERE kind='playlist' AND entity_id=?`).run(id);
  if (r && r.is_public) db.prepare(`INSERT INTO search_index(kind, entity_id, title, subtitle, extra) VALUES ('playlist', ?, ?, ?, ?)`).run(id, r.title, r.owner, r.description ?? '');
}
export function removeFromIndex(db: DB, kind: Kind, id: string) {
  db.prepare(`DELETE FROM search_index WHERE kind=? AND entity_id=?`).run(kind, id);
}
export function reindexAll(db: DB) {
  const tx = db.transaction(() => {
    db.exec('DELETE FROM search_index');
    for (const r of db.prepare('SELECT id FROM tracks').all() as any[]) indexTrack(db, r.id);
    for (const r of db.prepare('SELECT id FROM albums').all() as any[]) indexAlbum(db, r.id);
    for (const r of db.prepare('SELECT id FROM artists').all() as any[]) indexArtist(db, r.id);
    for (const r of db.prepare('SELECT id FROM playlists').all() as any[]) indexPlaylist(db, r.id);
  });
  tx();
}

/* ---- querying ---- */

function ftsQuery(q: string): string | null {
  const terms = q
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '')}"*`);
  return terms.length ? terms.join(' ') : null;
}

function idsFor(db: DB, kind: Kind, q: string, limit: number): string[] {
  const fq = ftsQuery(q);
  const ids: string[] = [];
  if (fq) {
    try {
      const rows = db
        .prepare(`SELECT entity_id, bm25(search_index, 0, 0, 10.0, 4.0, 1.0) AS rank FROM search_index WHERE kind = ? AND search_index MATCH ? ORDER BY rank LIMIT ?`)
        .all(kind, fq, limit) as any[];
      ids.push(...rows.map((r) => r.entity_id));
    } catch {
      /* malformed query — fall through to LIKE */
    }
  }
  if (ids.length < limit) {
    const like = `%${q.toLowerCase()}%`;
    const rows = db
      .prepare(`SELECT entity_id FROM search_index WHERE kind = ? AND (lower(title) LIKE ? OR lower(subtitle) LIKE ?) LIMIT ?`)
      .all(kind, like, like, limit) as any[];
    for (const r of rows) if (!ids.includes(r.entity_id)) ids.push(r.entity_id);
  }
  return ids.slice(0, limit);
}

export function search(db: DB, q: string, userId: string | null, opts: { limit?: number; type?: Kind | 'all' } = {}): SearchResult {
  const limit = opts.limit ?? 10;
  const type = opts.type ?? 'all';
  const want = (k: Kind) => type === 'all' || type === k;
  const empty: SearchResult = { query: q, top: null, tracks: [], albums: [], artists: [], playlists: [] };
  if ((type as string) === 'lyrics') return { ...empty, lyrics: searchLyrics(db, q.trim(), userId, 30) };
  q = q.trim();
  if (!q) return empty;

  const result = { ...empty };

  if (want('track')) {
    const ids = idsFor(db, 'track', q, type === 'track' ? Math.max(limit, 50) : limit);
    if (ids.length) {
      const rows = db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} WHERE t.id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      result.tracks = mapTracks(db, ids.map((i) => byId.get(i)).filter(Boolean), userId);
    }
  }
  if (want('album')) {
    const ids = idsFor(db, 'album', q, type === 'album' ? Math.max(limit, 50) : limit);
    if (ids.length) {
      const rows = db.prepare(`SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE al.id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      result.albums = ids.map((i) => byId.get(i)).filter(Boolean).map(mapAlbumSummary);
    }
  }
  if (want('artist')) {
    const ids = idsFor(db, 'artist', q, type === 'artist' ? Math.max(limit, 50) : limit);
    if (ids.length) {
      const rows = db.prepare(`SELECT id, name, image_path FROM artists WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      result.artists = ids.map((i) => byId.get(i)).filter(Boolean).map(mapArtistSummary);
    }
  }
  if (want('playlist')) {
    const ids = idsFor(db, 'playlist', q, type === 'playlist' ? Math.max(limit, 50) : limit);
    if (ids.length) {
      const rows = db.prepare(`SELECT ${PLAYLIST_SELECT} ${PLAYLIST_FROM} WHERE p.id IN (${ids.map(() => '?').join(',')}) AND (p.is_public = 1 OR p.owner_id = ?)`).all(...ids, userId ?? '') as any[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      result.playlists = ids.map((i) => byId.get(i)).filter(Boolean).map((r) => mapPlaylistSummary(db, r, userId)) as PlaylistSummary[];
    }
  }

  // Top result: exact-ish title match wins; artist > album > track by default.
  const lq = q.toLowerCase();
  const exact = (s: string) => s.toLowerCase() === lq;
  const starts = (s: string) => s.toLowerCase().startsWith(lq);
  const a = result.artists.find((x) => exact(x.name)) ?? result.artists.find((x) => starts(x.name));
  const al = result.albums.find((x) => exact(x.title)) ?? result.albums.find((x) => starts(x.title));
  const t = result.tracks.find((x) => exact(x.title)) ?? result.tracks.find((x) => starts(x.title));
  if (a) result.top = { kind: 'artist', item: a };
  else if (al) result.top = { kind: 'album', item: al };
  else if (t) result.top = { kind: 'track', item: t };
  else if (result.artists[0]) result.top = { kind: 'artist', item: result.artists[0] };
  else if (result.tracks[0]) result.top = { kind: 'track', item: result.tracks[0] };
  else if (result.albums[0]) result.top = { kind: 'album', item: result.albums[0] };
  else if (result.playlists[0]) result.top = { kind: 'playlist', item: result.playlists[0] };
  if (type === 'all' || (type as string) === 'lyrics') result.lyrics = searchLyrics(db, q, userId, type === 'all' ? 6 : 30);
  return result;
}

/** Songs whose lyrics have these words, with the line they are in ("по строчке из песни"). */
export function searchLyrics(db: DB, q: string, userId: string | null, limit = 8): Array<{ track: Track; line: string }> {
  const words = q.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
  // a line of a song: at least two words or one long one
  if (!words.length || (words.length < 2 && words[0].length < 5)) return [];
  let rows: any[] = [];
  try {
    rows = db.prepare(`SELECT track_id, text FROM lyrics_index WHERE lyrics_index MATCH ? ORDER BY bm25(lyrics_index) LIMIT ?`)
      .all(words.map((w) => `"${w}"*`).join(' '), limit * 3) as any[];
  } catch { return []; }
  const norm = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const out: Array<{ id: string; line: string; score: number }> = [];
  for (const r of rows) {
    // the line with the most of the words (timestamps of synced lyrics left out)
    const lines = String(r.text).split(/\r?\n/).map((l) => l.replace(/\[[^\]]*\]|<[^>]*>/g, '').trim()).filter(Boolean);
    let best = '', bestScore = 0;
    for (const l of lines) {
      const n = norm(l);
      const score = words.filter((w) => n.includes(w)).length;
      if (score > bestScore) { best = l; bestScore = score; }
    }
    if (bestScore) out.push({ id: r.track_id, line: best, score: bestScore });
  }
  out.sort((a, b) => b.score - a.score);
  const ids = [...new Set(out.map((o) => o.id))].slice(0, limit);
  if (!ids.length) return [];
  const trackRows = db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM} WHERE t.id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
  const byId = new Map(mapTracks(db, trackRows, userId).map((t) => [t.id, t]));
  return ids.map((id) => ({ track: byId.get(id)!, line: out.find((o) => o.id === id)!.line })).filter((x) => x.track);
}

export function suggest(db: DB, q: string, limit = 8): Array<{ kind: Kind; id: string; title: string; subtitle: string }> {
  q = q.trim();
  const fq = ftsQuery(q);
  if (!fq) return [];
  try {
    const rows = db
      .prepare(`SELECT kind, entity_id, title, subtitle, bm25(search_index, 0, 0, 10.0, 4.0, 1.0) rank FROM search_index WHERE search_index MATCH ? ORDER BY (CASE kind WHEN 'artist' THEN 0 WHEN 'album' THEN 1 ELSE 2 END), rank LIMIT ?`)
      .all(fq, limit) as any[];
    return rows.map((r) => ({ kind: r.kind, id: r.entity_id, title: r.title, subtitle: r.subtitle }));
  } catch {
    return [];
  }
}
