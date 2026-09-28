import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServerInfo } from '@avrmusic/shared';
import { config } from '../config.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { changePassword, getUser, issueTokens, register, revokeRefresh, rotateRefresh, userCount, verifyLogin } from '../services/auth.js';
import { checkInvite, consumeInvite } from '../services/invites.js';

export default async function authRoutes(app: FastifyInstance) {
  const db = app.db;

  app.get('/api/info', async (): Promise<ServerInfo> => ({
    name: 'AVRmusic',
    version: config.version,
    allowRegistration: config.allowRegistration,
    inviteRequired: userCount(db) > 0,
    publicLibrary: config.publicLibrary,
    maxUploadMb: config.maxUploadMb,
    needsSetup: userCount(db) === 0,
    catalog: config.catalogEnabled,
    acquire: config.acquireRole,
    acquireSource: config.acquireSource,
    acquireSources: config.acquireSources,
  }));

  app.post('/api/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const body = z.object({ email: z.string(), username: z.string(), password: z.string(), displayName: z.string().optional(), inviteCode: z.string().optional() }).parse(req.body);
    const first = userCount(db) === 0;
    if (!config.allowRegistration && !first) throw forbidden('Регистрация отключена администратором');
    // After the first (admin) account every registration consumes a one-time code issued in the admin panel.
    const code = first ? null : checkInvite(db, body.inviteCode);
    const user = await register(db, body);
    if (code && !consumeInvite(db, code, user.id)) {
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
      throw forbidden('Этот код приглашения уже использован');
    }
    return issueTokens(app, db, user);
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const body = z.object({ login: z.string(), password: z.string() }).parse(req.body);
    const user = await verifyLogin(db, body.login, body.password);
    return issueTokens(app, db, user);
  });

  app.post('/api/auth/refresh', async (req) => {
    const body = z.object({ refreshToken: z.string() }).parse(req.body);
    return rotateRefresh(app, db, body.refreshToken);
  });

  app.post('/api/auth/logout', async (req) => {
    const body = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {});
    if (body.refreshToken) revokeRefresh(db, body.refreshToken);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: app.authenticate }, async (req) => {
    const u = getUser(db, req.userId!);
    if (!u) throw badRequest('Пользователь не найден');
    return u;
  });

  app.patch('/api/auth/me', { preHandler: app.authenticate }, async (req) => {
    const body = z.object({ displayName: z.string().min(1).max(60).optional(), email: z.string().email().optional() }).parse(req.body);
    if (body.displayName) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(body.displayName.trim(), req.userId);
    if (body.email) db.prepare('UPDATE users SET email = ? WHERE id = ?').run(body.email.toLowerCase(), req.userId);
    return getUser(db, req.userId!);
  });

  app.post('/api/auth/me/password', { preHandler: app.authenticate }, async (req) => {
    const body = z.object({ oldPassword: z.string(), newPassword: z.string() }).parse(req.body);
    await changePassword(db, req.userId!, body.oldPassword, body.newPassword);
    return { ok: true };
  });
}
