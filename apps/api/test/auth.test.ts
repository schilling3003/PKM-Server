import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { registerAuthRoutes } from '../src/auth.js';
import { registerAttachmentRoutes } from '../src/attachments.js';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

type App = Awaited<ReturnType<typeof buildApp>>;

let app: App;

beforeAll(async () => {
  // Raise rate limits so the auth workflow tests are not throttled.
  process.env.RATE_LIMIT_AUTH_IP_MAX = '100';
  process.env.RATE_LIMIT_AUTH_ACCOUNT_MAX = '100';
  process.env.RATE_LIMIT_SEARCH_IP_MAX = '100';
  process.env.RATE_LIMIT_SEARCH_ACCOUNT_MAX = '100';
  process.env.RATE_LIMIT_ASK_IP_MAX = '100';
  process.env.RATE_LIMIT_ASK_ACCOUNT_MAX = '100';

  await migrate(pool);
  await pool.query(
    'TRUNCATE users, workspace_members, workspaces, documents, revisions, document_links, document_chunks, attachments CASCADE'
  );
  app = await buildApp({ logger: false });
  await registerAuthRoutes(app);
  await registerAttachmentRoutes(app);
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE users, workspace_members, workspaces, documents, revisions, document_links, document_chunks CASCADE'
  );
});

afterAll(async () => {
  await pool.end();
});

function extractSessionCookie(res: { headers: Record<string, string | string[]> }) {
  const setCookie = res.headers['set-cookie'];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!header) return undefined;
  const match = header.match(/pkm_session=([^;]+)/);
  return match?.[1];
}

function withCookie(cookie: string | undefined) {
  return cookie ? { headers: { cookie: `pkm_session=${cookie}` } } : {};
}

async function register(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password },
  });
}

async function login(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
}

describe('auth routes', () => {
  it('registers a user, sets a signed cookie, and omits the password hash', async () => {
    const res = await register('test@example.com', 'password123');
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.user.email).toBe('test@example.com');
    expect(body.user.id).toBeDefined();
    expect(body.user.password_hash).toBeUndefined();
    expect(extractSessionCookie(res)).toBeDefined();
  });

  it('rejects duplicate registrations', async () => {
    await register('dup@example.com', 'password123');
    const res = await register('dup@example.com', 'password123');
    expect(res.statusCode).toBe(409);
  });

  it('logs in an existing user with valid credentials', async () => {
    await register('login@example.com', 'password123');
    const res = await login('login@example.com', 'password123');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.user.email).toBe('login@example.com');
    expect(extractSessionCookie(res)).toBeDefined();
  });

  it('rejects invalid credentials', async () => {
    await register('bad@example.com', 'password123');
    const res = await login('bad@example.com', 'wrongpassword');
    expect(res.statusCode).toBe(401);
    const wrongEmail = await login('nobody@example.com', 'password123');
    expect(wrongEmail.statusCode).toBe(401);
  });

  it('returns the current user from /auth/me', async () => {
    const reg = await register('me@example.com', 'password123');
    const cookie = extractSessionCookie(reg);
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      ...withCookie(cookie),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.user.email).toBe('me@example.com');
  });

  it('rejects /auth/me without a valid session', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);

    const bad = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: 'pkm_session=tampered' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('logs out and invalidates the session server-side', async () => {
    const reg = await register('out@example.com', 'password123');
    const cookie = extractSessionCookie(reg);

    const before = await app.inject({
      method: 'GET',
      url: '/auth/me',
      ...withCookie(cookie),
    });
    expect(before.statusCode).toBe(200);

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      ...withCookie(cookie),
    });
    expect(logoutRes.statusCode).toBe(200);

    const setCookie = Array.isArray(logoutRes.headers['set-cookie'])
      ? logoutRes.headers['set-cookie'][0]
      : logoutRes.headers['set-cookie'];
    expect(setCookie).toContain('pkm_session=;');

    const after = await app.inject({
      method: 'GET',
      url: '/auth/me',
      ...withCookie(cookie),
    });
    expect(after.statusCode).toBe(401);

    const workspaces = await app.inject({
      method: 'GET',
      url: '/workspaces',
      ...withCookie(cookie),
    });
    expect(workspaces.statusCode).toBe(401);
  });
});

