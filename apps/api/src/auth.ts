import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as bcrypt from 'bcrypt';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import { query } from './db.js';
import { requireAuth, SESSION_COOKIE } from './middleware/auth.js';

const SALT_ROUNDS = 12;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

const authSchema = z.object({
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});

interface UserRow {
  id: string;
  email: string;
  created_at: string;
}

function userResponse(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
  };
}

function setSessionCookie(reply: FastifyReply, userId: string) {
  reply.setCookie(SESSION_COOKIE, userId, {
    signed: true,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function registerAuthRoutes(app: FastifyInstance) {
  const secret = process.env.SESSION_SECRET || 'dev-secret-change-me-before-production';

  await app.register(cookie, {
    secret,
    parseOptions: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    },
  });

  app.post('/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = authSchema.parse(request.body);

    const existing = await query('SELECT id FROM users WHERE email = $1', [body.email]);
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(body.password, SALT_ROUNDS);
    const { rows } = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [body.email, hash]
    );
    const user = rows[0] as UserRow;
    setSessionCookie(reply, user.id);
    reply.status(201).send({ user: userResponse(user) });
  });

  app.post('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = authSchema.parse(request.body);

    const { rows } = await query(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
      [body.email]
    );
    if (rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const user = rows[0] as UserRow & { password_hash: string };
    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    setSessionCookie(reply, user.id);
    reply.send({ user: userResponse(user) });
  });

  app.post('/auth/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    reply.send({ ok: true });
  });

  app.get('/auth/me', { preHandler: [requireAuth] }, async (request: FastifyRequest) => {
    return { user: request.user };
  });

  // Require authentication and workspace membership for all /workspaces/:id/* routes.
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const pathname = request.url.split('?')[0];
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'workspaces') return;

    const workspaceId = parts[1];
    if (!workspaceId) return; // /workspaces list/create are not protected here

    await requireAuth(request, reply);
    if (reply.sent) return;

    if (!request.user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { rows } = await query(
      'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, request.user.id]
    );
    if (rows.length === 0) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });
}
