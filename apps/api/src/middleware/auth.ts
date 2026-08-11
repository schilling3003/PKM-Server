import type { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db.js';

export const SESSION_COOKIE = 'pkm_session';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email: string };
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  const { rows } = await query('SELECT id, email FROM users WHERE id = $1', [unsigned.value]);
  if (!rows[0]) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  request.user = { id: rows[0].id as string, email: rows[0].email as string };
}
