// Job runner with a persistent queue (URL import, batch lyrics, catalogue acquisition, canvases).
// One job runs at a time. Jobs are stored in SQLite, so a restart or deploy resumes unfinished ones.
import type { Track } from '@avrmusic/shared';
import type { DB } from '../lib/db.js';
import { newId } from '../lib/util.js';

export type JobKind = 'url' | 'lyrics' | 'acquire' | 'canvas' | 'heal';

export interface Job {
  id: string;
  kind: JobKind;
  url?: string;
  mode?: 'audio' | 'video';
  /** Human-readable label (acquire / canvas jobs) */
  title?: string;
  requestedBy?: string | null;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  log: string[];
  imported: Track[];
  error?: string;
  createdAt: string;
  finishedAt?: string;
  stats?: Record<string, number>;
  cancel?: () => void;
  /** How to (re)run the job; never sent to clients */
  payload?: unknown;
}

export type JobApi = { log: (s: string) => void; progress: (p: number) => void; onCancel: (fn: () => void) => void };
export type Runner = (job: Job, payload: any, api: JobApi) => Promise<void>;

const jobs = new Map<string, Job>();
const queue: Job[] = [];
const runners = new Map<JobKind, Runner>();
let db: DB | null = null;
/** Jobs running right now (at most MAX_RUNNING; background jobs only when nothing else runs). */
let running = 0;
const MAX_RUNNING = 1;

export function setRunner(kind: JobKind, run: Runner) {
  runners.set(kind, run);
}

/** Attach persistence, load recent history and resume jobs that were queued or running when the process died. */
export function initJobs(database: DB) {
  db = database;
  const rows = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 200').all() as any[];
  for (const r of rows.reverse()) jobs.set(r.id, fromRow(r));
  const unfinished = [...jobs.values()].filter((j) => (j.status === 'queued' || j.status === 'running') && !queue.includes(j)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  for (const j of unfinished) {
    if (j.status === 'running') j.log.push('↻ сервер перезапустился — задача продолжена');
    j.status = 'queued'; j.progress = 0;
    save(j);
    queue.push(j);
  }
  void pump();
}

function fromRow(r: any): Job {
  const parse = (s: any, def: any) => { try { return s ? JSON.parse(s) : def; } catch { return def; } };
  return {
    id: r.id, kind: r.kind, title: r.title ?? undefined, url: r.url ?? undefined, mode: r.mode ?? undefined, requestedBy: r.requested_by ?? null,
    status: r.status, progress: r.progress ?? 0, log: parse(r.log, []), imported: parse(r.imported, []), stats: parse(r.stats, undefined),
    error: r.error ?? undefined, createdAt: r.created_at, finishedAt: r.finished_at ?? undefined, payload: parse(r.payload, {}),
  };
}

function save(job: Job) {
  if (!db) return;
  db.prepare(`INSERT INTO jobs(id, kind, title, url, mode, requested_by, status, progress, log, imported, stats, error, created_at, finished_at, payload)
    VALUES (@id, @kind, @title, @url, @mode, @requested_by, @status, @progress, @log, @imported, @stats, @error, @created_at, @finished_at, @payload)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, progress = excluded.progress, log = excluded.log, imported = excluded.imported,
      stats = excluded.stats, error = excluded.error, finished_at = excluded.finished_at`).run({
    id: job.id, kind: job.kind, title: job.title ?? null, url: job.url ?? null, mode: job.mode ?? null, requested_by: job.requestedBy ?? null,
    status: job.status, progress: job.progress, log: JSON.stringify(job.log.slice(-400)), imported: JSON.stringify(job.imported),
    stats: job.stats ? JSON.stringify(job.stats) : null, error: job.error ?? null, created_at: job.createdAt, finished_at: job.finishedAt ?? null,
    payload: JSON.stringify(job.payload ?? {}),
  });
}

const publicJob = ({ cancel: _c, payload: _p, ...j }: Job): Job => j as Job;

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(publicJob);
}
export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}
export function removeJob(id: string): boolean {
  const j = jobs.get(id);
  if (!j) return false;
  if (j.status === 'running') { j.cancel?.(); return true; }
  const qi = queue.indexOf(j);
  if (qi >= 0) queue.splice(qi, 1);
  jobs.delete(id);
  db?.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  return true;
}

export function enqueue(init: Pick<Job, 'kind' | 'url' | 'mode' | 'title' | 'requestedBy'>, payload: unknown = {}): Job {
  const job: Job = { id: newId(), status: 'queued', progress: 0, log: [], imported: [], createdAt: new Date().toISOString(), ...init, payload };
  jobs.set(job.id, job);
  save(job);
  queue.push(job);
  // keep only the last 50 finished jobs
  const finished = [...jobs.values()].filter((j) => j.status === 'done' || j.status === 'error').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  while (finished.length > 50) { const old = finished.shift()!; jobs.delete(old.id); db?.prepare('DELETE FROM jobs WHERE id = ?').run(old.id); }
  void pump();
  return publicJob(job) as Job & { id: string };
}

/** Background upkeep (self-healing, canvases) that always lets the users' own downloads go first. */
const BACKGROUND: JobKind[] = ['heal', 'canvas'];
/** A user's job is waiting: a background job should wrap up and continue later. */
export function userJobWaiting(): boolean { return queue.some((j) => !BACKGROUND.includes(j.kind)); }

async function pump() {
  if (running >= MAX_RUNNING) return;
  const first = queue.findIndex((j) => !BACKGROUND.includes(j.kind));
  if (first < 0 && running > 0) return; // background work waits until the users' jobs are done
  const job = first >= 0 ? queue.splice(first, 1)[0] : queue.shift();
  if (!job) return;
  running++;
  void pump(); // a second slot may be free
  job.status = 'running';
  save(job);
  // progress/log are written at most once a second
  let dirty = false;
  let timer: NodeJS.Timeout | null = null;
  const touch = () => { dirty = true; if (!timer) timer = setTimeout(() => { timer = null; if (dirty) { dirty = false; save(job); } }, 1000); };
  try {
    const run = runners.get(job.kind);
    if (!run) throw new Error(`Неизвестный тип задачи: ${job.kind}`);
    await run(job, job.payload ?? {}, {
      log: (s) => { job.log.push(s); if (job.log.length > 400) job.log.splice(0, job.log.length - 400); touch(); },
      progress: (p) => { job.progress = Math.max(0, Math.min(100, Math.round(p))); touch(); },
      onCancel: (fn) => { job.cancel = fn; },
    });
    job.status = 'done';
    job.progress = 100;
  } catch (e: any) {
    job.status = 'error';
    job.error = e?.message ?? String(e);
  } finally {
    if (timer) clearTimeout(timer);
    job.finishedAt = new Date().toISOString();
    job.cancel = undefined;
    save(job);
    running--;
    void pump();
  }
}
