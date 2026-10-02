// News from the admin to everyone: the apps show what is new and notify about it.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { NewsItem } from '@avrmusic/shared';
import { newId } from '../lib/util.js';
import { notFound } from '../lib/errors.js';

const map = (r: any): NewsItem => ({ id: r.id, title: r.title, body: r.body, createdAt: r.created_at, author: r.author ?? null });

export default async function newsRoutes(app: FastifyInstance) {
  const db = app.db;
  const auth = { preHandler: app.authenticate };
  const admin = { preHandler: app.requireAdmin };
  const SELECT = `SELECT n.*, u.display_name AS author FROM news n LEFT JOIN users u ON u.id = n.created_by`;

  /** The latest news, newest first; `after` (an ISO time) keeps only what came since. */
  app.get('/api/news', auth, async (req) => {
    const after = (req.query as any)?.after as string | undefined;
    const rows = after
      ? db.prepare(`${SELECT} WHERE n.created_at > ? ORDER BY n.created_at DESC LIMIT 30`).all(after)
      : db.prepare(`${SELECT} ORDER BY n.created_at DESC LIMIT 30`).all();
    return rows.map(map);
  });

  app.post('/api/admin/news', admin, async (req) => {
    const body = z.object({ title: z.string().trim().min(1).max(140), body: z.string().trim().max(4000).default('') }).parse(req.body ?? {});
    const id = newId();
    db.prepare('INSERT INTO news (id, title, body, created_by) VALUES (?, ?, ?, ?)').run(id, body.title, body.body, req.userId ?? null);
    return map(db.prepare(`${SELECT} WHERE n.id = ?`).get(id));
  });

  app.delete('/api/admin/news/:id', admin, async (req) => {
    const r = db.prepare('DELETE FROM news WHERE id = ?').run((req.params as any).id);
    if (!r.changes) throw notFound('Новость не найдена');
    return { ok: true };
  });
}
