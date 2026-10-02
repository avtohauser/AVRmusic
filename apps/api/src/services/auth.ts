import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import type { DB } from '../lib/db.js';
import type { AuthTokens, User } from '@avrmusic/shared';
import { newId, newToken } from '../lib/util.js';
import { config } from '../config.js';
import { avatarUrl } from './library.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';

export interface JwtPayload {
  sub: string;
  role: 'admin' | 'user';
  scope: 'access' | 'media';
}

export function mapUser(r: any): User {
  return {
    id: r.id,
    email: r.email,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    avatarUrl: avatarUrl(r.avatar_path),
    createdAt: r.created_at,
    canAcquire: r.role === 'admin' || r.can_acquire !== 0,
  };
}

export function getUser(db: DB, id: string): User | null {
  const r = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return r ? mapUser(r) : null;
}

export function userCount(db: DB): number {
  return (db.prepare('SELECT COUNT(*) c FROM users').get() as any).c;
}

export async function register(db: DB, data: { email: string; username: string; password: string; displayName?: string }): Promise<User> {
  const email = data.email.trim().toLowerCase();
  const username = data.username.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw badRequest('Имя пользователя: 3–32 символа, латиница, цифры, _ . -');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw badRequest('Некорректный e-mail');
  if (data.password.length < 6) throw badRequest('Пароль должен быть не короче 6 символов');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw conflict('E-mail уже зарегистрирован');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw conflict('Имя пользователя занято');
  const isFirst = userCount(db) === 0;
  const id = newId();
  const hash = await bcrypt.hash(data.password, 10);
  db.prepare('INSERT INTO users(id, email, username, display_name, password_hash, role) VALUES (?,?,?,?,?,?)').run(
    id, email, username, (data.displayName ?? '').trim() || data.username.trim(), hash, isFirst ? 'admin' : 'user',
  );
  return getUser(db, id)!;
}

export async function verifyLogin(db: DB, login: string, password: string): Promise<User> {
  const l = login.trim().toLowerCase();
  const r = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(l, l) as any;
  if (!r) throw unauthorized('Неверный логин или пароль');
  const ok = await bcrypt.compare(password, r.password_hash);
  if (!ok) throw unauthorized('Неверный логин или пароль');
  if (r.disabled) throw unauthorized('Аккаунт заблокирован администратором');
  return mapUser(r);
}

export function issueTokens(app: FastifyInstance, db: DB, user: User): AuthTokens {
  const accessToken = app.jwt.sign({ sub: user.id, role: user.role, scope: 'access' } satisfies JwtPayload, { expiresIn: config.accessTtl });
  const mediaToken = app.jwt.sign({ sub: user.id, role: user.role, scope: 'media' } satisfies JwtPayload, { expiresIn: config.mediaTtl });
  const refreshToken = newToken();
  const expires = new Date(Date.now() + config.refreshTtlDays * 86400_000).toISOString();
  db.prepare('INSERT INTO refresh_tokens(id, user_id, expires_at) VALUES (?,?,?)').run(refreshToken, user.id, expires);
  db.prepare(`DELETE FROM refresh_tokens WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run();
  return { accessToken, refreshToken, mediaToken, user };
}

export function rotateRefresh(app: FastifyInstance, db: DB, refreshToken: string): AuthTokens {
  const r = db.prepare('SELECT * FROM refresh_tokens WHERE id = ?').get(refreshToken) as any;
  if (!r || r.expires_at < new Date().toISOString()) throw unauthorized('Сессия истекла, войдите снова');
  db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(refreshToken);
  const user = getUser(db, r.user_id);
  if (!user) throw unauthorized();
  if ((db.prepare('SELECT disabled FROM users WHERE id = ?').get(user.id) as any)?.disabled) throw unauthorized('Аккаунт заблокирован администратором');
  return issueTokens(app, db, user);
}

export function revokeRefresh(db: DB, refreshToken: string) {
  db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(refreshToken);
}

export async function changePassword(db: DB, userId: string, oldPassword: string, newPassword: string) {
  const r = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any;
  if (!r || !(await bcrypt.compare(oldPassword, r.password_hash))) throw unauthorized('Старый пароль неверен');
  if (newPassword.length < 6) throw badRequest('Пароль должен быть не короче 6 символов');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(newPassword, 10), userId);
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}
