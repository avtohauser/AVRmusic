// Minimal in-process job runner for long tasks (URL import, batch lyrics lookup). One job runs at a time.
import type { Track } from '@avrmusic/shared';
import { newId } from '../lib/util.js';

export interface Job {
  id: string;
  kind: 'url' | 'lyrics' | 'acquire' | 'canvas';
  url?: string;
  mode?: 'audio' | 'video';
  /** Human-readable label (acquire jobs) */
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
}

type Runner = (job: Job, api: { log: (s: string) => void; progress: (p: number) => void; onCancel: (fn: () => void) => void }) => Promise<void>;

const jobs = new Map<string, Job>();
const queue: Array<{ job: Job; run: Runner }> = [];
let active = false;

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(({ cancel: _c, ...j }) => j as Job);
}
export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}
export function removeJob(id: string): boolean {
  const j = jobs.get(id);
  if (!j) return false;
  if (j.status === 'running') { j.cancel?.(); return true; }
  const qi = queue.findIndex((q) => q.job.id === id);
  if (qi >= 0) queue.splice(qi, 1);
  jobs.delete(id);
  return true;
}

export function enqueue(init: Pick<Job, 'kind' | 'url' | 'mode' | 'title' | 'requestedBy'>, run: Runner): Job {
  const job: Job = { id: newId(), status: 'queued', progress: 0, log: [], imported: [], createdAt: new Date().toISOString(), ...init };
  jobs.set(job.id, job);
  queue.push({ job, run });
  // keep only the last 50 finished jobs
  const finished = [...jobs.values()].filter((j) => j.status === 'done' || j.status === 'error').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  while (finished.length > 50) jobs.delete(finished.shift()!.id);
  void pump();
  return job;
}

async function pump() {
  if (active) return;
  const next = queue.shift();
  if (!next) return;
  active = true;
  const { job, run } = next;
  job.status = 'running';
  try {
    await run(job, {
      log: (s) => { job.log.push(s); if (job.log.length > 400) job.log.splice(0, job.log.length - 400); },
      progress: (p) => { job.progress = Math.max(0, Math.min(100, Math.round(p))); },
      onCancel: (fn) => { job.cancel = fn; },
    });
    job.status = 'done';
    job.progress = 100;
  } catch (e: any) {
    job.status = 'error';
    job.error = e?.message ?? String(e);
  } finally {
    job.finishedAt = new Date().toISOString();
    job.cancel = undefined;
    active = false;
    void pump();
  }
}
