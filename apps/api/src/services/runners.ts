// Binds job kinds to their runners and resumes the persistent queue. Called once from buildApp().
import type { DB } from '../lib/db.js';
import { enqueue, initJobs, setRunner } from './jobs.js';
import { runUrlImport } from './ytdlp.js';
import { runAcquireAlbum, runAcquireArtist, runAcquireTrack, runRefetch, tracksWithSharedAudio } from './acquire.js';
import { runCanvasJob } from './canvas.js';
import { runLyricsBatch } from './lrclib.js';

export function registerRunners(db: DB) {
  setRunner('url', (job, p, api) => runUrlImport(db, job, p, api));
  setRunner('lyrics', (job, _p, api) => runLyricsBatch(db, job, api));
  setRunner('acquire', (job, p, api) => (p.kind === 'refetch' ? runRefetch(db, job, p.trackIds ?? [], api) : p.kind === 'track' ? runAcquireTrack(db, job, p.id, api) : p.kind === 'album' ? runAcquireAlbum(db, job, p.id, api) : runAcquireArtist(db, job, p.id, api)));
  setRunner('canvas', (job, p, api) => runCanvasJob(db, job, p, api));
  initJobs(db);
  repairSharedAudioOnce(db);
}

/** One-time fix for libraries built before sources were exclusive: re-fetch tracks that got another track's audio. */
function repairSharedAudioOnce(db: DB) {
  const key = 'repair-shared-audio-v1';
  if (db.prepare('SELECT 1 FROM app_meta WHERE key = ?').get(key)) return;
  db.prepare('INSERT INTO app_meta(key, value) VALUES (?, ?)').run(key, new Date().toISOString());
  const ids = tracksWithSharedAudio(db);
  if (ids.length) enqueue({ kind: 'acquire', title: `Исправление треков с чужим звуком (${ids.length})`, requestedBy: null }, { kind: 'refetch', trackIds: ids });
}
