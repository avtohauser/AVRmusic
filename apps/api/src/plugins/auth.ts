import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JwtPayload } from '../services/auth.js';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated user id (null for guests when optional auth is used). */
    userId: string | null;
    userRole: 'admin' | 'user' | null;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    libraryAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    mediaAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app) => {
  app.decorateRequest('userId', null);
  app.decorateRequest('userRole', null);

  async function tryVerify(req: FastifyRequest, allowMediaScope: boolean): Promise<JwtPayload | null> {
    let token: string | undefined;
    const h = req.headers.authorization;
    if (h?.startsWith('Bearer ')) token = h.slice(7);
    const q = (req.query as any)?.t;
    if (!token && typeof q === 'string' && q) token = q;
    if (!token) return null;
    try {
      const p = app.jwt.verify<JwtPayload>(token);
      if (p.scope === 'media' && !allowMediaScope) return null;
      return p;
    } catch {
      return null;
    }
  }

  app.decorate('authenticate', async (req: FastifyRequest) => {
    const p = await tryVerify(req, false);
    if (!p) throw unauthorized();
    req.userId = p.sub;
    req.userRole = p.role;
  });

  app.decorate('optionalAuth', async (req: FastifyRequest) => {
    const p = await tryVerify(req, false);
    if (p) { req.userId = p.sub; req.userRole = p.role; }
  });

  /** Browse endpoints: require login unless PUBLIC_LIBRARY is enabled. */
  app.decorate('libraryAuth', async (req: FastifyRequest) => {
    const p = await tryVerify(req, false);
    if (p) { req.userId = p.sub; req.userRole = p.role; return; }
    if (!config.publicLibrary) throw unauthorized();
  });

  /** Stream/canvas: accept media-scoped tokens via ?t=; guests allowed when PUBLIC_LIBRARY. */
  app.decorate('mediaAuth', async (req: FastifyRequest) => {
    const p = await tryVerify(req, true);
    if (p) { req.userId = p.sub; req.userRole = p.role; return; }
    if (!config.publicLibrary) throw unauthorized();
  });

  app.decorate('requireAdmin', async (req: FastifyRequest) => {
    const p = await tryVerify(req, false);
    if (!p) throw unauthorized();
    if (p.role !== 'admin') throw forbidden('Только для администратора');
    req.userId = p.sub;
    req.userRole = p.role;
  });
});
