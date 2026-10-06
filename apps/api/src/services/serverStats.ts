// How the servers are doing, for the admin: disks (the main server's and the music storage's), processor
// load and memory, how many people are online and listening, the download queue — now and over the
// last day (a sample every five minutes, kept in memory), to see how far the setup can grow.
import fs from 'node:fs';
import os from 'node:os';
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { listJobs } from './jobs.js';
import { listeningCount } from './social.js';
import { onlineSummary } from './devices.js';
import { downloadSlots, listAccounts } from './youtubeAccounts.js';

interface Sample { at: number; load: number; mem: number; online: number; listening: number }
const history: Sample[] = [];
const DAY = 24 * 3600_000;

function disk(path: string) {
  try {
    const s = fs.statfsSync(path);
    const total = s.blocks * s.bsize, free = s.bavail * s.bsize;
    return { total, free, used: total - free };
  } catch { return null; }
}

/** Busy share of the processors over a short moment (0…1). */
async function cpuBusy(ms = 400): Promise<number> {
  const snap = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { idle: a.idle + c.times.idle, total: a.total + t }; }, { idle: 0, total: 0 });
  const a = snap();
  await new Promise((r) => setTimeout(r, ms));
  const b = snap();
  const total = b.total - a.total;
  return total > 0 ? Math.max(0, Math.min(1, 1 - (b.idle - a.idle) / total)) : 0;
}

function sample(db: DB) {
  const online = onlineSummary();
  const seen = (db.prepare(`SELECT COUNT(*) c FROM users WHERE last_seen_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 minutes')`).get() as any).c as number;
  history.push({
    at: Date.now(), load: os.loadavg()[0] / Math.max(1, os.cpus().length), mem: 1 - os.freemem() / os.totalmem(),
    online: Math.max(online.users, seen), listening: listeningCount(),
  });
  while (history.length && history[0].at < Date.now() - DAY) history.shift();
}

export function startServerStats(db: DB) {
  sample(db);
  setInterval(() => { try { sample(db); } catch { /* next time */ } }, 5 * 60_000).unref();
}

export async function serverStats(db: DB) {
  const main = disk(config.dataDir);
  const media = disk(config.mediaDir);
  // the music folder on the same disk as the database: one disk, shown once
  const sameDisk = !!main && !!media && main.total === media.total && main.free === media.free;
  const online = onlineSummary();
  const seen = (db.prepare(`SELECT COUNT(*) c FROM users WHERE last_seen_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 minutes')`).get() as any).c as number;
  const today = (db.prepare(`SELECT COUNT(DISTINCT user_id) c FROM plays WHERE played_at > datetime('now','-1 day')`).get() as any).c as number;
  const jobs = listJobs();
  const accounts = listAccounts();
  const musicBytes = (db.prepare('SELECT COALESCE(SUM(file_size),0) c FROM tracks').get() as any).c as number;
  const tracks = (db.prepare('SELECT COUNT(*) c FROM tracks').get() as any).c as number;
  const mem = process.memoryUsage();
  return {
    disks: [
      ...(main ? [{ name: sameDisk ? 'Сервер (база и музыка)' : 'Основной сервер (база)', ...main }] : []),
      ...(media && !sameDisk ? [{ name: 'Хранилище музыки', ...media }] : []),
    ],
    music: { bytes: musicBytes, tracks, avgTrackBytes: tracks ? Math.round(musicBytes / tracks) : 0 },
    cpu: { cores: os.cpus().length, busy: await cpuBusy(), load: os.loadavg() },
    memory: { total: os.totalmem(), free: os.freemem(), app: mem.rss },
    uptime: { server: os.uptime(), app: process.uptime() },
    people: { online: Math.max(online.users, seen), devices: online.devices, byKind: online.byKind, listening: listeningCount(), today },
    downloads: {
      running: jobs.filter((j) => j.status === 'running').length, queued: jobs.filter((j) => j.status === 'queued').length,
      slots: downloadSlots(), accounts: accounts.length, exits: 1 + config.downloadProxies.length,
    },
    history: history.map((h) => ({ ...h, at: new Date(h.at).toISOString() })),
  };
}
