import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { registerAuthRoutes } from '../src/auth.js';
import { registerAttachmentRoutes } from '../src/attachments.js';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

type App = Awaited<ReturnType<typeof buildApp>>;

let app: App;
let cookie: string;

beforeAll(async () => {
  // Use very low rate limits so we can trigger throttling with a small burst.
  // Auth account limit is set to 3 so that the beforeAll registration leaves
  // room for two failed login attempts before the third is throttled.
  process.env.RATE_LIMIT_AUTH_IP_MAX = '10';
  process.env.RATE_LIMIT_AUTH_ACCOUNT_MAX = '3';
  process.env.RATE_LIMIT_SEARCH_IP_MAX = '2';
  process.env.RATE_LIMIT_SEARCH_ACCOUNT_MAX = '2';
  process.env.RATE_LIMIT_ASK_IP_MAX = '2';
  process.env.RATE_LIMIT_ASK_ACCOUNT_MAX = '2';

  await migrate(pool);
  await pool.query(
    'TRUNCATE users, workspace_members, workspaces, documents, revisions, document_links, document_chunks, attachments CASCADE'
  );
  app = await buildApp({ logger: false });
  await registerAuthRoutes(app);
  await registerAttachmentRoutes(app);

  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'ratelimit@example.com', password: 'password123' },
  });
  expect(reg.statusCode).toBe(201);
  const setCookie = reg.headers['set-cookie'];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const match = header?.match(/pkm_session=([^;]+)/);
  cookie = match?.[1] ?? '';
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE workspaces, documents, revisions, document_links, document_chunks, attachments CASCADE'
  );
});

afterAll(async () => {
  await pool.end();
});

function withCookie() {
  return { headers: { cookie: `pkm_session=${cookie}` } };
}

describe('rate limiting', () => {
  it('throttles /auth/login after the burst limit', async () => {
    const email = 'ratelimit@example.com';

    const first = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'wrongpassword' },
    });
    expect(first.statusCode).toBe(401);

    const second = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'wrongpassword' },
    });
    expect(second.statusCode).toBe(401);

    const third = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'wrongpassword' },
    });
    expect(third.statusCode).toBe(429);
    expect(third.payload).toContain('Too many requests');
  });

  it('throttles /workspaces/:id/search after the burst limit', async () => {
    const ws = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: '/workspaces',
      payload: { name: 'RateLimitSearch' },
    });
    expect(ws.statusCode).toBe(201);
    const workspaceId = JSON.parse(ws.payload).id;

    await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${workspaceId}/documents`,
      payload: { path: 'note.md', content: '---\ntype: Note\n---\n\nContent.\n' },
    });

    const first = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${workspaceId}/search?q=test`,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${workspaceId}/search?q=test2`,
    });
    expect(second.statusCode).toBe(200);

    const third = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${workspaceId}/search?q=test3`,
    });
    expect(third.statusCode).toBe(429);
  });

  it('throttles /workspaces/:id/ask after the burst limit', async () => {
    const ws = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: '/workspaces',
      payload: { name: 'RateLimitAsk' },
    });
    expect(ws.statusCode).toBe(201);
    const workspaceId = JSON.parse(ws.payload).id;

    await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${workspaceId}/documents`,
      payload: { path: 'note.md', content: '---\ntype: Note\n---\n\nContent.\n' },
    });

    const first = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${workspaceId}/ask`,
      payload: { question: 'first' },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${workspaceId}/ask`,
      payload: { question: 'second' },
    });
    expect(second.statusCode).toBe(200);

    const third = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${workspaceId}/ask`,
      payload: { question: 'third' },
    });
    expect(third.statusCode).toBe(429);
  });
});
