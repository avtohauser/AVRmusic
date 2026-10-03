import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { notFound, unauthorized } from '../lib/errors.js';
import { getTrackRaw } from '../services/library.js';
import { safeFilename } from '../lib/util.js';
import { config } from '../config.js';
import { compatFile, needsCompat } from '../services/compat.js';

/** Serve a file with HTTP Range support (206 Partial Content), ETag and conditional requests. */
export function sendRange(req: FastifyRequest, reply: FastifyReply, filePath: string, mimeType: string, opts: { download?: string; cache?: string; etag?: string } = {}) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw notFound('Файл отсутствует на диске');
  }
  const size = stat.size;
  const etag = opts.etag ?? `"${size}-${Math.floor(stat.mtimeMs)}"`;
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', mimeType);
  reply.header('ETag', etag);
  reply.header('Last-Modified', stat.mtime.toUTCString());
  reply.header('Cache-Control', opts.cache ?? 'private, max-age=3600');
  if (opts.download) {
    const ascii = opts.download.replace(/[^\x20-\x7e]/g, '_');
    reply.header('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(opts.download)}`);
  }
  if (req.headers['if-none-match'] === etag) {
    reply.code(304);
    return reply.send();
  }

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m) { reply.code(416).header('Content-Range', `bytes */${size}`); return reply.send(); }
    let start = m[1] === '' ? undefined : Number(m[1]);
    let end = m[2] === '' ? undefined : Number(m[2]);
    if (start === undefined && end !== undefined) { start = Math.max(0, size - end); end = size - 1; }
    if (start === undefined) start = 0;
    if (end === undefined || end >= size) end = size - 1;
    if (start > end || start >= size) { reply.code(416).header('Content-Range', `bytes */${size}`); return reply.send(); }
    reply.code(206);
    reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
    reply.header('Content-Length', end - start + 1);
    if (req.method === 'HEAD') return reply.send();
    return reply.send(fs.createReadStream(filePath, { start, end }));
  }
  reply.code(200);
  reply.header('Content-Length', size);
  if (req.method === 'HEAD') return reply.send();
  return reply.send(fs.createReadStream(filePath));
}

function downloadName(row: any, db: FastifyInstance['db']): string {
  const artist = (db.prepare('SELECT name FROM artists WHERE id = ?').get(row.artist_id) as any)?.name ?? 'Unknown';
  return safeFilename(`${artist} - ${row.title}`) + path.extname(row.file_path);
}

export default async function mediaRoutes(app: FastifyInstance) {
  const db = app.db;

  const logDownload = (userId: string | null | undefined, kind: 'file' | 'album' | 'playlist' | 'offline', refId: string, bytes: number | null) => {
    if (userId) db.prepare('INSERT INTO downloads(user_id, kind, ref_id, bytes) VALUES (?,?,?,?)').run(userId, kind, refId, bytes);
  };

  const streamHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const t = getTrackRaw(db, (req.params as any).id);
    if (!t) throw notFound('Трек не найден');
    // the app's "save for offline" fetches the whole file with ?offline=1
    if ((req.query as any)?.offline && !req.headers.range) logDownload(req.userId, 'offline', t.id, t.file_size ?? null);
    // the iOS app asks with ?compat=1: formats Apple can't play come as AAC
    if ((req.query as any)?.compat && needsCompat(t.mime_type)) {
      const file = await compatFile(t.id, t.file_path).catch((e) => { req.log.warn({ err: e }, 'compat conversion failed'); return null; });
      if (file) return sendRange(req, reply, file, 'audio/mp4', { etag: t.file_hash ? `"${t.file_hash}-aac"` : undefined });
    }
    return sendRange(req, reply, t.file_path, t.mime_type, { etag: t.file_hash ? `"${t.file_hash}"` : undefined });
  };
  app.get('/api/stream/:id', { preHandler: app.mediaAuth }, streamHandler);

  // Downloads always require an account (media token via ?t= is fine)
  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    await app.mediaAuth(req, reply);
    if (!req.userId) throw unauthorized('Для скачивания нужно войти');
  };

  app.get('/api/download/:id', { preHandler: requireUser }, async (req, reply) => {
    const t = getTrackRaw(db, (req.params as any).id);
    if (!t) throw notFound('Трек не найден');
    if (!req.headers.range) logDownload(req.userId, 'file', t.id, t.file_size ?? null);
    return sendRange(req, reply, t.file_path, t.mime_type, { download: downloadName(t, db), cache: 'private, no-store' });
  });

  const zipTracks = (reply: FastifyReply, name: string, rows: any[]) => {
    const archive = archiver('zip', { zlib: { level: 0 } }); // audio is already compressed: store only
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${safeFilename(name).replace(/[^\x20-\x7e]/g, '_')}.zip"; filename*=UTF-8''${encodeURIComponent(safeFilename(name))}.zip`);
    reply.header('Cache-Control', 'private, no-store');
    const used = new Set<string>();
    rows.forEach((t, i) => {
      if (!fs.existsSync(t.file_path)) return;
      let n = downloadName(t, db);
      if (t.track_no) n = `${String(t.track_no).padStart(2, '0')}. ${n}`;
      else n = `${String(i + 1).padStart(2, '0')}. ${n}`;
      while (used.has(n)) n = `_${n}`;
      used.add(n);
      archive.file(t.file_path, { name: n });
    });
    archive.finalize();
    return reply.send(archive);
  };

  app.get('/api/download/album/:id', { preHandler: requireUser }, async (req, reply) => {
    const al = db.prepare('SELECT al.*, ar.name artist_name FROM albums al JOIN artists ar ON ar.id = al.artist_id WHERE al.id = ?').get((req.params as any).id) as any;
    if (!al) throw notFound('Альбом не найден');
    const rows = db.prepare('SELECT * FROM tracks WHERE album_id = ? ORDER BY disc_no, track_no, title').all(al.id) as any[];
    logDownload(req.userId, 'album', al.id, rows.reduce((n, r) => n + (r.file_size ?? 0), 0));
    return zipTracks(reply, `${al.artist_name} - ${al.title}`, rows);
  });

  app.get('/api/download/playlist/:id', { preHandler: requireUser }, async (req, reply) => {
    const p = db.prepare('SELECT * FROM playlists WHERE id = ?').get((req.params as any).id) as any;
    if (!p) throw notFound('Плейлист не найден');
    if (!p.is_public && p.owner_id !== req.userId && req.userRole !== 'admin') throw unauthorized('Плейлист приватный');
    const rows = db.prepare('SELECT t.* FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id WHERE pt.playlist_id = ? ORDER BY pt.position').all(p.id) as any[];
    logDownload(req.userId, 'playlist', p.id, rows.reduce((n, r) => n + (r.file_size ?? 0), 0));
    return zipTracks(reply, p.title, rows.map((r, i) => ({ ...r, track_no: i + 1 })));
  });

  const canvasHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const t = getTrackRaw(db, (req.params as any).id);
    if (!t || !t.canvas_path) throw notFound('Канвас отсутствует');
    return sendRange(req, reply, path.join(config.canvasDir, t.canvas_path), t.canvas_mime || 'video/mp4', { cache: 'private, max-age=86400' });
  };
  app.get('/api/canvas/:id', { preHandler: app.mediaAuth }, canvasHandler);
}
