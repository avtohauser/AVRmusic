// A nightly copy of the database (and the YouTube sign-ins) next to the music — that is, on the storage
// server, away from the main one: the last two weeks are kept, gzipped.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { getMeta, setMeta } from './meta.js';

const KEEP = 14;
const dir = () => path.join(config.mediaDir, 'backups');
const NAME = /^avrmusic-(\d{4}-\d{2}-\d{2})\.sqlite\.gz$/;

function storageReady() {
  return !config.mediaMarker || fs.existsSync(path.join(config.mediaDir, config.mediaMarker));
}

export function listBackups(): Array<{ name: string; size: number; at: string }> {
  try {
    return fs.readdirSync(dir()).filter((n) => NAME.test(n)).sort().reverse()
      .map((n) => { const s = fs.statSync(path.join(dir(), n)); return { name: n, size: s.size, at: s.mtime.toISOString() }; });
  } catch { return []; }
}

let running: Promise<{ name: string; size: number }> | null = null;

export function backupNow(db: DB): Promise<{ name: string; size: number }> {
  running ??= run(db).finally(() => { running = null; });
  return running;
}

async function run(db: DB) {
  if (!storageReady()) throw new Error('Хранилище не подключено — копию некуда положить');
  fs.mkdirSync(dir(), { recursive: true });
  fs.mkdirSync(config.tmpDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const name = `avrmusic-${day}.sqlite.gz`;
  const tmp = path.join(config.tmpDir, `backup-${day}.sqlite`);
  const out = path.join(dir(), name);
  try {
    await db.backup(tmp);
    await pipeline(fs.createReadStream(tmp), zlib.createGzip({ level: 6 }), fs.createWriteStream(`${out}.part`, { mode: 0o600 }));
    fs.renameSync(`${out}.part`, out);
  } finally {
    fs.rmSync(tmp, { force: true });
    fs.rmSync(`${out}.part`, { force: true });
  }
  const accounts = path.join(config.dataDir, 'youtube-accounts');
  if (fs.existsSync(accounts)) fs.cpSync(accounts, path.join(dir(), 'youtube-accounts'), { recursive: true, force: true });
  for (const old of listBackups().slice(KEEP)) fs.rmSync(path.join(dir(), old.name), { force: true });
  setMeta(db, 'backup.last', new Date().toISOString());
  return { name, size: fs.statSync(out).size };
}

/** Every night after four (server time), once a day. */
export function startBackups(db: DB) {
  const tick = () => {
    const now = new Date();
    const last = getMeta(db, 'backup.last');
    if (now.getHours() < 4 || (last && last.slice(0, 10) === now.toISOString().slice(0, 10))) return;
    backupNow(db).catch((e) => console.warn(`[backup] ${e?.message ?? e}`));
  };
  setTimeout(tick, 5 * 60_000).unref();
  setInterval(tick, 30 * 60_000).unref();
}
