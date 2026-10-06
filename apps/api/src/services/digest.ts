// The company's week: what everyone played most (the chart on the home screen), and on Sunday evening a
// short digest in each listener's inbox — their minutes and top track, the group's top track, who listened
// most.
import type { ArtistSummary, FriendRef, Track } from '@avrmusic/shared';
import type { DB } from '../lib/db.js';
import { newId } from '../lib/util.js';
import { getTracksByIds, mapArtistSummary } from './library.js';
import { friendRef } from './social.js';

const MIN = 60_000;
const TZ = process.env.DIGEST_TZ || 'Europe/Moscow';

export interface WeekChart {
  tracks: Array<{ track: Track; plays: number; listeners: FriendRef[] }>;
  artists: Array<{ artist: ArtistSummary; plays: number; listeners: number }>;
  people: Array<{ user: FriendRef; minutes: number }>;
}

/** The last seven days across everyone: songs most people played first. */
export function weeklyChart(db: DB, viewerId: string | null, limit = 20): WeekChart {
  const rows = db.prepare(`SELECT track_id, COUNT(*) plays, GROUP_CONCAT(DISTINCT user_id) users FROM plays
    WHERE ms_played >= 30000 AND played_at > datetime('now','-7 days') GROUP BY track_id
    ORDER BY COUNT(DISTINCT user_id) DESC, plays DESC LIMIT ?`).all(limit) as any[];
  const byId = new Map(getTracksByIds(db, rows.map((r) => r.track_id), viewerId).map((t) => [t.id, t]));
  const people = (ids: string) => String(ids ?? '').split(',').filter(Boolean).map((u) => friendRef(db, u)).filter((f): f is FriendRef => !!f);
  const tracks = rows.filter((r) => byId.has(r.track_id)).map((r) => ({ track: byId.get(r.track_id)!, plays: r.plays as number, listeners: people(r.users) }));
  const artists = (db.prepare(`SELECT a.id, a.name, a.image_path, COUNT(*) plays, COUNT(DISTINCT p.user_id) people FROM plays p
    JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.ms_played >= 30000 AND p.played_at > datetime('now','-7 days') GROUP BY a.id ORDER BY people DESC, plays DESC LIMIT 10`).all() as any[])
    .map((r) => ({ artist: mapArtistSummary(r), plays: r.plays as number, listeners: r.people as number }));
  const top = (db.prepare(`SELECT user_id, SUM(ms_played) ms FROM plays WHERE played_at > datetime('now','-7 days') GROUP BY user_id ORDER BY ms DESC`).all() as any[])
    .map((r) => ({ user: friendRef(db, r.user_id), minutes: Math.round(r.ms / MIN) })).filter((x): x is { user: FriendRef; minutes: number } => !!x.user);
  return { tracks, artists, people: top };
}

/** Day of the week, hour and date in the digest's time zone. */
function local(now = new Date()) {
  const f = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map((p) => [p.type, p.value]));
  return { weekday: f.weekday as string, hour: Number(f.hour), date: `${f.year}-${f.month}-${f.day}` };
}

/** The digest of the week for everyone who listened in it (once per week). */
export function sendDigest(db: DB, weekKey: string): number {
  const chart = weeklyChart(db, null, 1);
  const groupTop = chart.tracks[0]?.track.id ?? null;
  const leader = chart.people[0] ? { id: chart.people[0].user.id, minutes: chart.people[0].minutes } : null;
  const users = db.prepare(`SELECT user_id, SUM(ms_played) ms FROM plays WHERE played_at > datetime('now','-7 days') GROUP BY user_id HAVING ms >= ?`).all(5 * MIN) as any[];
  const ins = db.prepare('INSERT INTO shares (id, from_user, to_user, kind, ref_id, message) VALUES (?,?,?,?,?,?)');
  for (const u of users) {
    const mine = db.prepare(`SELECT track_id, COUNT(*) n FROM plays WHERE user_id = ? AND ms_played >= 30000 AND played_at > datetime('now','-7 days') GROUP BY track_id ORDER BY n DESC LIMIT 1`).get(u.user_id) as any;
    ins.run(newId(), null, u.user_id, 'digest', weekKey, JSON.stringify({
      minutes: Math.round(u.ms / MIN), myTop: mine?.track_id ?? null, myTopPlays: mine?.n ?? 0, groupTop, leader, people: chart.people.length,
    }));
  }
  return users.length;
}

/** What a digest share shows: the numbers with the songs and the leader resolved. */
export function resolveDigest(db: DB, message: string, viewerId: string) {
  let d: any = {};
  try { d = JSON.parse(message); } catch { return null; }
  const ids = [d.myTop, d.groupTop].filter(Boolean);
  const tracks = new Map(getTracksByIds(db, ids, viewerId).map((t) => [t.id, t]));
  return {
    minutes: d.minutes ?? 0,
    myTop: d.myTop ? tracks.get(d.myTop) ?? null : null,
    myTopPlays: d.myTopPlays ?? 0,
    groupTop: d.groupTop ? tracks.get(d.groupTop) ?? null : null,
    leader: d.leader ? { user: friendRef(db, d.leader.id), minutes: d.leader.minutes } : null,
    people: d.people ?? 0,
  };
}

/** Sunday from six in the evening (Moscow time by default): the week's digest, once. */
export function startDigest(db: DB) {
  const tick = () => {
    try {
      const l = local();
      if (l.weekday !== 'Sun' || l.hour < 18) return;
      const sent = (db.prepare("SELECT value FROM app_meta WHERE key = 'digest.week'").get() as any)?.value;
      if (sent === l.date) return;
      db.prepare("INSERT INTO app_meta (key, value) VALUES ('digest.week', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(l.date);
      sendDigest(db, l.date);
    } catch { /* tried again in a quarter of an hour */ }
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, 15 * 60_000).unref();
}
