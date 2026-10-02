// "Предложка": new music from the catalogue for one listener — new releases of the artists they
// listen to, and the best tracks of artists related to their favourites. Everything shown is not in
// the library yet; one tap fetches it to the server. Cached per listener for a few hours.
import type { DB } from '../lib/db.js';
import type { Suggestions } from '@avrmusic/shared';
import { mapRawAlbums, mapRawTracks, rawArtistAlbumsPage, rawArtistTop, rawRelatedArtists } from './catalog.js';
import { userTaste } from './wave.js';

const cache = new Map<string, { at: number; data: Suggestions }>();
const TTL = 4 * 3600_000;

export async function suggestionsFor(db: DB, userId: string, fresh = false): Promise<Suggestions> {
  const hit = cache.get(userId);
  if (hit && !fresh && Date.now() - hit.at < TTL) return hit.data;
  const taste = userTaste(db, userId);
  const ranked = [...taste.artist].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const seeds = (ranked.length ? ranked : (db.prepare('SELECT t.artist_id id FROM tracks t GROUP BY t.artist_id ORDER BY SUM(t.play_count) DESC LIMIT 8').all() as any[]).map((r) => r.id))
    .map((id) => db.prepare('SELECT id, name, deezer_id FROM artists WHERE id = ? AND deezer_id IS NOT NULL').get(id) as any)
    .filter(Boolean)
    .slice(0, 8);

  // new releases (last 6 months) of the artists they listen to
  const cutoff = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10);
  const releases: Suggestions['releases'] = [];
  for (const a of seeds.slice(0, 6)) {
    const albums = (await rawArtistAlbumsPage(db, a.deezer_id, 15)).filter((x) => (x.release_date ?? '') >= cutoff);
    for (const al of mapRawAlbums(db, albums, { id: a.deezer_id, name: a.name })) {
      if (al.libraryAlbumId && al.inLibrary >= al.trackCount) continue;
      releases.push({ ...al, reason: `Новый релиз ${a.name}` });
    }
  }
  releases.sort((x, y) => (y.releaseDate ?? '').localeCompare(x.releaseDate ?? ''));

  // the best tracks of artists related to their favourites
  const tracks: Suggestions['tracks'] = [];
  const seenArtist = new Set<number>(seeds.map((s) => Number(s.deezer_id)));
  const seenTrack = new Set<number>();
  for (const a of seeds.slice(0, 5)) {
    const related = (await rawRelatedArtists(db, a.deezer_id, 6)).filter((r) => !seenArtist.has(Number(r.id))).slice(0, 4);
    for (const r of related) {
      seenArtist.add(Number(r.id));
      for (const t of mapRawTracks(db, await rawArtistTop(db, Number(r.id), 3))) {
        if (t.libraryTrackId || seenTrack.has(t.id)) continue;
        seenTrack.add(t.id);
        tracks.push({ ...t, reason: `Похоже на ${a.name}` });
      }
    }
  }
  // interleave seeds so the list doesn't start with one artist's neighbours only
  const bySeed = new Map<string, typeof tracks>();
  for (const t of tracks) bySeed.set(t.reason, [...(bySeed.get(t.reason) ?? []), t]);
  const mixed: typeof tracks = [];
  while ([...bySeed.values()].some((l) => l.length)) for (const l of bySeed.values()) { const t = l.shift(); if (t) mixed.push(t); }

  const data: Suggestions = { releases: releases.slice(0, 12), tracks: mixed.slice(0, 40) };
  cache.set(userId, { at: Date.now(), data });
  return data;
}
