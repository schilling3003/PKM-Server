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
  // Raise rate limits so the attachment workflow tests are not throttled.
  process.env.RATE_LIMIT_AUTH_IP_MAX = '100';
  process.env.RATE_LIMIT_AUTH_ACCOUNT_MAX = '100';
  process.env.RATE_LIMIT_SEARCH_IP_MAX = '100';
  process.env.RATE_LIMIT_SEARCH_ACCOUNT_MAX = '100';
  process.env.RATE_LIMIT_ASK_IP_MAX = '100';
  process.env.RATE_LIMIT_ASK_ACCOUNT_MAX = '100';
  process.env.RATE_LIMIT_ATTACHMENTS_IP_MAX = '100';
  process.env.RATE_LIMIT_ATTACHMENTS_ACCOUNT_MAX = '100';

  await migrate(pool);
  await pool.query(
    'TRUNCATE users, workspace_members, workspaces, documents, revisions, document_links, attachments CASCADE'
  );
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
    'TRUNCATE attachments, workspaces, documents, revisions, document_links CASCADE'
  );
});

afterAll(async () => {
  await pool.end();
});

async function uploadFile(
  workspaceId: string,
  filename: string,
  contentType: string,
  content: string | Buffer
) {
  const body = buildMultipartBody(filename, contentType, content);
  return app.inject({
    ...withCookie(),
    method: 'POST',
    url: `/workspaces/${workspaceId}/attachments`,
    payload: body,
    headers: { ...withCookie().headers, 'Content-Type': 'multipart/form-data; boundary=----test' },
  });
}

describe('attachments', () => {
  it('uploads, lists, downloads, and deletes attachments with workspace isolation', async () => {
    const ws1 = await createWorkspace('Alpha');
    const ws2 = await createWorkspace('Beta');

    const upload = await uploadFile(ws1.id, 'hello.txt', 'text/plain', 'Hello world');
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
    expect(download.statusCode).toBe(200);
    expect(download.payload).toBe('Hello world');
    expect(download.headers['content-type']).toBe('text/plain');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-disposition']).toContain('attachment');

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
    const res = await uploadFile(ws.id, 'malware.exe', 'application/octet-stream', 'binary');
    expect(res.statusCode).toBe(400);
  });

  it('accepts image files verified by magic bytes', async () => {
    const ws = await createWorkspace('Images');
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await uploadFile(ws.id, 'avatar.png', 'image/png', pngMagic);
    expect(res.statusCode).toBe(201);
    const attachment = JSON.parse(res.payload);
    expect(attachment.content_type).toBe('image/png');
  });

  it('accepts PDFs verified by magic bytes', async () => {
    const ws = await createWorkspace('PDFs');
    const res = await uploadFile(ws.id, 'report.pdf', 'application/pdf', '%PDF-1.4\n');
    expect(res.statusCode).toBe(201);
    const attachment = JSON.parse(res.payload);
    expect(attachment.content_type).toBe('application/pdf');
  });

  it('accepts text and markdown files', async () => {
    const ws = await createWorkspace('Text');
    const plain = await uploadFile(ws.id, 'notes.txt', 'text/plain', 'Plain notes');
    expect(plain.statusCode).toBe(201);
    expect(JSON.parse(plain.payload).content_type).toBe('text/plain');

    const md = await uploadFile(ws.id, 'notes.md', 'text/markdown', '# Notes');
    expect(md.statusCode).toBe(201);
    expect(JSON.parse(md.payload).content_type).toBe('text/markdown');
  });

  it('rejects HTML files', async () => {
    const ws = await createWorkspace('HTML');
    const res = await uploadFile(ws.id, 'page.html', 'text/html', '<html><body></body></html>');
    expect(res.statusCode).toBe(400);
  });

  it('rejects text/plain uploads that contain HTML markup', async () => {
    const ws = await createWorkspace('HTMLText');
    const res = await uploadFile(ws.id, 'report.txt', 'text/plain', '<html><body><script>alert(1)</script></body></html>');
    expect(res.statusCode).toBe(400);
  });

  it('rejects SVG files', async () => {
    const ws = await createWorkspace('SVG');
    const res = await uploadFile(ws.id, 'icon.svg', 'image/svg+xml', '<?xml version="1.0"?><svg></svg>');
    expect(res.statusCode).toBe(400);
  });

  it('rejects mismatched content types', async () => {
    const ws = await createWorkspace('Mismatch');
    // A JPEG magic buffer claimed as PNG with a .png extension should still be rejected.
    const jpegMagic = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const res = await uploadFile(ws.id, 'mismatch.png', 'image/png', jpegMagic);
    expect(res.statusCode).toBe(400);
  });

  it('rejects text files with null bytes or invalid UTF-8', async () => {
    const ws = await createWorkspace('BadText');
    const nullBytes = Buffer.from([0x48, 0x65, 0x00, 0x6c, 0x6c, 0x6f]);
    const res = await uploadFile(ws.id, 'bad.txt', 'text/plain', nullBytes);
    expect(res.statusCode).toBe(400);
  });

  it('rejects oversized files', async () => {
    const ws = await createWorkspace('Oversized');
    const big = Buffer.alloc(11 * 1024 * 1024, 'a');
    const res = await uploadFile(ws.id, 'big.txt', 'text/plain', big);
    expect(res.statusCode).toBe(413);
  });
});
