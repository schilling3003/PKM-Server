import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as bcrypt from 'bcrypt';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import { query } from './db.js';
import { requireAuth, SESSION_COOKIE } from './middleware/auth.js';
import { createRateLimiter, RateLimiter, RateLimitConfig, RedisClient } from './rate-limit.js';
import { createSessionBlocklist, SessionBlocklist } from './session-blocklist.js';

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

function setSessionCookie(reply: FastifyReply, userId: string, secret: string) {
  reply.setCookie(SESSION_COOKIE, userId, {
    signed: true,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

function parseRateLimitConfig(
  maxEnv: string | undefined,
  windowEnv: string | undefined,
  defaultMax: number,
  defaultWindowMs: number
): RateLimitConfig {
  return {
    maxRequests: maxEnv ? Number(maxEnv) : defaultMax,
    windowMs: windowEnv ? Number(windowEnv) : defaultWindowMs,
  };
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  opts: { redisClient?: RedisClient } = {}
) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && !sessionSecret) {
    throw new Error('SESSION_SECRET is required in production');
  }
  const secret = sessionSecret || 'dev-secret-change-me-before-production';

  await app.register(cookie, {
    secret,
    parseOptions: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    },
  });

  const limiter = createRateLimiter(opts.redisClient);
  const sessionBlocklist = createSessionBlocklist(opts.redisClient);
  app.decorate('sessionBlocklist', sessionBlocklist);

  const authIpLimit = parseRateLimitConfig(
    process.env.RATE_LIMIT_AUTH_IP_MAX,
    process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS,
    10,
    60_000
  );
  const authAccountLimit = parseRateLimitConfig(
    process.env.RATE_LIMIT_AUTH_ACCOUNT_MAX,
    process.env.RATE_LIMIT_AUTH_ACCOUNT_WINDOW_MS,
    5,
    60_000
  );
  const searchIpLimit = parseRateLimitConfig(
    process.env.RATE_LIMIT_SEARCH_IP_MAX,
    process.env.RATE_LIMIT_SEARCH_IP_WINDOW_MS,
    120,
    60_000
  );
  const searchAccountLimit = parseRateLimitConfig(
    process.env.RATE_LIMIT_SEARCH_ACCOUNT_MAX,
    process.env.RATE_LIMIT_SEARCH_ACCOUNT_WINDOW_MS,
    60,
    60_000
  );
  const askIpLimit = parseRateLimitConfig(
    process.env.RATE_LIMIT_ASK_IP_MAX,
    process.env.RATE_LIMIT_ASK_IP_WINDOW_MS,
    60,
    60_000
  );
  const askAccountLimit = parseRateLimitConfig(
    process.env.RATE_LIMIT_ASK_ACCOUNT_MAX,
    process.env.RATE_LIMIT_ASK_ACCOUNT_WINDOW_MS,
    30,
    60_000
  );

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
    setSessionCookie(reply, user.id, secret);
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

    setSessionCookie(reply, user.id, secret);
    reply.send({ user: userResponse(user) });
  });

  app.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await sessionBlocklist.block(token, SESSION_MAX_AGE_SECONDS);
    }
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

  // Attach optional authentication to /workspaces list/create,
  // and require authentication + workspace membership for /workspaces/:id/*
  // and /attachments/:id?workspaceId=... download/delete routes.
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const pathname = request.url.split('?')[0];
    const parts = pathname.split('/').filter(Boolean);

    if (parts[0] === 'attachments' && parts[1]) {
      await requireAuth(request, reply);
      if (reply.sent) return;
      const { workspaceId } = request.query as { workspaceId?: string };
      if (!workspaceId) {
        return reply.code(400).send({ error: 'workspaceId query parameter is required' });
      }
      const { rows } = await query(
        'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
        [workspaceId, request.user!.id]
      );
      if (rows.length === 0) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
      return;
    }

    if (parts[0] !== 'workspaces') return;

    const workspaceId = parts[1];
    if (!workspaceId) {
      await requireAuth(request, reply);
      return;
    }

    await requireAuth(request, reply);
    if (reply.sent) return;

    const { rows } = await query(
      'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, request.user!.id]
    );
    if (rows.length === 0) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });

  // Rate limiting for auth, search, and ask endpoints.
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (reply.sent) return;

    const pathname = request.url.split('?')[0];
    const parts = pathname.split('/').filter(Boolean);

    function deny(config: RateLimitConfig, retryAfter?: number) {
      return reply
        .code(429)
        .header('Retry-After', String(retryAfter ?? Math.ceil(config.windowMs / 1000)))
        .send({ error: 'Too many requests' });
    }

    if (parts[0] === 'auth' && (parts[1] === 'login' || parts[1] === 'register')) {
      const ip = request.ip || request.socket?.remoteAddress || 'unknown';
      const ipResult = await limiter.isAllowed(`auth:ip:${ip}`, authIpLimit);
      if (!ipResult.allowed) return deny(authIpLimit, ipResult.retryAfter);

      const body = request.body as { email?: string } | undefined;
      const email = typeof body?.email === 'string' ? body.email.toLowerCase() : 'unknown';
      const accountResult = await limiter.isAllowed(`auth:acct:${email}`, authAccountLimit);
      if (!accountResult.allowed) return deny(authAccountLimit, accountResult.retryAfter);
      return;
    }

    if (parts[0] === 'workspaces' && parts[2] && (parts[2] === 'search' || parts[2] === 'ask')) {
      // The previous auth/membership hook must have set request.user.
      if (!request.user) return;

      const workspaceId = parts[1];
      const ip = request.ip || request.socket?.remoteAddress || 'unknown';
      const isAsk = parts[2] === 'ask';
      const ipConfig = isAsk ? askIpLimit : searchIpLimit;
      const ipResult = await limiter.isAllowed(`ws:${workspaceId}:ip:${ip}`, ipConfig);
      if (!ipResult.allowed) return deny(ipConfig, ipResult.retryAfter);

      const accountConfig = isAsk ? askAccountLimit : searchAccountLimit;
      const accountResult = await limiter.isAllowed(
        `ws:${workspaceId}:acct:${request.user.id}`,
        accountConfig
      );
      if (!accountResult.allowed) return deny(accountConfig, accountResult.retryAfter);
    }
  });
}