async function seedMemberWorkspace(email: string) {
  const reg = await register(email, 'password123');
  const cookie = extractSessionCookie(reg)!;
  const me = await app.inject({ method: 'GET', url: '/auth/me', ...withCookie(cookie) });
  const userId = JSON.parse(me.payload).user.id;

  const { rows } = await pool.query<{ id: string }>('INSERT INTO workspaces (name) VALUES ($1) RETURNING id', [
    'Member Workspace',
  ]);
  const workspaceId = rows[0].id;
  await pool.query('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)', [
    workspaceId,
    userId,
    'owner',
  ]);
  return { cookie, userId, workspaceId };
}

describe('workspace authorization', () => {
  it('rejects unauthenticated /workspaces list and create', async () => {
    const list = await app.inject({ method: 'GET', url: '/workspaces' });
    expect(list.statusCode).toBe(401);

    const create = await app.inject({ method: 'POST', url: '/workspaces', payload: { name: 'Orphan' } });
    expect(create.statusCode).toBe(401);
  });

  it('only lists workspaces the user is a member of', async () => {
    const { workspaceId, cookie: memberCookie } = await seedMemberWorkspace('member@example.com');
    const other = await seedMemberWorkspace('othermember@example.com');

    const res = await app.inject({ method: 'GET', url: '/workspaces', ...withCookie(memberCookie) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.some((w: { id: string }) => w.id === workspaceId)).toBe(true);
    expect(body.some((w: { id: string }) => w.id === other.workspaceId)).toBe(false);
  });
});

describe('workspace membership authorization', () => {
  it('allows members to access /workspaces/:id and nested routes', async () => {
    const { workspaceId, cookie } = await seedMemberWorkspace('owner@example.com');

    const ws = await app.inject({ method: 'GET', url: `/workspaces/${workspaceId}`, ...withCookie(cookie) });
    expect(ws.statusCode).toBe(200);

    const docs = await app.inject({
      method: 'GET',
      url: `/workspaces/${workspaceId}/documents`,
      ...withCookie(cookie),
    });
    expect(docs.statusCode).toBe(200);
  });

  it('rejects workspace access without authentication', async () => {
    const { workspaceId } = await seedMemberWorkspace('private@example.com');
    const res = await app.inject({ method: 'GET', url: `/workspaces/${workspaceId}` });
    expect(res.statusCode).toBe(401);
  });

  it('rejects workspace access for non-members', async () => {
    const { workspaceId } = await seedMemberWorkspace('owner2@example.com');
    const other = await register('other@example.com', 'password123');
    const otherCookie = extractSessionCookie(other)!;
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${workspaceId}`,
      ...withCookie(otherCookie),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('attachment authorization', () => {
  it('requires authentication and membership for /attachments/:id', async () => {
    const { workspaceId, cookie } = await seedMemberWorkspace('attachowner@example.com');
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const unauth = await app.inject({ method: 'GET', url: `/attachments/${fakeId}?workspaceId=${workspaceId}` });
    expect(unauth.statusCode).toBe(401);

    const other = await register('attachother@example.com', 'password123');
    const otherCookie = extractSessionCookie(other)!;
    const nonMember = await app.inject({
      method: 'GET',
      url: `/attachments/${fakeId}?workspaceId=${workspaceId}`,
      ...withCookie(otherCookie),
    });
    expect(nonMember.statusCode).toBe(403);

    const member = await app.inject({
      method: 'GET',
      url: `/attachments/${fakeId}?workspaceId=${workspaceId}`,
      ...withCookie(cookie),
    });
    expect(member.statusCode).toBe(404);
  });
});
