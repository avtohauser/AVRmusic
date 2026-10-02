// Job runner with a persistent queue (URL import, batch lyrics, catalogue acquisition, canvases).
// One job runs at a time. Jobs are stored in SQLite, so a restart or deploy resumes unfinished ones.
import type { Track } from '@avrmusic/shared';
import type { DB } from '../lib/db.js';
import { newId } from '../lib/util.js';

export type JobKind = 'url' | 'lyrics' | 'acquire' | 'canvas' | 'heal';

export interface Job {
  id: string;
  /** place in the queue (queued users' jobs) */
  position?: number;
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
/**
 * Jobs running right now. The users' jobs (fetching from the catalogue, imports) run two at a time and
 * never wait for background upkeep; background jobs (self-healing, canvases) run one at a time and
 * only start while no user job is running or waiting.
 */
let running = 0;
let userRunning = 0;
const MAX_USER = 2;
/** plus one slot for a single track or album, so it never waits hours behind whole discographies */
let expressRunning = 0;

/** Background upkeep (self-healing, canvases) that always lets the users' own downloads go first. */
const BACKGROUND: JobKind[] = ['heal', 'canvas'];
const isSmall = (j: Job) => j.kind === 'acquire' && ['track', 'album'].includes((j.payload as any)?.kind);
const isUser = (j: Job) => !BACKGROUND.includes(j.kind);

/** Queued users' jobs in the order they will start: tracks and albums first, then by request time. */
function userOrder(): Job[] {
  return queue.filter(isUser).map((j, i) => ({ j, i })).sort((a, b) => (isSmall(a.j) ? 0 : 1) - (isSmall(b.j) ? 0 : 1) || a.i - b.i).map((x) => x.j);
}

/** The next user job: small requests first; among the rest, someone who has nothing running yet. */
function nextUserJob(): Job | undefined {
  const order = userOrder();
  if (!order.length) return undefined;
  const busy = new Set([...jobs.values()].filter((j) => j.status === 'running' && isUser(j)).map((j) => j.requestedBy));
  if (isSmall(order[0])) return order[0];
  return order.find((j) => !busy.has(j.requestedBy)) ?? order[0];
}

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
  const order = userOrder();
  return [...jobs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((j) => ({ ...publicJob(j), position: j.status === 'queued' && isUser(j) ? order.indexOf(j) + 1 : undefined }));
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

/** A user's job is waiting: a background job should wrap up and continue later. */
export function userJobWaiting(): boolean { return userRunning > 0 || queue.some((j) => !BACKGROUND.includes(j.kind)); }

/** A job of this kind is waiting in the queue. */
export function kindWaiting(kind: JobKind): boolean { return queue.some((j) => j.kind === kind); }

async function pump() {
  const next = nextUserJob();
  let job: Job | undefined;
  let express = false;
  if (next) {
    if (userRunning >= MAX_USER) {
      if (!isSmall(next) || expressRunning >= 1) return;
      express = true;
    }
    job = queue.splice(queue.indexOf(next), 1)[0];
  } else {
    // background work waits until nothing else runs; sound checks before canvases (a nicety)
    if (running > 0 || !queue.length) return;
    const first = queue.findIndex((j) => j.kind !== 'canvas');
    job = queue.splice(first >= 0 ? first : 0, 1)[0];
  }
  if (!job) return;
  const user = isUser(job);
  running++;
  if (express) expressRunning++;
  else if (user) userRunning++;
  void pump(); // another slot may be free
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
    if (express) expressRunning--;
    else if (user) userRunning--;
    void pump();
  }
}
