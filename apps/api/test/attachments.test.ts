import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { registerAuthRoutes } from '../src/auth.js';
import { registerAttachmentRoutes } from '../src/attachments.js';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

type App = Awaited<ReturnType<typeof buildApp>>;

let app: App;
let cookie: string;

function withCookie() {
  return { headers: { cookie: `pkm_session=${cookie}` } };
}

function buildMultipartBody(
  filename: string,
  contentType: string,
  content: string | Buffer,
  boundary = '----test'
): Buffer {
  const data = typeof content === 'string' ? Buffer.from(content) : content;
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([prefix, data, suffix]);
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

beforeAll(async () => {
  await migrate(pool);
  app = await buildApp({ logger: false });
  await registerAuthRoutes(app);
  await registerAttachmentRoutes(app);

  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'attachments@example.com', password: 'password123' },
  });
  expect(reg.statusCode).toBe(201);
  const setCookie = reg.headers['set-cookie'];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const match = header?.match(/pkm_session=([^;]+)/);
  cookie = match?.[1] ?? '';
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE attachments, workspaces, documents, revisions, document_links, document_chunks CASCADE'
  );
});

afterAll(async () => {
  await pool.end();
});

describe('attachments', () => {
  it('uploads, lists, downloads, and deletes attachments with workspace isolation', async () => {
    const ws1 = await createWorkspace('Alpha');
    const ws2 = await createWorkspace('Beta');

    const body = buildMultipartBody('hello.txt', 'text/plain', 'Hello world');
    const upload = await app.inject({
    ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws1.id}/attachments`,
      payload: body,
      headers: { ...withCookie().headers, 'Content-Type': 'multipart/form-data; boundary=----test' },
    });
    expect(upload.statusCode).toBe(201);
    const attachment = JSON.parse(upload.payload);
    expect(attachment.workspace_id).toBe(ws1.id);
    expect(attachment.filename).toBe('hello.txt');
    expect(attachment.content_type).toBe('text/plain');
    expect(attachment.size_bytes).toBe(11);

    const list1 = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws1.id}/attachments` });
    expect(JSON.parse(list1.payload)).toHaveLength(1);

    const list2 = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws2.id}/attachments` });
    expect(JSON.parse(list2.payload)).toHaveLength(0);

    const download = await app.inject({
    ...withCookie(),
      method: 'GET',
      url: `/attachments/${attachment.id}?workspaceId=${ws1.id}`,
    });
    expect(download.statusCode).toBe(302);
    expect(download.headers.location).toContain('http://localhost:9000/');
    expect(download.headers.location).toContain(attachment.storage_key);

    const crossDownload = await app.inject({
    ...withCookie(),
      method: 'GET',
      url: `/attachments/${attachment.id}?workspaceId=${ws2.id}`,
    });
    expect(crossDownload.statusCode).toBe(404);

    const noWorkspace = await app.inject({
    ...withCookie(), method: 'GET', url: `/attachments/${attachment.id}` });
    expect(noWorkspace.statusCode).toBe(400);

    const delCross = await app.inject({
    ...withCookie(),
      method: 'DELETE',
      url: `/attachments/${attachment.id}?workspaceId=${ws2.id}`,
    });
    expect(delCross.statusCode).toBe(404);

    const del = await app.inject({
    ...withCookie(),
      method: 'DELETE',
      url: `/attachments/${attachment.id}?workspaceId=${ws1.id}`,
    });
    expect(del.statusCode).toBe(204);

    const listAfter = await app.inject({
    ...withCookie(), method: 'GET', url: `/workspaces/${ws1.id}/attachments` });
    expect(JSON.parse(listAfter.payload)).toHaveLength(0);
  });

  it('rejects uploads without a file', async () => {
    const ws = await createWorkspace('Reject');
    const noFile = await app.inject({
    ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/attachments`,
      payload: Buffer.from(''),
      headers: { ...withCookie().headers, 'Content-Type': 'multipart/form-data; boundary=----test' },
    });
    expect(noFile.statusCode).toBe(400);
  });

  it('rejects executable file types', async () => {
    const ws = await createWorkspace('Executable');
    const body = buildMultipartBody('malware.exe', 'application/octet-stream', 'binary');
    const blocked = await app.inject({
    ...withCookie(),
      method: 'POST',
      url: `/workspaces/${ws.id}/attachments`,
      payload: body,
      headers: { ...withCookie().headers, 'Content-Type': 'multipart/form-data; boundary=----test' },
    });
    expect(blocked.statusCode).toBe(400);
  });
});
