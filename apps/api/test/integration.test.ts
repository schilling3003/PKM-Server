import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { registerAuthRoutes } from '../src/auth.js';
import { registerGraphRoutes } from '../src/graph.js';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { hashContent } from '@pkm/markdown';

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
  await registerGraphRoutes(app);
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

describe('revision history', () => {
  it('lists, retrieves, and restores document revisions', async () => {
    const ws = await createWorkspace('Revisions');
    const doc = await createDoc(
      ws.id,
      'note.md',
      '---\ntype: Note\n---\n\nFirst version of the note with enough text to be chunked.\n'
    );

    const list = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents/${doc.id}/revisions`,
    });
    expect(list.statusCode).toBe(200);
    const revisions = JSON.parse(list.payload);
    expect(revisions.length).toBeGreaterThanOrEqual(1);
    expect(revisions[0]).toHaveProperty('id');
    expect(revisions[0]).toHaveProperty('content_hash');
    expect(revisions[0]).toHaveProperty('created_at');
    expect(revisions[0].content).toBeUndefined();

    const updateRes = await app.inject({
      ...withCookie(),
      method: 'PUT',
      url: `/workspaces/${ws.id}/documents/${doc.id}`,
      payload: {
        content: '---\ntype: Note\n---\n\nSecond version of the note with updated content and enough text.\n',
      },
    });
    expect(updateRes.statusCode).toBe(200);

    const listAfterUpdate = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents/${doc.id}/revisions`,
    });
    const revisionsAfterUpdate = JSON.parse(listAfterUpdate.payload);
    expect(revisionsAfterUpdate.length).toBeGreaterThanOrEqual(2);
    const firstRevision = revisionsAfterUpdate[0];

    const getRevision = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents/${doc.id}/revisions/${firstRevision.id}`,
    });
    expect(getRevision.statusCode).toBe(200);
    const revisionBody = JSON.parse(getRevision.payload);
    expect(revisionBody.content).toContain('First version');

    const beforeRestore = JSON.parse(updateRes.payload);
    const restore = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/documents/${doc.id}/revisions/${firstRevision.id}/restore`,
    });
    expect(restore.statusCode).toBe(200);
    const restoredDoc = JSON.parse(restore.payload);
    expect(restoredDoc.content).toContain('First version');
    expect(new Date(restoredDoc.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(beforeRestore.updated_at).getTime()
    );

    const listAfterRestore = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents/${doc.id}/revisions`,
    });
    expect(JSON.parse(listAfterRestore.payload).length).toBeGreaterThanOrEqual(3);

    const status = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents/${doc.id}/index-status`,
    });
    expect(status.statusCode).toBe(200);
    const statusBody = JSON.parse(status.payload);
    expect(statusBody.stale).toBe(false);
    expect(statusBody.chunk_count).toBeGreaterThan(0);
  });

  it('returns 404 for missing revisions', async () => {
    const ws = await createWorkspace('Revisions 404');
    const doc = await createDoc(ws.id, 'note.md', '---\ntype: Note\n---\n\nBody.\n');

    const getMissing = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents/${doc.id}/revisions/00000000-0000-0000-0000-000000000000`,
    });
    expect(getMissing.statusCode).toBe(404);

    const restoreMissing = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/documents/${doc.id}/revisions/00000000-0000-0000-0000-000000000000/restore`,
    });
    expect(restoreMissing.statusCode).toBe(404);
  });
});

