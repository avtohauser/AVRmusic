// "My Wave": an endless personal stream from the library (like Yandex Music's My Wave / Spotify DJ).
//
// Taste is learnt from what each listener does: tracks played to the end count for their artist and
// genre, early skips count against, likes count a lot, recent listening counts more than old. Artists
// are related to each other by who listens to them together and by shared playlists, so the wave also
// brings artists the listener hasn't heard yet but that sit next to their favourites. Each mode weighs
// the same signals differently; picks are sampled (not the same order every time), at most two per
// artist in a batch, and every track comes with a short reason, like a DJ would say it.
import type { DB } from '../lib/db.js';
import type { WaveMode, WaveTrack } from '@avrmusic/shared';
import { TRACK_FROM, TRACK_SELECT, mapTracks } from './library.js';

interface Taste {
  artist: Map<string, number>;
  genre: Map<string, number>;
  liked: Set<string>;
  heard: Map<string, number>;
  recent: Set<string>;
  skips: Map<string, number>;
  disliked: Set<string>;
}

const DAY = 86_400_000;
const add = (m: Map<string, number>, k: string | null | undefined, v: number) => { if (k) m.set(k, (m.get(k) ?? 0) + v); };

export function userTaste(db: DB, userId: string): Taste {
  const t: Taste = { artist: new Map(), genre: new Map(), liked: new Set(), heard: new Map(), recent: new Set(), skips: new Map(), disliked: new Set() };
  const now = Date.now();
  const plays = db.prepare(`SELECT p.track_id, p.ms_played, p.played_at, t.duration_ms, t.artist_id, t.genre FROM plays p JOIN tracks t ON t.id = p.track_id
    WHERE p.user_id = ? AND p.played_at > datetime('now','-180 days')`).all(userId) as any[];
  for (const p of plays) {
    const age = (now - Date.parse(p.played_at)) / DAY;
    const decay = Math.exp(-age / 45);
    const done = p.duration_ms ? p.ms_played / p.duration_ms : 0.5;
    const skipped = done < 0.2 && p.ms_played < 30_000;
    const w = done >= 0.6 ? 1 : skipped ? -0.8 : 0.3;
    add(t.artist, p.artist_id, w * decay);
    add(t.genre, p.genre, 0.5 * w * decay);
    add(t.heard, p.track_id, decay);
    if (age < 0.25) t.recent.add(p.track_id);
    if (skipped && age < 30) add(t.skips, p.track_id, 1);
  }
  for (const r of db.prepare(`SELECT l.entity_type, l.entity_id, t.artist_id, t.genre FROM likes l LEFT JOIN tracks t ON l.entity_type = 'track' AND t.id = l.entity_id WHERE l.user_id = ?`).all(userId) as any[]) {
    if (r.entity_type === 'track') { t.liked.add(r.entity_id); add(t.artist, r.artist_id, 3); add(t.genre, r.genre, 1.5); }
    else if (r.entity_type === 'artist') add(t.artist, r.entity_id, 5);
    else if (r.entity_type === 'album') add(t.artist, (db.prepare('SELECT artist_id FROM albums WHERE id = ?').get(r.entity_id) as any)?.artist_id, 2);
  }
  for (const r of db.prepare('SELECT f.track_id, f.value, t.artist_id FROM wave_feedback f JOIN tracks t ON t.id = f.track_id WHERE f.user_id = ?').all(userId) as any[]) {
    if (r.value < 0) { t.disliked.add(r.track_id); add(t.artist, r.artist_id, -2); }
    else t.liked.add(r.track_id);
  }
  return t;
}

