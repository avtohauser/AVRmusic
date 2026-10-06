// "Guess the melody" games and the listener's own devices controlling each other.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound } from '../lib/errors.js';
import { sendRange } from './media.js';
import { advance, answerGame, clearGameClips, createGame, gameClip, gameOf, gameView, getGame, joinGame, leaveGame, seenInGame, waitGame } from '../services/game.js';
import { deviceQueue, forget, heartbeat, listDevices, sendCommand, takeCommands, type DeviceCommand } from '../services/devices.js';

export default async function togetherRoutes(app: FastifyInstance) {
  const db = app.db;
  const auth = { preHandler: app.authenticate };
  clearGameClips();

  /* ---------- guess the melody ---------- */

  const gameOrThrow = (id: string) => { const g = getGame(id); if (!g) throw notFound('Игра закончилась'); return g; };
  const playerOf = (id: string, userId: string) => {
    const g = gameOrThrow(id);
    if (!g.players.has(userId)) throw forbidden('Вы не в этой игре');
    seenInGame(g, userId);
    return g;
  };

  /** This listener's game, if any. */
  app.get('/api/game', auth, async (req) => { const g = gameOf(req.userId!); return g ? gameView(db, g, req.userId!) : null; });

  app.post('/api/games', auth, async (req) => {
    const b = z.object({
      source: z.enum(['library', 'ours', 'playlist']).default('ours'),
      rounds: z.number().int().min(3).max(30).default(10),
      playlistId: z.string().nullish(),
    }).parse(req.body ?? {});
    return gameView(db, createGame(db, req.userId!, b.source, b.rounds, b.playlistId ?? null), req.userId!);
  });

  /** The game; with `v` it waits (up to 25 s) until it changes past that version. */
  app.get('/api/games/:id', auth, async (req) => {
    const g = playerOf((req.params as any).id, req.userId!);
    const v = Number((req.query as any)?.v);
    if (Number.isFinite(v)) await waitGame(g, v, 25_000);
    const now = getGame(g.id);
    if (!now || !now.players.has(req.userId!)) return null;
    seenInGame(now, req.userId!);
    return gameView(db, now, req.userId!);
  });

  app.post('/api/games/:id/join', auth, async (req) => {
    const g = gameOrThrow((req.params as any).id);
    joinGame(g, req.userId!);
    return gameView(db, g, req.userId!);
  });

  app.post('/api/games/:id/leave', auth, async (req) => {
    const g = getGame((req.params as any).id);
    if (g) leaveGame(g, req.userId!);
    return { ok: true };
  });

  /** The first round (from the lobby), or the next one sooner than the pause after an answer. */
  app.post('/api/games/:id/next', auth, async (req) => {
    const g = playerOf((req.params as any).id, req.userId!);
    if (g.state === 'lobby' && g.hostId !== req.userId) throw forbidden('Начинает тот, кто создал игру');
    if (g.state === 'lobby' || g.state === 'reveal') await advance(g);
    return gameView(db, g, req.userId!);
  });

  app.post('/api/games/:id/answer', auth, async (req) => {
    const g = playerOf((req.params as any).id, req.userId!);
    const b = z.object({ n: z.number().int().min(0).max(3) }).parse(req.body ?? {});
    answerGame(g, req.userId!, b.n);
    return gameView(db, g, req.userId!);
  });

  /** The round's piece of music (the media token in ?t= works, for players). */
  app.get('/api/games/:id/clip/:round', { preHandler: app.mediaAuth }, async (req, reply) => {
    const p = req.params as any;
    const g = gameOrThrow(p.id);
    if (!req.userId || !g.players.has(req.userId)) throw forbidden('Вы не в этой игре');
    const clip = gameClip(g, Number(p.round));
    if (!clip) throw notFound('Этот раунд уже прошёл');
    return sendRange(req, reply, clip.file, clip.mime, { cache: 'no-store' });
  });

  /* ---------- the listener's devices ---------- */

  const deviceBody = z.object({
    id: z.string().min(4).max(80),
    name: z.string().min(1).max(80),
    kind: z.enum(['android', 'ios', 'web']),
    trackId: z.string().nullish(),
    positionMs: z.number().min(0).optional(),
    playing: z.boolean().optional(),
    volume: z.number().min(0).max(1).optional(),
    queue: z.array(z.string()).max(500).optional(),
    index: z.number().int().min(0).optional(),
  });

  /** An app reports itself and what it plays; the answer is the listener's devices online. */
  app.post('/api/me/devices/heartbeat', auth, async (req) => {
    const b = deviceBody.parse(req.body ?? {});
    heartbeat(req.userId!, { ...b, trackId: b.trackId === undefined ? undefined : b.trackId ?? null });
    return listDevices(db, req.userId!, b.id);
  });

  app.get('/api/me/devices', auth, async (req) => listDevices(db, req.userId!, (req.query as any)?.self));

  app.delete('/api/me/devices/:id', auth, async (req) => { forget(req.userId!, (req.params as any).id); return { ok: true }; });

  /** What a device plays, as a queue (to take it over here). */
  app.get('/api/me/devices/:id/queue', auth, async (req) => {
    const q = deviceQueue(db, req.userId!, (req.params as any).id);
    if (!q) throw notFound('Устройство не в сети');
    return q;
  });

  app.post('/api/me/devices/:id/command', auth, async (req) => {
    const cmd = z.discriminatedUnion('type', [
      z.object({ type: z.literal('play') }), z.object({ type: z.literal('pause') }),
      z.object({ type: z.literal('next') }), z.object({ type: z.literal('prev') }),
      z.object({ type: z.literal('seek'), positionMs: z.number().min(0) }),
      z.object({ type: z.literal('volume'), volume: z.number().min(0).max(1) }),
      z.object({ type: z.literal('transfer'), trackIds: z.array(z.string()).min(1).max(500), index: z.number().int().min(0), positionMs: z.number().min(0).default(0), playing: z.boolean().default(true) }),
    ]).parse(req.body ?? {}) as DeviceCommand;
    const from = typeof (req.query as any)?.from === 'string' ? (req.query as any).from : null;
    if (!sendCommand(req.userId!, (req.params as any).id, cmd, from)) throw notFound('Устройство не в сети');
    return listDevices(db, req.userId!, from ?? undefined);
  });

  /** Commands for this device after `after`; waits up to 25 s for one. */
  app.get('/api/me/devices/:id/commands', auth, async (req) => {
    const after = Number((req.query as any)?.after) || 0;
    return takeCommands(req.userId!, (req.params as any).id, after, 25_000);
  });
}
