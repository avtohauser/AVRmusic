import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { waveFeedback, waveNext } from '../services/wave.js';
import { suggestionsFor } from '../services/suggest.js';

export default async function waveRoutes(app: FastifyInstance) {
  const db = app.db;
  const auth = { preHandler: app.authenticate };

  /** The next batch of "My Wave" for the listener. */
  app.post('/api/wave/next', auth, async (req) => {
    const body = z.object({
      mode: z.enum(['mix', 'favorites', 'discover', 'popular']).default('mix'),
      count: z.number().int().min(1).max(20).default(10),
      exclude: z.array(z.string()).max(300).default([]),
      genre: z.string().max(80).nullish(),
    }).parse(req.body ?? {});
    return { mode: body.mode, tracks: waveNext(db, req.userId!, body) };
  });

  /** 👍 1 / 👎 -1 / reset 0 for a track heard in the wave. */
  app.post('/api/wave/feedback', auth, async (req) => {
    const body = z.object({ trackId: z.string(), value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }).parse(req.body);
    waveFeedback(db, req.userId!, body.trackId, body.value);
    return { ok: true };
  });

  /** "Предложка": new music from the catalogue picked for the listener. */
  app.get('/api/suggestions', auth, async (req) => suggestionsFor(db, req.userId!, (req.query as any)?.fresh === '1'));
}
