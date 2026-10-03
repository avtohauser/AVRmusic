// My Wave brings new music, not only what is already on the server. For each listener a background job
// picks new releases of the artists they love and the best tracks of artists related to their
// favourites (from the catalogue), and fetches a few of them a day. The wave mixes them in, saying why.
// Low priority: it runs only while nobody's own download waits, and steps aside when one comes.
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { enqueue, userJobWaiting, type Job, type JobApi } from './jobs.js';
import { acquireTrack } from './acquire.js';
import { rawAlbum, rawArtistAlbumsPage, rawArtistTop, rawRelatedArtists } from './catalog.js';
import { userTaste } from './wave.js';

/** New tracks fetched for one listener a day, and per run. */
const PER_DAY = 8;
const PER_RUN = 4;

interface Candidate { deezerId: number; reason: string }

const foundToday = (db: DB, userId: string) =>
  (db.prepare(`SELECT COUNT(*) n FROM wave_found WHERE user_id = ? AND status IN ('imported','exists') AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')`).get(userId) as any).n as number;

/** Tracks the wave could bring next for this listener (not on the server yet), best first. */
export async function discoveryCandidates(db: DB, userId: string, max = 16): Promise<Candidate[]> {
  const taste = userTaste(db, userId);
  const seeds = [...taste.artist].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    .map(([id]) => db.prepare('SELECT id, name, deezer_id FROM artists WHERE id = ? AND deezer_id IS NOT NULL').get(id) as any)
    .filter(Boolean).slice(0, 12);
  if (!seeds.length) return [];
  const tried = new Set((db.prepare('SELECT deezer_id FROM wave_found WHERE user_id = ?').all(userId) as any[]).map((r) => Number(r.deezer_id)));
  // artists the listener turned away from (skips, dislikes) stay out, also as "related"
  const avoid = new Set((db.prepare('SELECT id, deezer_id FROM artists WHERE deezer_id IS NOT NULL').all() as any[])
    .filter((a) => (taste.artist.get(a.id) ?? 0) < 0).map((a) => Number(a.deezer_id)));
  const seen = new Set<number>();
  const ok = (id: number) => id && !seen.has(id) && !tried.has(id) && !db.prepare('SELECT 1 FROM tracks WHERE deezer_id = ?').get(id);

  // 1) new releases (last 4 months) of the favourite artists: the first tracks of each
  const fresh: Candidate[] = [];
  const cutoff = new Date(Date.now() - 122 * 86_400_000).toISOString().slice(0, 10);
  for (const a of seeds.slice(0, 5)) {
    const albums = (await rawArtistAlbumsPage(db, Number(a.deezer_id), 10)).filter((x) => (x.release_date ?? '') >= cutoff).slice(0, 2);
    for (const al of albums) {
      const full = await rawAlbum(db, Number(al.id)).catch(() => null);
      for (const t of (full?.tracks?.data ?? []).slice(0, 2)) {
        if (!ok(Number(t.id))) continue;
        seen.add(Number(t.id));
        fresh.push({ deezerId: Number(t.id), reason: `Новый релиз ${a.name}` });
      }
    }
  }
  // 2) the best tracks of artists related to the favourites, taking turns between favourites
  const bySeed: Candidate[][] = [];
  for (const a of seeds.slice(0, 8)) {
    const list: Candidate[] = [];
    const related = (await rawRelatedArtists(db, Number(a.deezer_id), 10)).filter((r) => !avoid.has(Number(r.id))).slice(0, 4);
    for (const r of related) {
      for (const t of await rawArtistTop(db, Number(r.id), 2)) {
        if (!ok(Number(t.id))) continue;
        seen.add(Number(t.id));
        list.push({ deezerId: Number(t.id), reason: `Похоже на ${a.name}` });
      }
    }
    bySeed.push(list);
  }
  // the related lists of the next favourites, cached, make the wave's "similar" graph richer too
  for (const a of seeds.slice(8)) await rawRelatedArtists(db, Number(a.deezer_id), 10).catch(() => []);

  const mixed: Candidate[] = [];
  while (bySeed.some((l) => l.length)) for (const l of bySeed) { const c = l.shift(); if (c) mixed.push(c); }
  // a new release now and then, related artists in between
  const out: Candidate[] = [];
  while ((fresh.length || mixed.length) && out.length < max) {
    if (fresh.length) out.push(fresh.shift()!);
    out.push(...mixed.splice(0, 2));
  }
  return out.slice(0, max);
}

/** Runner of a "discover" job: fetch a few new tracks for one listener. */
export async function runDiscovery(db: DB, job: Job, payload: { userId?: string }, api: JobApi) {
  const userId = payload.userId;
  if (!userId) return;
  const cancelRef: { cancel?: () => void } = {};
  let cancelled = false;
  api.onCancel(() => { cancelled = true; cancelRef.cancel?.(); });
  let budget = Math.min(PER_RUN, PER_DAY - foundToday(db, userId));
  if (budget <= 0) { api.log('На сегодня новинок хватит'); return; }
  const cands = await discoveryCandidates(db, userId, budget * 3);
  job.stats = { imported: 0, exists: 0, failed: 0, total: budget };
  api.log(`Кандидатов: ${cands.length}, возьму до ${budget}`);
  for (const c of cands) {
    if (budget <= 0 || cancelled) break;
    if (userJobWaiting()) { api.log('⏸ уступаю очередь загрузкам пользователей — продолжу позже'); break; }
    api.log(`✦ ${c.reason}`);
    const r = await acquireTrack(db, c.deezerId, api, cancelRef, undefined, null).catch((e: any) => ({ status: 'error' as const, message: String(e?.message ?? e) }));
    db.prepare(`INSERT INTO wave_found(user_id, deezer_id, track_id, reason, status) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id, deezer_id) DO UPDATE SET track_id = excluded.track_id, reason = excluded.reason, status = excluded.status`)
      .run(userId, c.deezerId, (r as any).trackId ?? null, c.reason, r.status);
    if (r.status === 'imported' || r.status === 'exists') { budget--; job.stats[r.status]++; }
    else job.stats.failed++;
  }
}

/** Queue discovery for one listener (or everyone who listened lately) unless it is queued or done for today. */
export function kickDiscovery(db: DB, userId?: string) {
  if (!config.waveDiscovery) return;
  const users = userId
    ? [userId]
    : (db.prepare(`SELECT DISTINCT user_id FROM plays WHERE user_id IS NOT NULL AND played_at > datetime('now','-7 days')`).all() as any[]).map((r) => r.user_id as string);
  for (const u of users) {
    if (db.prepare(`SELECT 1 FROM jobs WHERE kind = 'discover' AND requested_by = ? AND status IN ('queued','running')`).get(u)) continue;
    if (foundToday(db, u) >= PER_DAY) continue;
    enqueue({ kind: 'discover', title: 'Моя волна: ищу новое', requestedBy: u }, { userId: u });
  }
}

/** New tracks the wave found for this listener: track id → why. */
export function foundFor(db: DB, userId: string): Map<string, string> {
  return new Map((db.prepare(`SELECT track_id, reason FROM wave_found WHERE user_id = ? AND track_id IS NOT NULL AND status IN ('imported','exists')`).all(userId) as any[])
    .map((r) => [r.track_id as string, r.reason as string]));
}
