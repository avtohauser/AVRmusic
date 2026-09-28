import crypto from 'node:crypto';
import type { Invite } from '@avrmusic/shared';
import type { DB } from '../lib/db.js';
import { forbidden, notFound } from '../lib/errors.js';

/** Unambiguous alphabet (no 0/O, 1/I/L). Codes are stored without the dash, shown as XXXX-XXXX. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(): string {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

const SELECT = `SELECT i.*, u.username AS used_username, u.display_name AS used_display_name, c.username AS created_username
  FROM invites i LEFT JOIN users u ON u.id = i.used_by LEFT JOIN users c ON c.id = i.created_by`;

function mapInvite(r: any): Invite {
  return {
    code: formatCode(r.code),
    note: r.note ?? null,
    createdAt: r.created_at,
    createdBy: r.created_username ?? null,
    expiresAt: r.expires_at ?? null,
    usedAt: r.used_at ?? null,
    usedBy: r.used_by ? { id: r.used_by, username: r.used_username, displayName: r.used_display_name } : null,
  };
}

export function listInvites(db: DB): Invite[] {
  return (db.prepare(`${SELECT} ORDER BY i.created_at DESC`).all() as any[]).map(mapInvite);
}

export function createInvite(db: DB, adminId: string, opts: { note?: string; expiresDays?: number } = {}): Invite {
  const code = generateCode();
  const expires = opts.expiresDays ? new Date(Date.now() + opts.expiresDays * 86400_000).toISOString() : null;
  db.prepare('INSERT INTO invites(code, created_by, note, expires_at) VALUES (?,?,?,?)').run(code, adminId, (opts.note ?? '').trim() || null, expires);
  return mapInvite(db.prepare(`${SELECT} WHERE i.code = ?`).get(code));
}

export function deleteInvite(db: DB, code: string) {
  const r = db.prepare('DELETE FROM invites WHERE code = ?').run(normalizeCode(code));
  if (!r.changes) throw notFound('Код не найден');
}

/** Returns the normalized code of a valid (unused, unexpired) invite or throws 403. */
export function checkInvite(db: DB, raw: string | undefined): string {
  const code = normalizeCode(raw ?? '');
  const r = code ? (db.prepare('SELECT code, used_by, expires_at FROM invites WHERE code = ?').get(code) as any) : null;
  if (!r) throw forbidden('Неверный код приглашения');
  if (r.used_by) throw forbidden('Этот код приглашения уже использован');
  if (r.expires_at && r.expires_at < new Date().toISOString()) throw forbidden('Срок действия кода приглашения истёк');
  return code;
}

/** Marks the code as used by `userId`; false when someone else consumed it first. */
export function consumeInvite(db: DB, code: string, userId: string): boolean {
  const r = db.prepare(`UPDATE invites SET used_by = ?, used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE code = ? AND used_by IS NULL`).run(userId, code);
  return r.changes === 1;
}
