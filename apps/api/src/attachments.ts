import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Client } from 'minio';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { pool } from './db.js';
import './middleware/auth.js';
import * as workspaces from './workspaces.js';

export interface AttachmentRow {
  id: string;
  workspace_id: string;
  document_id: string | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  created_at: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'minioadmin';
const rawS3SecretKey = process.env.S3_SECRET_KEY;
if (process.env.NODE_ENV === 'production' && !rawS3SecretKey) {
  throw new Error('S3_SECRET_KEY is required in production');
}
const S3_SECRET_KEY = rawS3SecretKey || 'minioadmin';
const S3_BUCKET = process.env.S3_BUCKET || 'pkm';
const S3_REGION = process.env.S3_REGION || 'us-east-1';

async function requireWorkspaceMembership(
  request: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
  workspaceId: string
) {
  if (!request.user) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }

  const { rows } = await pool.query(
    'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, request.user.id]
  );
  if (rows.length === 0) {
    reply.code(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// Allowed attachment formats. Anything not on this list is rejected.
const ALLOWED_IMAGE_TYPES = new Map<
  string,
  { extensions: Set<string>; magic: (buffer: Buffer) => boolean }
>([
  ['image/png', { extensions: new Set(['.png']), magic: isPng }],
  ['image/jpeg', { extensions: new Set(['.jpg', '.jpeg']), magic: isJpeg }],
  ['image/gif', { extensions: new Set(['.gif']), magic: isGif }],
  ['image/webp', { extensions: new Set(['.webp']), magic: isWebp }],
]);

const ALLOWED_PDF_TYPE = {
  type: 'application/pdf',
  extensions: new Set(['.pdf']),
  magic: isPdf,
};

const ALLOWED_TEXT_TYPES = new Map<string, Set<string>>([
  ['text/plain', new Set(['.txt', '.text'])],
  ['text/markdown', new Set(['.md', '.markdown', '.mkd'])],
]);

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isGif(buffer: Buffer): boolean {
  return buffer.length >= 6 && (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a');
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-';
}

function isValidUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

const HTML_TAG_RE = /<\s*(html|script|svg|iframe|object|embed|meta|link|style|body|head|title|form|input|img|video|audio|source|applet)/i;

function isSafeText(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  if (!isValidUtf8(buffer)) return false;
  return !HTML_TAG_RE.test(buffer.toString('utf-8', 0, Math.min(buffer.length, 4096)));
}

function getClient(): Client {
  const url = new URL(S3_ENDPOINT);
  return new Client({
    endPoint: url.hostname,
    port: Number(url.port) || 9000,
    useSSL: url.protocol === 'https:',
    accessKey: S3_ACCESS_KEY,
    secretKey: S3_SECRET_KEY,
    region: S3_REGION,
  });
}

let bucketEnsured = false;
async function ensureBucket() {
  if (bucketEnsured) return;
  const client = getClient();
  const exists = await client.bucketExists(S3_BUCKET);
  if (!exists) {
    await client.makeBucket(S3_BUCKET, S3_REGION).catch(() => {
      // Bucket may have been created by a concurrent request.
    });
  }
  bucketEnsured = true;
}

function sanitizeFilename(filename: string): string {
  const base = path.basename(filename.replace(/\\/g, '/'));
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
  return cleaned;
}

interface ValidatedAttachment {
  contentType: string;
}

function validateAttachment(
  buffer: Buffer,
  filename: string,
  claimedContentType: string
): ValidatedAttachment | null {
  const ext = path.extname(filename).toLowerCase();
  const claimed = claimedContentType.toLowerCase().trim();

  // First check binary image types by magic bytes.
  for (const [type, config] of ALLOWED_IMAGE_TYPES) {
    if (config.magic(buffer)) {
      if (!config.extensions.has(ext)) return null;
      // If the client claimed a different allowed type, reject the mismatch.
      if (ALLOWED_IMAGE_TYPES.has(claimed) && claimed !== type) return null;
      return { contentType: type };
    }
  }

  // Then PDF.
  if (ALLOWED_PDF_TYPE.magic(buffer)) {
    if (!ALLOWED_PDF_TYPE.extensions.has(ext)) return null;
    if (claimed === ALLOWED_PDF_TYPE.type || claimed === 'application/octet-stream') {
      return { contentType: ALLOWED_PDF_TYPE.type };
    }
    return null;
  }

  // Text types have no reliable magic bytes; validate by extension and content.
  const allowedTextExts = ALLOWED_TEXT_TYPES.get(claimed);
  if (allowedTextExts && allowedTextExts.has(ext) && isSafeText(buffer)) {
    return { contentType: claimed };
  }

  // HTML, SVG, executables, and unknown types are rejected.
  return null;
}

function contentDisposition(filename: string): string {
  const safe = filename.replace(/"/g, '\\"');
  return `attachment; filename="${safe}"`;
}

async function resolveDocumentId(
  client: PoolClient,
  workspaceId: string,
  documentId: string | null
): Promise<string | null> {
  if (!documentId) return null;
  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM documents WHERE id = $1 AND workspace_id = $2',
    [documentId, workspaceId]
  );
  return rows[0]?.id ?? null;
}

async function insertAttachment(
  client: PoolClient,
  id: string,
  workspaceId: string,
  documentId: string | null,
  filename: string,
  contentType: string,
  size: number,
  storageKey: string
): Promise<AttachmentRow> {
  const { rows } = await client.query<AttachmentRow>(
    `INSERT INTO attachments (id, workspace_id, document_id, filename, content_type, size_bytes, storage_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, workspace_id, document_id, filename, content_type, size_bytes, storage_key, created_at`,
    [id, workspaceId, documentId, filename, contentType, size, storageKey]
  );
  return normalizeAttachment(rows[0]);
}

function normalizeAttachment(row: AttachmentRow): AttachmentRow {
  return {
    ...row,
    size_bytes: Number(row.size_bytes),
  };
}

export async function listAttachments(workspaceId: string): Promise<AttachmentRow[]> {
  const { rows } = await pool.query<AttachmentRow>(
    `SELECT id, workspace_id, document_id, filename, content_type, size_bytes, storage_key, created_at
     FROM attachments
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId]
  );
  return rows.map(normalizeAttachment);
}

export async function getAttachment(id: string): Promise<AttachmentRow | null> {
  const { rows } = await pool.query<AttachmentRow>(
    `SELECT id, workspace_id, document_id, filename, content_type, size_bytes, storage_key, created_at
     FROM attachments
     WHERE id = $1`,
    [id]
  );
  const row = rows[0];
  return row ? normalizeAttachment(row) : null;
}

export async function registerAttachmentRoutes(app: FastifyInstance) {
  await app.register(multipart);

  app.post('/workspaces/:id/attachments', async (req, reply) => {
    const { id: workspaceId } = req.params as { id: string };

    const ws = await workspaces.getWorkspace(workspaceId);
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });
    if (!(await requireWorkspaceMembership(req, reply, workspaceId))) return;

    const data = await req.file({
      limits: { fileSize: MAX_FILE_SIZE },
      throwFileSizeLimit: true,
    });
    if (!data) return reply.status(400).send({ error: 'File is required' });

    const buffer = await data.toBuffer();
    const filename = sanitizeFilename(data.filename);
    const claimedContentType = data.mimetype || 'application/octet-stream';

    const validation = validateAttachment(buffer, filename, claimedContentType);
    if (!validation) {
      return reply.status(400).send({ error: 'File type is not allowed' });
    }
    const contentType = validation.contentType;

    const rawDocumentId = data.fields?.documentId;
    let documentId: string | null = null;
    if (rawDocumentId) {
      const first = Array.isArray(rawDocumentId) ? rawDocumentId[0] : rawDocumentId;
      if (first.type === 'field' && typeof first.value === 'string' && z.string().uuid().safeParse(first.value).success) {
        documentId = first.value;
      }
    }

    const hash = createHash('sha256').update(buffer).digest('hex');
    const attachmentId = randomUUID();
    const storageKey = `${workspaceId}/${hash}/${attachmentId}/${filename}`;

    await ensureBucket();
    const client = getClient();
    await client.putObject(S3_BUCKET, storageKey, buffer, buffer.length, {
      'Content-Type': contentType,
    });

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');
      const resolvedDocumentId = await resolveDocumentId(dbClient, workspaceId, documentId);
      if (documentId && !resolvedDocumentId) {
        await dbClient.query('ROLLBACK');
        return reply.status(400).send({ error: 'Document not found in workspace' });
      }
      const attachment = await insertAttachment(
        dbClient,
        attachmentId,
        workspaceId,
        resolvedDocumentId,
        filename,
        contentType,
        buffer.length,
        storageKey
      );
      await dbClient.query('COMMIT');
      reply.status(201).send(attachment);
    } catch (err) {
      await dbClient.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      dbClient.release();
    }
  });

  app.get('/workspaces/:id/attachments', async (req, reply) => {
    const { id: workspaceId } = req.params as { id: string };
    const ws = await workspaces.getWorkspace(workspaceId);
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });
    if (!(await requireWorkspaceMembership(req, reply, workspaceId))) return;
    const attachments = await listAttachments(workspaceId);
    return attachments;
  });

  app.get('/attachments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { workspaceId } = req.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: 'workspaceId query parameter is required' });

    const attachment = await getAttachment(id);
    if (!attachment || attachment.workspace_id !== workspaceId) {
      return reply.status(404).send({ error: 'Attachment not found' });
    }
    if (!(await requireWorkspaceMembership(req, reply, workspaceId))) return;

    await ensureBucket();
    const client = getClient();
    try {
      const stream = await client.getObject(S3_BUCKET, attachment.storage_key);
      return reply
        .status(200)
        .header('Content-Type', attachment.content_type)
        .header('Content-Disposition', contentDisposition(attachment.filename))
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Length', String(attachment.size_bytes))
        .send(stream);
    } catch (err) {
      return reply.status(404).send({ error: 'Attachment not found' });
    }
  });

  app.delete('/attachments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { workspaceId } = req.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: 'workspaceId query parameter is required' });

    const attachment = await getAttachment(id);
    if (!attachment || attachment.workspace_id !== workspaceId) {
      return reply.status(404).send({ error: 'Attachment not found' });
    }
    if (!(await requireWorkspaceMembership(req, reply, workspaceId))) return;

    await ensureBucket();
    const client = getClient();
    await client.removeObject(S3_BUCKET, attachment.storage_key);
    await pool.query('DELETE FROM attachments WHERE id = $1', [id]);
    reply.status(204).send();
  });
}
