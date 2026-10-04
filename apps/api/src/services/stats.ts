// Listening, summed up: a month's or a year's recap (like Spotify Wrapped) and how close two friends'
// tastes are. Times are shifted by the listener's time zone offset, so "a day" and "an hour" are theirs.
import type { DB } from '../lib/db.js';
import type { AlbumSummary, ArtistSummary, Track } from '@avrmusic/shared';
import { ALBUM_FROM, ALBUM_SELECT, getTracksByIds, mapAlbumSummary, mapArtistSummary } from './library.js';

const MIN = 60_000;
const DAY = 86_400_000;

export type Period = 'month' | 'year';

/** The period [offset] steps back from the current one, in the listener's time zone. */
function periodRange(period: Period, offset: number, tzMin: number): { from: Date; to: Date; label: string } {
  const local = new Date(Date.now() + tzMin * MIN);
  let y = local.getUTCFullYear();
  let m = local.getUTCMonth();
  let from: number, to: number;
  if (period === 'month') {
    m -= offset;
    while (m < 0) { m += 12; y--; }
    from = Date.UTC(y, m, 1);
    to = Date.UTC(y, m + 1, 1);
  } else {
    y -= offset;
    from = Date.UTC(y, 0, 1);
    to = Date.UTC(y + 1, 0, 1);
  }
  const label = period === 'month' ? `${y}-${String(m + 1).padStart(2, '0')}` : String(y);
  // back to UTC instants
  return { from: new Date(from - tzMin * MIN), to: new Date(to - tzMin * MIN), label };
}

interface PlayRow { track_id: string; ms_played: number; played_at: string; artist_id: string; genre: string | null; album_id: string | null; duration_ms: number }

function playsIn(db: DB, userId: string, from: Date, to: Date): PlayRow[] {
  return db.prepare(`SELECT p.track_id, p.ms_played, p.played_at, t.artist_id, t.genre, t.album_id, t.duration_ms
    FROM plays p JOIN tracks t ON t.id = p.track_id WHERE p.user_id = ? AND p.played_at >= ? AND p.played_at < ? ORDER BY p.played_at`)
    .all(userId, from.toISOString(), to.toISOString()) as PlayRow[];
}

const sum = <K>(m: Map<K, number>, k: K, v: number) => m.set(k, (m.get(k) ?? 0) + v);
const top = <K>(m: Map<K, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);

