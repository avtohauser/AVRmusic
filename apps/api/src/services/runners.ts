// Binds job kinds to their runners and resumes the persistent queue. Called once from buildApp().
import type { DB } from '../lib/db.js';
import { initJobs, setRunner } from './jobs.js';
import { runUrlImport } from './ytdlp.js';
import { runAcquireAlbum, runAcquireArtist, runAcquireTrack } from './acquire.js';
import { runCanvasJob } from './canvas.js';
import { runLyricsBatch } from './lrclib.js';

export function registerRunners(db: DB) {
  setRunner('url', (job, p, api) => runUrlImport(db, job, p, api));
  setRunner('lyrics', (job, _p, api) => runLyricsBatch(db, job, api));
  setRunner('acquire', (job, p, api) => (p.kind === 'track' ? runAcquireTrack(db, job, p.id, api) : p.kind === 'album' ? runAcquireAlbum(db, job, p.id, api) : runAcquireArtist(db, job, p.id, api)));
  setRunner('canvas', (job, p, api) => runCanvasJob(db, job, p, api));
  initJobs(db);
}
