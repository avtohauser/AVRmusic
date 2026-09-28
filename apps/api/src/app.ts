import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { config, ensureDirs } from './config.js';
import { openDatabase, type DB } from './lib/db.js';
import { HttpError } from './lib/errors.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import libraryRoutes from './routes/library.js';
import mediaRoutes from './routes/media.js';
import playlistRoutes from './routes/playlists.js';
import meRoutes from './routes/me.js';
import adminRoutes from './routes/admin.js';
import importRoutes from './routes/import.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DB;
  }
}

export async function buildApp(opts: { db?: DB; logger?: boolean } = {}): Promise<FastifyInstance> {
  ensureDirs();
  const app = Fastify({
    logger: opts.logger ?? (config.isProd ? true : { transport: { target: 'pino/file', options: { destination: 1 } } }),
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  });
  app.decorate('db', opts.db ?? openDatabase());

  await app.register(cors, { origin: true, credentials: true, exposedHeaders: ['Content-Disposition', 'Content-Range', 'Accept-Ranges', 'Content-Length'] });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 200, fields: 20 } });
  await app.register(rateLimit, { global: false });
  await app.register(authPlugin);

  // Public images (covers, avatars) — cacheable, content-addressed names
  await app.register(fastifyStatic, { root: config.coversDir, prefix: '/media/covers/', decorateReply: false, maxAge: '30d', immutable: true, cacheControl: true });
  await app.register(fastifyStatic, { root: config.avatarsDir, prefix: '/media/avatars/', decorateReply: false, maxAge: '7d', cacheControl: true });

  await app.register(authRoutes);
  await app.register(libraryRoutes);
  await app.register(mediaRoutes);
  await app.register(playlistRoutes);
  await app.register(meRoutes);
  await app.register(adminRoutes);
  await app.register(importRoutes);

  app.get('/api/health', async () => ({ ok: true, version: config.version }));

  // Digital Asset Links for the Android TWA. Fill ANDROID_PACKAGE / ANDROID_SHA256 in .env after signing.
  app.get('/.well-known/assetlinks.json', async (_req, reply) => {
    const pkg = process.env.ANDROID_PACKAGE || 'app.avrmusic.twa';
    const fps = (process.env.ANDROID_SHA256 || '').split(',').map((s) => s.trim()).filter(Boolean);
    reply.header('Content-Type', 'application/json');
    return [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fps } }];
  });

  // Serve built web client (SPA) if present
  if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: '/', decorateReply: true, wildcard: false, maxAge: 0, cacheControl: true, setHeaders: (res, filePath) => {
      if (/\/assets\//.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else if (/sw\.js$|workbox-.*\.js$|manifest\.webmanifest$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    } });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/media/')) return reply.code(404).send({ error: 'not_found', message: 'Не найдено', statusCode: 404 });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  } else {
    app.get('/', async () => ({ name: 'AVRmusic API', version: config.version, hint: 'Соберите веб-клиент: pnpm build' }));
  }

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message, statusCode: err.statusCode });
    if (err instanceof ZodError) return reply.code(400).send({ error: 'validation', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), statusCode: 400 });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'too_large', message: `Файл больше лимита ${config.maxUploadMb} МБ`, statusCode: 413 });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.code ?? 'error', message: err.message, statusCode: err.statusCode });
    req.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Внутренняя ошибка сервера', statusCode: 500 });
  });

  return app;
}