export function recap(db: DB, userId: string, period: Period, offset: number, tzMin: number) {
  const { from, to, label } = periodRange(period, offset, tzMin);
  const plays = playsIn(db, userId, from, to);
  const span = to.getTime() - from.getTime();
  const before = playsIn(db, userId, new Date(from.getTime() - span), from);

  const msTrack = new Map<string, number>(), cntTrack = new Map<string, number>();
  const msArtist = new Map<string, number>(), cntArtist = new Map<string, number>();
  const msGenre = new Map<string, number>(), msAlbum = new Map<string, number>();
  const msDay = new Map<string, number>(), days = new Set<string>();
  const hours = new Array(24).fill(0) as number[];
  let total = 0;
  for (const p of plays) {
    total += p.ms_played;
    sum(msTrack, p.track_id, p.ms_played);
    if (p.ms_played >= 30_000) sum(cntTrack, p.track_id, 1);
    sum(msArtist, p.artist_id, p.ms_played);
    if (p.ms_played >= 30_000) sum(cntArtist, p.artist_id, 1);
    if (p.genre) sum(msGenre, p.genre, p.ms_played);
    if (p.album_id) sum(msAlbum, p.album_id, p.ms_played);
    const local = new Date(Date.parse(p.played_at) + tzMin * MIN);
    const day = local.toISOString().slice(0, 10);
    sum(msDay, day, p.ms_played);
    days.add(day);
    hours[local.getUTCHours()] += p.ms_played / MIN;
  }

  // the longest run of days in a row with music
  let streak = 0, run = 0, prev = 0;
  for (const d of [...days].sort()) {
    const t = Date.parse(d);
    run = prev && t - prev === DAY ? run + 1 : 1;
    streak = Math.max(streak, run);
    prev = t;
  }

  // artists and tracks heard for the very first time in this period
  const firstArtist = new Map((db.prepare(`SELECT t.artist_id, MIN(p.played_at) f FROM plays p JOIN tracks t ON t.id = p.track_id WHERE p.user_id = ? GROUP BY t.artist_id`).all(userId) as any[]).map((r) => [r.artist_id as string, r.f as string]));
  const newArtists = [...msArtist.keys()].filter((a) => (firstArtist.get(a) ?? '') >= from.toISOString()).length;
  const firstTrack = new Map((db.prepare(`SELECT track_id, MIN(played_at) f FROM plays WHERE user_id = ? GROUP BY track_id`).all(userId) as any[]).map((r) => [r.track_id as string, r.f as string]));
  const discoveries = [...msTrack.keys()].filter((t) => (firstTrack.get(t) ?? '') >= from.toISOString()).length;

  const topTrackIds = [...msTrack.keys()].sort((a, b) => (cntTrack.get(b) ?? 0) - (cntTrack.get(a) ?? 0) || (msTrack.get(b) ?? 0) - (msTrack.get(a) ?? 0)).slice(0, 5);
  const tracksById = new Map(getTracksByIds(db, topTrackIds, userId).map((t) => [t.id, t]));
  const topTracks = topTrackIds.map((id) => tracksById.get(id)).filter((t): t is Track => !!t)
    .map((t) => ({ track: t, plays: cntTrack.get(t.id) ?? 0, minutes: Math.round((msTrack.get(t.id) ?? 0) / MIN) }));

  const artistRow = db.prepare('SELECT id, name, image_path FROM artists WHERE id = ?');
  const topArtists = top(msArtist, 5).map(([id, ms]) => ({ artist: mapArtistSummary(artistRow.get(id)) as ArtistSummary, minutes: Math.round(ms / MIN), plays: cntArtist.get(id) ?? 0 }))
    .filter((a) => a.artist?.id);
  const topGenres = top(msGenre, 3).map(([name, ms]) => ({ name, share: total ? Math.round((ms / total) * 100) : 0 }));
  const albumId = top(msAlbum, 1)[0]?.[0];
  const topAlbum = albumId ? mapAlbumSummary(db.prepare(`SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE al.id = ?`).get(albumId)) as AlbumSummary : null;
  const busiest = top(msDay, 1)[0];
  const peakHour = hours.indexOf(Math.max(...hours));
  const first = plays[0] ? getTracksByIds(db, [plays[0].track_id], userId)[0] ?? null : null;
  const distinctTracks = msTrack.size;
  const countedPlays = [...cntTrack.values()].reduce((a, b) => a + b, 0);
  const night = hours.slice(0, 5).reduce((a, b) => a + b, 0) / Math.max(1, total / MIN);
  const topShare = total ? (top(msArtist, 1)[0]?.[1] ?? 0) / total : 0;

  // the listener's "personality" for this period
  const personality =
    !plays.length ? 'none'
    : msArtist.size >= 5 && newArtists / msArtist.size > 0.4 ? 'explorer'
    : topShare > 0.35 ? 'fan'
    : distinctTracks && countedPlays / distinctTracks > 4 ? 'repeat'
    : night > 0.3 ? 'night'
    : msGenre.size >= 8 ? 'chameleon'
    : 'connoisseur';

  return {
    period, offset, label, from: from.toISOString(), to: to.toISOString(),
    minutes: Math.round(total / MIN),
    previousMinutes: Math.round(before.reduce((a, p) => a + p.ms_played, 0) / MIN),
    plays: countedPlays,
    distinctTracks,
    distinctArtists: msArtist.size,
    genres: msGenre.size,
    newArtists,
    discoveries,
    streakDays: streak,
    activeDays: days.size,
    busiestDay: busiest ? { date: busiest[0], minutes: Math.round(busiest[1] / MIN) } : null,
    peakHour: plays.length ? peakHour : null,
    hours: hours.map((h) => Math.round(h)),
    topTracks, topArtists, topGenres, topAlbum,
    firstTrack: first,
    personality,
  };
}

/* ---------- taste compatibility ---------- */

/** How much a user listens to each artist (last half year), plus their likes. */
function artistWeights(db: DB, userId: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of db.prepare(`SELECT t.artist_id, SUM(p.ms_played) ms FROM plays p JOIN tracks t ON t.id = p.track_id WHERE p.user_id = ? AND p.played_at > datetime('now','-180 days') GROUP BY t.artist_id`).all(userId) as any[]) sum(m, r.artist_id, r.ms / MIN);
  for (const r of db.prepare(`SELECT t.artist_id FROM likes l JOIN tracks t ON t.id = l.entity_id WHERE l.user_id = ? AND l.entity_type = 'track'`).all(userId) as any[]) sum(m, r.artist_id, 12);
  for (const r of db.prepare(`SELECT entity_id FROM likes WHERE user_id = ? AND entity_type = 'artist'`).all(userId) as any[]) sum(m, r.entity_id, 40);
  return m;
}

