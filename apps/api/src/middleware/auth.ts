import type { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db.js';
import type { SessionBlocklist } from '../session-blocklist.js';

export const SESSION_COOKIE = 'pkm_session';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email: string };
  }
}

async function resolveUser(request: FastifyRequest) {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;

  const blocklist = (request.server as any).sessionBlocklist as SessionBlocklist | undefined;
  if (blocklist && (await blocklist.isBlocked(raw))) {
    return null;
  }

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;

  const userId = unsigned.value.split(':', 1)[0];
  if (!userId) return null;

  const { rows } = await query('SELECT id, email FROM users WHERE id = $1', [userId]);
  if (!rows[0]) return null;

  return { id: rows[0].id as string, email: rows[0].email as string };
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = await resolveUser(request);
  if (!user) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  request.user = user;
}

export async function optionalAuth(request: FastifyRequest) {
  if (!request.user) {
    const user = await resolveUser(request);
    request.user = user ?? undefined;
  }
}