/** Artists that go together: listened to by the same people, put in the same playlists. Cached briefly. */
let neighbourCache: { at: number; map: Map<string, Map<string, number>> } | null = null;
function neighbours(db: DB): Map<string, Map<string, number>> {
  if (neighbourCache && Date.now() - neighbourCache.at < 10 * 60_000) return neighbourCache.map;
  const map = new Map<string, Map<string, number>>();
  const link = (a: string, b: string, w: number) => {
    if (a === b) return;
    if (!map.has(a)) map.set(a, new Map());
    if (!map.has(b)) map.set(b, new Map());
    add(map.get(a)!, b, w); add(map.get(b)!, a, w);
  };
  const byUser = new Map<string, Map<string, number>>();
  for (const r of db.prepare(`SELECT p.user_id, t.artist_id, COUNT(*) n FROM plays p JOIN tracks t ON t.id = p.track_id WHERE p.user_id IS NOT NULL AND p.played_at > datetime('now','-180 days') GROUP BY p.user_id, t.artist_id`).all() as any[]) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Map());
    byUser.get(r.user_id)!.set(r.artist_id, r.n);
  }
  for (const arts of byUser.values()) {
    const top = [...arts].sort((a, b) => b[1] - a[1]).slice(0, 40);
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) link(top[i][0], top[j][0], Math.sqrt(top[i][1] * top[j][1]) / 10);
  }
  const byList = new Map<string, Set<string>>();
  for (const r of db.prepare('SELECT pt.playlist_id, t.artist_id FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id').all() as any[]) {
    if (!byList.has(r.playlist_id)) byList.set(r.playlist_id, new Set());
    byList.get(r.playlist_id)!.add(r.artist_id);
  }
  for (const arts of byList.values()) { const a = [...arts].slice(0, 40); for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) link(a[i], a[j], 1); }
  // tracks with guests link the artists too
  for (const r of db.prepare('SELECT t.artist_id a, ta.artist_id b FROM track_artists ta JOIN tracks t ON t.id = ta.track_id').all() as any[]) link(r.a, r.b, 2);
  neighbourCache = { at: Date.now(), map };
  return map;
}

const WEIGHTS: Record<WaveMode, { fam: number; nb: number; gen: number; pop: number; liked: number; fresh: number; newArtist: number; repeat: number }> = {
  mix: { fam: 1.0, nb: 0.8, gen: 0.5, pop: 0.3, liked: 0.6, fresh: 0.5, newArtist: 0.2, repeat: -0.4 },
  favorites: { fam: 1.4, nb: 0.2, gen: 0.3, pop: 0.1, liked: 1.5, fresh: 0, newArtist: -0.3, repeat: -0.15 },
  discover: { fam: 0.2, nb: 1.2, gen: 0.8, pop: 0.3, liked: 0, fresh: 1.2, newArtist: 0.6, repeat: -1 },
  popular: { fam: 0.3, nb: 0.3, gen: 0.3, pop: 1.5, liked: 0.2, fresh: 0.3, newArtist: 0, repeat: -0.3 },
};

export interface WaveOptions { mode?: WaveMode; count?: number; exclude?: string[]; genre?: string | null }