export function compatibility(db: DB, a: string, b: string, viewerId: string) {
  const wa = artistWeights(db, a), wb = artistWeights(db, b);
  let dot = 0, na = 0, nb = 0;
  for (const v of wa.values()) na += v * v;
  for (const v of wb.values()) nb += v * v;
  for (const [k, v] of wa) dot += v * (wb.get(k) ?? 0);
  const cos = na && nb ? dot / Math.sqrt(na * nb) : 0;
  const score = Math.round(100 * Math.pow(Math.max(0, Math.min(1, cos)), 0.6));
  const ta = [...wa.values()].reduce((x, y) => x + y, 0) || 1, tb = [...wb.values()].reduce((x, y) => x + y, 0) || 1;
  const artistRow = db.prepare('SELECT id, name, image_path FROM artists WHERE id = ?');
  const commonArtists = [...wa.keys()].filter((k) => wb.has(k))
    .sort((x, y) => Math.min((wb.get(y) ?? 0) / tb, (wa.get(y) ?? 0) / ta) - Math.min((wb.get(x) ?? 0) / tb, (wa.get(x) ?? 0) / ta))
    .slice(0, 8).map((id) => mapArtistSummary(artistRow.get(id))).filter((x) => x?.id);
  // tracks both like, or both keep coming back to
  const liked = (u: string) => new Set((db.prepare(`SELECT entity_id FROM likes WHERE user_id = ? AND entity_type = 'track'`).all(u) as any[]).map((r) => r.entity_id as string));
  const loved = (u: string) => new Set((db.prepare(`SELECT track_id FROM plays WHERE user_id = ? AND ms_played >= 30000 GROUP BY track_id HAVING COUNT(*) >= 3`).all(u) as any[]).map((r) => r.track_id as string));
  const la = new Set([...liked(a), ...loved(a)]), lb = new Set([...liked(b), ...loved(b)]);
  const commonIds = [...la].filter((id) => lb.has(id)).slice(0, 12);
  const commonTracks = getTracksByIds(db, commonIds, viewerId);
  const label = score >= 85 ? 'twins' : score >= 65 ? 'close' : score >= 40 ? 'common' : score >= 20 ? 'different' : 'opposite';
  return { score, label, commonArtists, commonTracks };
}

/** A friend's page: what they play now aside, their month, top artists, recent tracks. */
export function profileStats(db: DB, userId: string, viewerId: string) {
  const monthFrom = new Date(Date.now() - 30 * DAY).toISOString();
  const minutes = Math.round(((db.prepare(`SELECT COALESCE(SUM(ms_played),0) ms FROM plays WHERE user_id = ? AND played_at >= ?`).get(userId, monthFrom) as any).ms) / MIN);
  const artistRow = db.prepare('SELECT id, name, image_path FROM artists WHERE id = ?');
  const topArtists = (db.prepare(`SELECT t.artist_id, SUM(p.ms_played) ms FROM plays p JOIN tracks t ON t.id = p.track_id WHERE p.user_id = ? AND p.played_at >= ? GROUP BY t.artist_id ORDER BY ms DESC LIMIT 8`).all(userId, monthFrom) as any[])
    .map((r) => mapArtistSummary(artistRow.get(r.artist_id))).filter((x) => x?.id);
  const recentIds = (db.prepare(`SELECT track_id, MAX(played_at) at FROM plays WHERE user_id = ? GROUP BY track_id ORDER BY at DESC LIMIT 12`).all(userId) as any[]).map((r) => r.track_id as string);
  const byId = new Map(getTracksByIds(db, recentIds, viewerId).map((t) => [t.id, t]));
  const recent = recentIds.map((id) => byId.get(id)).filter((t): t is Track => !!t);
  const likes = (db.prepare(`SELECT COUNT(*) n FROM likes WHERE user_id = ? AND entity_type = 'track'`).get(userId) as any).n as number;
  return { minutes, topArtists, recent, likes };
}
