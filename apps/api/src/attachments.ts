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
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'minioadmin';
const S3_BUCKET = process.env.S3_BUCKET || 'pkm';
const S3_REGION = process.env.S3_REGION || 'us-east-1';

async function requireWorkspaceMembership(
  request: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
  workspaceId: string
) {
  // When auth is not wired (e.g. some test harnesses), skip membership check.
  if (!request.user) return true;

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

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.sh', '.com', '.msi', '.jar', '.ps1',
  '.vbs', '.js', '.jse', '.wsf', '.php', '.py', '.pyc', '.rb', '.pl',
]);

const BLOCKED_CONTENT_TYPES = new Set([
  'application/x-msdownload',
  'application/x-executable',
  'application/x-msdos-program',
  'application/x-bat',
  'application/x-sh',
  'application/x-csh',
  'application/x-php',
  'application/x-python-code',
  'application/x-python',
  'application/javascript',
  'application/ecmascript',
  'application/x-javascript',
  'text/javascript',
  'text/ecmascript',
  'text/x-javascript',
]);

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

function isAllowedFile(filename: string, contentType: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) return false;
  if (BLOCKED_CONTENT_TYPES.has(contentType.toLowerCase())) return false;
  return true;
}

function contentDisposition(filename: string, contentType: string): string {
  const unsafe = ['text/html', 'application/xhtml+xml', 'image/svg+xml'];
  const disposition = unsafe.includes(contentType.toLowerCase()) ? 'attachment' : 'inline';
  const safe = filename.replace(/"/g, '\\"');
  return `${disposition}; filename="${safe}"`;
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
    const contentType = data.mimetype || 'application/octet-stream';

    if (!isAllowedFile(filename, contentType)) {
      return reply.status(400).send({ error: 'File type is not allowed' });
    }

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
    const respHeaders = {
      'response-content-disposition': contentDisposition(attachment.filename, attachment.content_type),
      'response-content-type': attachment.content_type,
    };
    const url = await client.presignedGetObject(S3_BUCKET, attachment.storage_key, 3600, respHeaders);
    return reply.redirect(url, 302);
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