export function waveNext(db: DB, userId: string, opts: WaveOptions = {}): WaveTrack[] {
  const mode = opts.mode ?? 'mix';
  const count = Math.max(1, Math.min(20, opts.count ?? 10));
  const exclude = new Set(opts.exclude ?? []);
  const taste = userTaste(db, userId);
  const nbs = neighbours(db);
  const W = WEIGHTS[mode];

  const rows = db.prepare(`SELECT ${TRACK_SELECT} ${TRACK_FROM}${opts.genre ? ' WHERE t.genre = ?' : ''}`).all(...(opts.genre ? [opts.genre] : [])) as any[];
  const others = new Map((db.prepare(`SELECT track_id, COUNT(*) n FROM plays WHERE played_at > datetime('now','-60 days') AND (user_id IS NULL OR user_id <> ?) GROUP BY track_id`).all(userId) as any[]).map((r) => [r.track_id, r.n as number]));
  const artistName = new Map(rows.map((r) => [r.artist_id, r.artist_name]));

  // artist → how close it is to what the listener likes, and through whom
  const favs = [...taste.artist].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 30);
  const near = new Map<string, { v: number; via: string; best: number }>();
  for (const [fav, wf] of favs) for (const [other, w] of nbs.get(fav) ?? []) {
    const part = wf * w;
    const cur = near.get(other);
    if (!cur) near.set(other, { v: part, via: fav, best: part });
    else { cur.v += part; if (part > cur.best) { cur.best = part; cur.via = fav; } }
  }
  const max = (m: Iterable<number>) => Math.max(1e-9, ...m);
  const maxA = max(taste.artist.values()), maxG = max(taste.genre.values()), maxN = max([...near.values()].map((x) => x.v)), maxP = Math.log1p(max(others.values()));
  const cold = !favs.length && !taste.liked.size;

  const scored: Array<{ r: any; s: number; reason: string }> = [];
  for (const r of rows) {
    if (exclude.has(r.id) || taste.disliked.has(r.id) || taste.recent.has(r.id)) continue;
    const fam = Math.max(-1, (taste.artist.get(r.artist_id) ?? 0) / maxA);
    const nb = (near.get(r.artist_id)?.v ?? 0) / maxN;
    const gen = r.genre ? Math.max(0, (taste.genre.get(r.genre) ?? 0) / maxG) : 0;
    const pop = Math.log1p(others.get(r.id) ?? 0) / maxP;
    const liked = taste.liked.has(r.id) ? 1 : 0;
    const fresh = taste.heard.has(r.id) ? 0 : 1;
    const newArtist = taste.artist.has(r.artist_id) ? 0 : 1;
    const repeat = Math.min(3, taste.heard.get(r.id) ?? 0) + (taste.skips.get(r.id) ?? 0) * 1.5;
    const parts: Array<[number, string]> = [
      [W.fam * fam, fresh ? `Вы часто слушаете ${r.artist_name}` : `Снова ${r.artist_name}`],
      [W.nb * nb, `Похоже на ${artistName.get(near.get(r.artist_id)?.via ?? '') ?? 'ваше любимое'}`],
      [W.gen * gen, `В духе ${r.genre}`],
      [W.pop * pop, 'Популярно у друзей'],
      [W.liked * liked, 'Из ваших любимых'],
      [W.fresh * fresh * (cold ? 0.3 : 1) + W.newArtist * newArtist, newArtist ? 'Новый для вас исполнитель' : 'Ещё не слушали'],
    ];
    const s = parts.reduce((n, [v]) => n + v, 0) + W.repeat * repeat + (cold ? Math.random() * 0.5 : 0);
    const best = parts.reduce((a, b) => (b[0] > a[0] ? b : a));
    scored.push({ r, s, reason: best[0] > 0.05 ? best[1] : 'Случайная находка' });
  }
  scored.sort((a, b) => b.s - a.s);

  // sample from the best (softmax), not the same order every time; at most two per artist, never back to back
  const pool = scored.slice(0, Math.max(60, count * 6));
  const picked: typeof pool = [];
  const perArtist = new Map<string, number>();
  const tau = 0.25;
  while (picked.length < count && pool.length) {
    const top = pool[0].s;
    const weights = pool.map((x) => Math.exp((x.s - top) / tau));
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < pool.length - 1 && (roll -= weights[i]) > 0) i++;
    const [c] = pool.splice(i, 1);
    const n = perArtist.get(c.r.artist_id) ?? 0;
    if (n >= 2 || picked.at(-1)?.r.artist_id === c.r.artist_id && pool.some((x) => x.r.artist_id !== c.r.artist_id)) continue;
    perArtist.set(c.r.artist_id, n + 1);
    picked.push(c);
  }
  const tracks = mapTracks(db, picked.map((x) => x.r), userId);
  return tracks.map((t, i) => ({ ...t, reason: picked[i].reason }));
}

/** 👍 / 👎 from the wave; a dislike keeps the track out of the wave and lowers its artist. */
export function waveFeedback(db: DB, userId: string, trackId: string, value: 1 | -1 | 0) {
  if (value === 0) db.prepare('DELETE FROM wave_feedback WHERE user_id = ? AND track_id = ?').run(userId, trackId);
  else db.prepare(`INSERT INTO wave_feedback(user_id, track_id, value) VALUES (?,?,?) ON CONFLICT(user_id, track_id) DO UPDATE SET value = excluded.value, created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(userId, trackId, value);
}