describe('document lifecycle', () => {
  it('duplicates, archives, and restores documents', async () => {
    const ws = await createWorkspace('Lifecycle');
    const a = await createDoc(
      ws.id,
      'a.md',
      '---\ntype: Note\n---\n\nOriginal body.\n'
    );

    const dup = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/documents/${a.id}/duplicate`,
    });
    expect(dup.statusCode).toBe(201);
    const dupDoc = JSON.parse(dup.payload);
    expect(dupDoc.path).toBe('a (copy).md');
    expect(dupDoc.content).toContain('Original body');

    const archived = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/documents/${dupDoc.id}/archive`,
    });
    expect(archived.statusCode).toBe(200);
    expect(JSON.parse(archived.payload).archived_at).toBeTruthy();

    const activeList = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents`,
    });
    expect(JSON.parse(activeList.payload).some((d: { path: string }) => d.path === 'a (copy).md')).toBe(false);

    const allList = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents?includeArchived=true`,
    });
    const allDocs = JSON.parse(allList.payload);
    expect(allDocs.some((d: { path: string }) => d.path === 'a (copy).md')).toBe(true);

    const archivedDoc = allDocs.find((d: { path: string }) => d.path === 'a (copy).md');
    const restored = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/documents/${archivedDoc.id}/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(JSON.parse(restored.payload).archived_at).toBeNull();

    const activeListAfter = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents`,
    });
    expect(JSON.parse(activeListAfter.payload).some((d: { path: string }) => d.path === 'a (copy).md')).toBe(true);
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
    const width = 30;
    const content = `---\na: &a [${Array(width).fill('x').join(',')}]\nb: &b [${Array(width).fill('*a').join(',')}]\nc: &c [${Array(width).fill('*b').join(',')}]\n---\nbody`;
    const res = await app.inject({
      ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/documents`,
      payload: { path: 'bomb.md', content },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('index status', () => {
  it('reports workspace and per-document index counts and staleness', async () => {
    const ws = await createWorkspace('Index Status');
    const doc = await createDoc(
      ws.id,
      'status.md',
      '---\ntype: Note\n---\n\nThis is a test note with enough text to be chunked.\n'
    );

    const wsStatus = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/index-status`,
    });
    expect(wsStatus.statusCode).toBe(200);
    const wsBody = JSON.parse(wsStatus.payload);
    expect(wsBody.document_count).toBe(1);
    expect(wsBody.indexed_document_count).toBeGreaterThanOrEqual(0);
    expect(wsBody.chunk_count).toBeGreaterThanOrEqual(0);

    const docStatus = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents/${doc.id}/index-status`,
    });
    expect(docStatus.statusCode).toBe(200);
    const docBody = JSON.parse(docStatus.payload);
    expect(docBody.document_id).toBe(doc.id);
    expect(typeof docBody.stale).toBe('boolean');
    expect(typeof docBody.chunk_count).toBe('number');

    // Simulate an out-of-band canonical update (e.g. import or migration) that does not re-index.
    const newContent = '---\ntype: Note\n---\n\nUpdated content that differs from the original.\n';
    await pool.query('UPDATE documents SET content = $1, content_hash = $2 WHERE id = $3', [
      newContent,
      hashContent(newContent),
      doc.id,
    ]);

    const docStatusAfter = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/documents/${doc.id}/index-status`,
    });
    expect(docStatusAfter.statusCode).toBe(200);
    const after = JSON.parse(docStatusAfter.payload);
    expect(after.stale).toBe(true);
  });
});

describe('graph endpoint', () => {
  it('returns workspace-scoped nodes and edges', async () => {
    const ws = await createWorkspace('Graph Endpoint');
    const a = await createDoc(
      ws.id,
      'a.md',
      '---\ntype: Note\n---\n\nLink to [B](b.md).\n'
    );
    const b = await createDoc(
      ws.id,
      'b.md',
      '---\ntype: Concept\n---\n\nBody.\n'
    );

    const res = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws.id}/graph`,
    });
    expect(res.statusCode).toBe(200);
    const graph = JSON.parse(res.payload) as { nodes: { id: string }[]; edges: { source: string; target: string }[] };
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].source).toBe(a.id);
    expect(graph.edges[0].target).toBe(b.id);
  });

  it('does not leak graph data across workspaces', async () => {
    const ws1 = await createWorkspace('Graph Alpha');
    const ws2 = await createWorkspace('Graph Beta');
    await createDoc(ws1.id, 'x.md', '---\ntype: Note\n---\n\nAlpha.\n');
    await createDoc(ws2.id, 'y.md', '---\ntype: Note\n---\n\nBeta.\n');

    const g1 = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws1.id}/graph`,
    });
    const g2 = await app.inject({
      ...withCookie(),
      method: 'GET',
      url: `/workspaces/${ws2.id}/graph`,
    });
    expect(JSON.parse(g1.payload).nodes).toHaveLength(1);
    expect(JSON.parse(g2.payload).nodes).toHaveLength(1);
    expect(JSON.parse(g1.payload).nodes[0].path).toBe('x.md');
    expect(JSON.parse(g2.payload).nodes[0].path).toBe('y.md');
  });
});
