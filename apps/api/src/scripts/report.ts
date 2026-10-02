// Short state report printed after each deploy (no secrets): the apps' latest crash reports, what the
// download queue is doing, and the YouTube accounts' health.
import crypto from 'node:crypto';
import os from 'node:os';
import { config } from '../config.js';
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

// How fast the live server answers what the apps open, signed in as the admin (a 2-minute token signed
// here, never printed), plus the machine's load: slow pages are either slow queries or a busy machine.
console.log('\n== speed ==');
console.log(`-- cpus ${os.cpus().length}, load ${os.loadavg().map((x) => x.toFixed(2)).join(' ')}, memory free ${(os.freemem() / 2 ** 30).toFixed(1)} of ${(os.totalmem() / 2 ** 30).toFixed(1)} GB`);
const admin = db.prepare(`SELECT id, role FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`).get() as { id: string; role: string } | undefined;
if (admin) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: admin.id, role: admin.role, scope: 'access', iat: now, exp: now + 120 })}`;
  const token = `${unsigned}.${crypto.createHmac('sha256', config.jwtSecret).update(unsigned).digest('base64url')}`;
  const one = (sql: string) => (db.prepare(sql).get() as { id: string } | undefined)?.id;
  const album = one('SELECT id FROM albums ORDER BY random() LIMIT 1');
  const artist = one('SELECT id FROM artists ORDER BY random() LIMIT 1');
  const paths = [
    '/api/health', '/api/health', '/api/health',
    '/api/home', '/api/home', '/api/me/likes/ids', '/api/playlists', '/api/genres',
    '/api/albums?sort=recent&limit=200', '/api/artists?sort=popular&limit=200',
    ...(album ? [`/api/albums/${album}`] : []), ...(artist ? [`/api/artists/${artist}`] : []),
    '/api/search?q=a&type=all&limit=20', '/api/me/stats', '/api/suggestions', '/api/catalog/search?q=queen&limit=12',
  ];
  for (const p of paths) {
    const t0 = performance.now();
    try {
      const r = await fetch(`http://127.0.0.1:${config.port}${p}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
      const body = await r.arrayBuffer();
      console.log(`-- ${String(Math.round(performance.now() - t0)).padStart(6)} ms  ${r.status}  ${String(Math.round(body.byteLength / 1024)).padStart(5)} KB  ${p.replace(/[0-9a-f-]{20,}/g, ':id')}`);
    } catch (e: any) {
      console.log(`-- ${String(Math.round(performance.now() - t0)).padStart(6)} ms  failed (${e?.message ?? e})  ${p}`);
    }
  }
}
