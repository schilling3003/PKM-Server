import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { registerAuthRoutes } from '../src/auth.js';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

type App = Awaited<ReturnType<typeof buildApp>>;

let app: App;
let cookie: string;

beforeAll(async () => {
  // Raise rate limits so the integration tests are not throttled.
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

  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'integration@example.com', password: 'password123' },
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

async function createWorkspace(name: string) {
  const res = await app.inject({
    ...withCookie(),
    method: 'POST',
    url: '/workspaces',
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.payload) as { id: string; name: string };
}

async function createDoc(workspaceId: string, path: string, content: string) {
  const res = await app.inject({
    ...withCookie(),
    method: 'POST',
    url: `/workspaces/${workspaceId}/documents`,
    payload: { path, content },
  });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.payload) as { id: string; path: string; content: string };
}

describe('workspace isolation', () => {
  it('does not leak across workspaces through documents, search, backlinks, or ask', async () => {
    const ws1 = await createWorkspace('Workspace Alpha');
    const ws2 = await createWorkspace('Workspace Beta');

    const doc1 = await createDoc(
      ws1.id,
      'note.md',
      '---\ntype: Note\n---\n\nAlpha note about apples.\n'
    );
    const doc2 = await createDoc(
      ws2.id,
      'note.md',
      '---\ntype: Note\n---\n\nBeta note about bananas.\n'
    );

    // /documents list
    const list1 = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws1.id}/documents` });
    const list2 = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws2.id}/documents` });
    const docs1 = JSON.parse(list1.payload);
    const docs2 = JSON.parse(list2.payload);
    expect(docs1).toHaveLength(1);
    expect(docs2).toHaveLength(1);
    expect(docs1[0].content).toContain('Alpha');
    expect(docs2[0].content).toContain('Beta');

    // /search
    const s1 = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws1.id}/search?q=Alpha` });
    const s2 = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws2.id}/search?q=Alpha` });
    expect(JSON.parse(s1.payload).length).toBe(1);
    expect(JSON.parse(s2.payload).length).toBe(0);

    // /backlinks — same target path, different workspaces
    await createDoc(ws1.id, 'a.md', '---\ntype: Note\n---\n\nSee [note](note.md).\n');
    await createDoc(ws2.id, 'b.md', '---\ntype: Note\n---\n\nSee [note](note.md).\n');

    const bl1 = await app.inject({
    ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws1.id}/documents/${doc1.id}/backlinks`,
    });
    const bl2 = await app.inject({
    ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws2.id}/documents/${doc2.id}/backlinks`,
    });
    expect(JSON.parse(bl1.payload).length).toBe(1);
    expect(JSON.parse(bl2.payload).length).toBe(1);

    // Cross-workspace backlink query should return nothing
    const blCross = await app.inject({
    ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws2.id}/documents/${doc1.id}/backlinks`,
    });
    expect(JSON.parse(blCross.payload).length).toBe(0);

    // /ask citations
    const ask1 = await app.inject({
    ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws1.id}/ask`,
      payload: { question: 'apples' },
    });
    const ask2 = await app.inject({
    ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws2.id}/ask`,
      payload: { question: 'apples' },
    });
    const answer1 = JSON.parse(ask1.payload);
    const answer2 = JSON.parse(ask2.payload);
    expect(answer1.citations.length).toBe(1);
    expect(answer2.citations.length).toBe(0);
  });

  it('rejects search q and ask question over 500 characters', async () => {
    const ws = await createWorkspace('Input Limits');
    await createDoc(ws.id, 'note.md', '---\ntype: Note\n---\n\nContent.\n');

    const oversized = 'a'.repeat(501);

    const search = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/search?q=${encodeURIComponent(oversized)}`,
    });
    expect(search.statusCode).toBe(400);
    expect(search.payload).toContain('500');

    const ask = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/ask`,
      payload: { question: oversized },
    });
    expect(ask.statusCode).toBe(400);
    expect(ask.payload).toContain('500');
  });
});

describe('OKF v0.2 round-trip', () => {
  it('preserves canonical Markdown and unknown frontmatter through import/export/re-import', async () => {
    const ws = await createWorkspace('OKF Round-trip');

    const bundle = {
      version: '0.2',
      workspace: ws.name,
      concepts: [
        {
          path: 'concepts/customers.md',
          metadata: {
            type: 'BigQuery Table',
            title: 'Customers',
            custom_key: [1, 2, 3],
          },
          document: {
            body: '# Schema\n\nSee [[orders|the orders table]] for related data.\n',
          },
        },
      ],
    };

    const importRes = await app.inject({
    ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/okf/import`,
      payload: bundle,
    });
    expect(importRes.statusCode).toBe(200);

    const docsRes = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws.id}/documents` });
    const docs = JSON.parse(docsRes.payload);
    expect(docs).toHaveLength(1);

    // Canonical content: wikilinks converted to standard Markdown, unknown keys preserved.
    expect(docs[0].content).toContain('type: BigQuery Table');
    expect(docs[0].content).toContain('custom_key:');
    expect(docs[0].content).toContain('[the orders table](orders.md)');
    expect(docs[0].content).not.toContain('[[');

    // Export should convert standard links back to wikilinks and include bundle metadata.
    const exportRes = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws.id}/okf/export` });
    expect(exportRes.statusCode).toBe(200);
    const exported = JSON.parse(exportRes.payload);
    expect(exported.version).toBe('0.2');
    expect(exported.workspace).toBe(ws.name);
    expect(exported.id).toBeDefined();
    expect(exported.timestamp).toBeDefined();
    expect(exported.concepts).toHaveLength(1);
    expect(exported.concepts[0].metadata.type).toBe('BigQuery Table');
    expect(exported.concepts[0].metadata.custom_key).toEqual([1, 2, 3]);
    expect(exported.concepts[0].document.body).toContain('[[orders|the orders table]]');

    // Re-import the exported bundle and verify the canonical content is unchanged.
    const reimport = await app.inject({
    ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/okf/import`,
      payload: exported,
    });
    expect(reimport.statusCode).toBe(200);

    const docsAfter = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws.id}/documents` });
    const after = JSON.parse(docsAfter.payload);
    expect(after).toHaveLength(1);
    expect(after[0].content).toBe(docs[0].content);
  });

  it('rejects concepts with missing type or reserved filenames', async () => {
    const ws = await createWorkspace('OKF Validation');

    const missingType = await app.inject({
    ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/okf/import`,
      payload: { concepts: [{ path: 'x.md', metadata: {}, document: { body: '' } }] },
    });
    expect(missingType.statusCode).toBe(400);
    expect(missingType.payload).toContain('type');

    const reservedIndex = await app.inject({
    ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/okf/import`,
      payload: { concepts: [{ path: 'index.md', metadata: { type: 'Note' }, document: { body: '' } }] },
    });
    expect(reservedIndex.statusCode).toBe(400);
    expect(reservedIndex.payload).toContain('Reserved filename');

    const reservedLog = await app.inject({
    ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/okf/import`,
      payload: { concepts: [{ path: 'log.md', metadata: { type: 'Note' }, document: { body: '' } }] },
    });
    expect(reservedLog.statusCode).toBe(400);
    expect(reservedLog.payload).toContain('Reserved filename');
  });
});

describe('document CRUD and links', () => {
  it('creates, updates, deletes, and tracks outgoing links and backlinks', async () => {
    const ws = await createWorkspace('Links');
    const a = await createDoc(
      ws.id,
      'a.md',
      '---\ntype: Note\n---\n\nLink to [B](b.md).\n'
    );
    const b = await createDoc(ws.id, 'b.md', '---\ntype: Note\n---\n\nBody.\n');

    // List
    const list = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws.id}/documents` });
    expect(JSON.parse(list.payload).length).toBe(2);

    // Get
    const getA = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws.id}/documents/${a.id}` });
    expect(getA.statusCode).toBe(200);

    // Outgoing links
    const links = await app.inject({
    ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents/${a.id}/links`,
    });
    const outgoing = JSON.parse(links.payload);
    expect(outgoing.length).toBe(1);
    expect(outgoing[0].path).toBe('b.md');

    // Backlinks
    const bl = await app.inject({
    ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents/${b.id}/backlinks`,
    });
    const backlinks = JSON.parse(bl.payload);
    expect(backlinks.length).toBe(1);
    expect(backlinks[0].path).toBe('a.md');

    // Update
    const upd = await app.inject({
    ...withCookie(),
      method: 'PUT',
      url: `/workspaces/${ws.id}/documents/${a.id}`,
      payload: { content: '---\ntype: Note\n---\n\nUpdated link to [B](b.md).\n' },
    });
    expect(upd.statusCode).toBe(200);

    // Delete
    const del = await app.inject({
    ...withCookie(),
      method: 'DELETE',
      url: `/workspaces/${ws.id}/documents/${a.id}`,
    });
    expect(del.statusCode).toBe(204);

    const listAfter = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws.id}/documents` });
    expect(JSON.parse(listAfter.payload).length).toBe(1);
  });
});

describe('document safety limits', () => {
  it('rejects documents larger than 1 MiB', async () => {
    const ws = await createWorkspace('SizeLimit');
    const big = 'x'.repeat(2 * 1024 * 1024);
    const res = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/documents`,
      payload: { path: 'big.md', content: `---\ntype: Note\n---\n\n${big}\n` },
    });
    expect(res.statusCode).toBe(413);
  });

  it('rejects YAML frontmatter alias bombs', async () => {
    const ws = await createWorkspace('YamlBomb');
    const content = '---\na: &a [x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]\n---\nbody';
    const res = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/documents`,
      payload: { path: 'bomb.md', content },
    });
    expect(res.statusCode).toBe(400);
  });
});
