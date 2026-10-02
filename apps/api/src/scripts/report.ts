// Short state report printed after each deploy (no secrets): the apps' latest crash reports, what the
// download queue is doing, and the YouTube accounts' health.
import { openDatabase } from '../lib/db.js';
import { listAccounts } from '../services/youtubeAccounts.js';

const db = openDatabase();
const parse = (s: string | null) => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

console.log('== crash reports from the apps (latest 5) ==');
for (const e of db.prepare('SELECT * FROM client_errors ORDER BY id DESC LIMIT 5').all() as any[]) {
  console.log(`-- ${e.created_at} ${e.app} ${e.version ?? ''} ${e.device ?? ''}\n${e.message}\n${String(e.stack ?? '').split('\n').slice(0, 25).join('\n')}`);
}

console.log('\n== jobs: running / queued ==');
for (const j of db.prepare(`SELECT * FROM jobs WHERE status IN ('running','queued') ORDER BY created_at`).all() as any[]) {
  console.log(`-- ${j.status} ${j.kind} ${j.progress}% "${j.title ?? ''}" since ${j.created_at}`);
  for (const l of parse(j.log).slice(-12)) console.log(`   ${l}`);
}
console.log('\n== jobs: latest finished ==');
for (const j of db.prepare(`SELECT * FROM jobs WHERE status IN ('done','error') ORDER BY finished_at DESC LIMIT 8`).all() as any[]) {
  const mins = j.finished_at ? Math.round((Date.parse(j.finished_at) - Date.parse(j.created_at)) / 60_000) : '?';
  console.log(`-- ${j.status} ${j.kind} "${j.title ?? ''}" ${mins} min ${j.stats ?? ''} ${j.error ?? ''}`);
  if (j.status === 'error') for (const l of parse(j.log).slice(-6)) console.log(`   ${l}`);
}

console.log('\n== YouTube accounts ==');
for (const a of listAccounts()) console.log(`-- ${a.label}: ${a.cookies} cookies, logged in ${a.loggedIn}`);
