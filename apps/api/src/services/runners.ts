// Binds job kinds to their runners and resumes the persistent queue. Called once from buildApp().
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { enqueue, initJobs, listJobs, setRunner } from './jobs.js';
import { runUrlImport } from './ytdlp.js';
import { healPending, runAcquireAlbum, runAcquireArtist, runAcquireTrack, runHeal, runRefetch } from './acquire.js';
import { runCanvasJob } from './canvas.js';
import { runLyricsBatch } from './lrclib.js';

export function registerRunners(db: DB) {
  setRunner('url', (job, p, api) => runUrlImport(db, job, p, api));
  setRunner('lyrics', (job, _p, api) => runLyricsBatch(db, job, api));
  setRunner('acquire', (job, p, api) => (p.kind === 'refetch' ? runRefetch(db, job, p.trackIds ?? [], api) : p.kind === 'track' ? runAcquireTrack(db, job, p.id, api) : p.kind === 'album' ? runAcquireAlbum(db, job, p.id, api) : runAcquireArtist(db, job, p.id, api)));
  setRunner('canvas', (job, p, api) => runCanvasJob(db, job, p, api));
  setRunner('heal', async (job, _p, api) => {
    await runHeal(db, job, api);
    // big libraries are checked in batches, one after another
    if (healPending(db).unchecked) setTimeout(() => kickHeal(db), 30_000).unref();
  });
  initJobs(db);
  if (config.autoHeal) {
    setTimeout(() => kickHeal(db), 20_000).unref();
    setInterval(() => kickHeal(db), 6 * 3600 * 1000).unref();
  }
}

/** Queue the self-healing pass (see runHeal) when there is something to check or fix. */
export function kickHeal(db: DB) {
  if (listJobs().some((j) => j.kind === 'heal' && (j.status === 'queued' || j.status === 'running'))) return null;
  const p = healPending(db);
  if (!p.unchecked && !p.targets) return null;
  return enqueue({ kind: 'heal', title: 'Проверка звука треков', requestedBy: null }, {});
}
