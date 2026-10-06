// Small settings kept in the database (app_meta): the admin's keys for outside services, timestamps of
// background work.
import type { DB } from '../lib/db.js';

export function getMeta(db: DB, key: string): string | null {
  return (db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as any)?.value ?? null;
}

export function setMeta(db: DB, key: string, value: string | null) {
  if (value === null) db.prepare('DELETE FROM app_meta WHERE key = ?').run(key);
  else db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
