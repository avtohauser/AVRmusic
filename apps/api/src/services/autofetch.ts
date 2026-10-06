// The discographies of the artists people love come to the server by themselves: liked or followed
// artists, and the ones played a lot lately. One discography at a time, behind everything people ask
// for themselves, each artist again only after a month and a half (new releases of followed artists
// come in between anyway). The admin can switch it off (Админка → Сервисы).
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { enqueue, listJobs } from './jobs.js';
import { getMeta, setMeta } from './meta.js';

const DAY = 24 * 3600_000;
const AGAIN_AFTER = 45 * DAY;

export const autofetchOn = (db: DB) => getMeta(db, 'autofetch.off') !== '1' && config.acquireRole !== 'off';

/** Artists worth having whole, most loved first: (catalogue id, name, who loves them). */
export function lovedArtists(db: DB): Array<{ deezerId: number; name: string; userId: string; score: number }> {
  const rows = db.prepare(`
    SELECT a.deezer_id did, a.name, l.user_id uid, 100 score FROM likes l JOIN artists a ON a.id = l.entity_id
      WHERE l.entity_type = 'artist' AND a.deezer_id IS NOT NULL
    UNION ALL
    SELECT f.deezer_artist_id did, f.name, f.user_id uid, 90 score FROM artist_follows f WHERE f.name <> ''
    UNION ALL
    SELECT a.deezer_id did, a.name, p.user_id uid, COUNT(*) score FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
      WHERE a.deezer_id IS NOT NULL AND p.ms_played >= 30000 AND p.played_at > datetime('now','-60 days')
      GROUP BY a.id, p.user_id HAVING COUNT(*) >= 12`).all() as any[];
  const best = new Map<number, { deezerId: number; name: string; userId: string; score: number }>();
  for (const r of rows) {
    const k = Number(r.did);
    const had = best.get(k);
    if (!had) best.set(k, { deezerId: k, name: r.name, userId: r.uid, score: r.score });
    else had.score += r.score;
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** The next loved artist due for a discography check, if nothing of this kind is going on already. */
export function autofetchTick(db: DB): string | null {
  if (!autofetchOn(db)) return null;
  const jobs = listJobs();
  if (jobs.some((j) => (j.status === 'queued' || j.status === 'running') && (j.payload as any)?.auto)) return null;
  // people's own requests first: nothing new while several of them are waiting
  if (jobs.filter((j) => j.status === 'queued' && j.kind === 'acquire').length >= 2) return null;
  for (const a of lovedArtists(db)) {
    const last = Number(getMeta(db, `autofetch.a.${a.deezerId}`) ?? 0);
    if (Date.now() - last < AGAIN_AFTER) continue;
    const title = `${a.name} — дискография`;
    if (jobs.some((j) => (j.status === 'queued' || j.status === 'running') && j.title === title)) continue;
    setMeta(db, `autofetch.a.${a.deezerId}`, String(Date.now()));
    const job = enqueue({ kind: 'acquire', title, requestedBy: a.userId }, { kind: 'artist', id: a.deezerId, auto: true });
    return job.id;
  }
  return null;
}

export function startAutofetch(db: DB) {
  const tick = () => { try { autofetchTick(db); } catch { /* next time */ } };
  setTimeout(tick, 20 * 60_000).unref();
  setInterval(tick, 30 * 60_000).unref();
}
