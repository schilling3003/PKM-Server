import { parseCanonical, serializeCanonical, extractWikiLinks, extractStandardLinks, hashContent } from '@pkm/markdown';
import { isReservedFilename, OkfValidationError } from '@pkm/okf';
import type { PoolClient } from 'pg';
import { pool } from './db.js';
import { indexDocument, deleteDocumentIndex, getLightRAGIndexStatus } from './ai.js';

const MAX_DOCUMENT_BYTES = 1024 * 1024;

class DocumentSizeError extends Error {
  statusCode = 413;
}

function assertDocumentSize(content: string) {
  if (Buffer.byteLength(content, 'utf-8') > MAX_DOCUMENT_BYTES) {
    throw new DocumentSizeError('Document exceeds maximum size of 1 MiB');
  }
}

function parseDocumentContent(content: string) {
  assertDocumentSize(content);
  try {
    return parseCanonical(content);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    (error as { statusCode?: number }).statusCode = 400;
    throw error;
  }
}

export interface DocumentRow {
  id: string;
  workspace_id: string;
  path: string;
  title: string | null;
  content: string;
  frontmatter: Record<string, unknown>;
  content_hash: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

function normalizePath(path: string): string {
  if (!path.endsWith('.md')) return `${path}.md`;
  return path;
}

function assertConceptPath(path: string, allowReserved = false) {
  if (!allowReserved && isReservedFilename(path)) {
    throw new OkfValidationError(path, 'reserved filename cannot be used for a concept');
  }
}

function computeTitle(frontmatter: Record<string, unknown>, fallback: string): string {
  const title = frontmatter.title;
  if (typeof title === 'string' && title.trim()) return title.trim();
  const base = fallback.split('/').pop()?.replace(/\.md$/, '') ?? fallback;
  return base;
}

export async function getWorkspaceDocuments(workspaceId: string, includeArchived = false): Promise<DocumentRow[]> {
  const sql = includeArchived
    ? 'SELECT id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at FROM documents WHERE workspace_id = $1 ORDER BY path'
    : 'SELECT id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at FROM documents WHERE workspace_id = $1 AND archived_at IS NULL ORDER BY path';
  const { rows } = await pool.query<DocumentRow>(sql, [workspaceId]);
  return rows;
}

export async function getDocumentByPath(workspaceId: string, path: string): Promise<DocumentRow | null> {
  const normalized = normalizePath(path);
  const { rows } = await pool.query<DocumentRow>(
    'SELECT id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at FROM documents WHERE workspace_id = $1 AND path = $2',
    [workspaceId, normalized]
  );
  return rows[0] ?? null;
}

export async function getDocument(workspaceId: string, documentId: string): Promise<DocumentRow | null> {
  const { rows } = await pool.query<DocumentRow>(
    'SELECT id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at FROM documents WHERE workspace_id = $1 AND id = $2',
    [workspaceId, documentId]
  );
  return rows[0] ?? null;
}

export async function listRevisions(workspaceId: string, documentId: string) {
  const { rows } = await pool.query(
    `SELECT r.id, r.content_hash, r.created_at
     FROM revisions r
     JOIN documents d ON d.id = r.document_id
     WHERE d.workspace_id = $1 AND d.id = $2
     ORDER BY r.created_at DESC`,
    [workspaceId, documentId]
  );
  return rows;
}

export async function getRevision(workspaceId: string, documentId: string, revisionId: string) {
  const { rows } = await pool.query(
    `SELECT r.id, r.content, r.content_hash, r.created_at
     FROM revisions r
     JOIN documents d ON d.id = r.document_id
     WHERE d.workspace_id = $1 AND d.id = $2 AND r.id = $3`,
    [workspaceId, documentId, revisionId]
  );
  return rows[0] ?? null;
}

async function safeIndexDocument(
  workspaceId: string,
  documentId: string,
  path: string,
  content: string,
  contentHash: string
): Promise<void> {
  try {
    await indexDocument({ workspace_id: workspaceId, document_id: documentId, path, content, content_hash: contentHash });
  } catch (err) {
    // Indexing is a projection; never fail the canonical write.
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`Indexing failed for ${path} in workspace ${workspaceId}:`, message);
  }
}

async function safeDeleteDocumentIndex(workspaceId: string, documentId: string): Promise<void> {
  try {
    await deleteDocumentIndex(workspaceId, documentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`Delete index failed for ${documentId} in workspace ${workspaceId}:`, message);
  }
}

export async function createDocument(
  workspaceId: string,
  path: string,
  content: string,
  options: { allowReserved?: boolean } = {}
): Promise<DocumentRow> {
  const normalized = normalizePath(path);
  assertConceptPath(normalized, options.allowReserved);
  const parsed = parseDocumentContent(content);
  const hash = parsed.hash;
  const title = computeTitle(parsed.frontmatter, normalized);

  if (!parsed.frontmatter.type) {
    parsed.frontmatter.type = 'Note';
  }
  const canonicalContent = serializeCanonical({
    frontmatter: parsed.frontmatter,
    body: parsed.body,
  });

  const document = await withTx(async (client) => {
    const { rows } = await client.query<DocumentRow>(
      `INSERT INTO documents (workspace_id, path, title, content, frontmatter, content_hash, search_vector)
       VALUES ($1, $2, $3, $4, $5, $6, to_tsvector('english', coalesce($3, '') || ' ' || $4))
       RETURNING id, workspace_id, path, title, content, frontmatter, content_hash, created_at, updated_at`,
      [workspaceId, normalized, title, canonicalContent, JSON.stringify(parsed.frontmatter), hash]
    );
    const doc = rows[0];
    await insertRevision(client, doc.id, canonicalContent, hash);
    await syncLinks(client, workspaceId, doc.id, canonicalContent);
    await resolveBacklinks(client, workspaceId, doc.id, doc.path);
    return doc;
  });

  await safeIndexDocument(workspaceId, document.id, document.path, canonicalContent, hash);
  return document;
}

export async function updateDocument(
  workspaceId: string,
  documentId: string,
  updates: { path?: string; content?: string },
  options: { allowReserved?: boolean } = {}
): Promise<DocumentRow> {
  const existing = await getDocument(workspaceId, documentId);
  if (!existing) throw new Error('Document not found');

  const content = updates.content ?? existing.content;
  const parsed = parseDocumentContent(content);
  const hash = parsed.hash;
  const title = computeTitle(parsed.frontmatter, updates.path ?? existing.path);

  if (updates.path) {
    assertConceptPath(normalizePath(updates.path), options.allowReserved);
  }

  if (!parsed.frontmatter.type) {
    parsed.frontmatter.type = 'Note';
  }
  const canonicalContent = serializeCanonical({
    frontmatter: parsed.frontmatter,
    body: parsed.body,
  });

  const document = await withTx(async (client) => {
    const newPath = updates.path ? normalizePath(updates.path) : existing.path;
    const { rows } = await client.query<DocumentRow>(
      `UPDATE documents
       SET path = $1, title = $2, content = $3, frontmatter = $4, content_hash = $5,
           search_vector = to_tsvector('english', coalesce($2, '') || ' ' || $3),
           updated_at = now()
       WHERE workspace_id = $6 AND id = $7
       RETURNING id, workspace_id, path, title, content, frontmatter, content_hash, created_at, updated_at`,
      [newPath, title, canonicalContent, JSON.stringify(parsed.frontmatter), hash, workspaceId, documentId]
    );
    const doc = rows[0];
    if (!doc) throw new Error('Document not found');

    if (updates.path && existing.path !== newPath) {
      await client.query(
        'UPDATE document_links SET target_path = $1 WHERE workspace_id = $2 AND target_document_id = $3',
        [newPath, workspaceId, documentId]
      );
    }

    if (existing.content !== canonicalContent) {
      const oldHash = hashContent(existing.content);
      await insertRevision(client, documentId, existing.content, oldHash);
    }
    await syncLinks(client, workspaceId, documentId, canonicalContent);
    await resolveBacklinks(client, workspaceId, documentId, doc.path);
    return doc;
  });

  await safeIndexDocument(workspaceId, document.id, document.path, canonicalContent, hash);
  return document;
}

export async function restoreRevision(workspaceId: string, documentId: string, revisionId: string): Promise<DocumentRow> {
  const existing = await getDocument(workspaceId, documentId);
  if (!existing) {
    const error = new Error('Document not found') as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  const revision = await getRevision(workspaceId, documentId, revisionId);
  if (!revision) {
    const error = new Error('Revision not found') as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  const parsed = parseDocumentContent(revision.content);
  const hash = parsed.hash;
  const title = computeTitle(parsed.frontmatter, existing.path);

  if (!parsed.frontmatter.type) {
    parsed.frontmatter.type = 'Note';
  }
  const canonicalContent = serializeCanonical({
    frontmatter: parsed.frontmatter,
    body: parsed.body,
  });

  const document = await withTx(async (client) => {
    const { rows } = await client.query<DocumentRow>(
      `UPDATE documents
       SET path = $1, title = $2, content = $3, frontmatter = $4, content_hash = $5,
           search_vector = to_tsvector('english', coalesce($2, '') || ' ' || $3),
           updated_at = now()
       WHERE workspace_id = $6 AND id = $7
       RETURNING id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at`,
      [existing.path, title, canonicalContent, JSON.stringify(parsed.frontmatter), hash, workspaceId, documentId]
    );
    const doc = rows[0];
    if (!doc) throw new Error('Document not found');

    await insertRevision(client, documentId, canonicalContent, hash);
    await syncLinks(client, workspaceId, documentId, canonicalContent);
    await resolveBacklinks(client, workspaceId, documentId, doc.path);
    return doc;
  });

  await safeIndexDocument(workspaceId, document.id, document.path, canonicalContent, hash);
  return document;
}

export async function deleteDocument(workspaceId: string, documentId: string): Promise<void> {
  await pool.query('DELETE FROM documents WHERE workspace_id = $1 AND id = $2', [workspaceId, documentId]);
  await safeDeleteDocumentIndex(workspaceId, documentId);
}

export async function getBacklinks(workspaceId: string, documentId: string) {
  const { rows } = await pool.query(
    `SELECT s.id, s.path, s.title
     FROM documents s
     JOIN document_links l ON l.source_document_id = s.id
     WHERE l.workspace_id = $1 AND l.target_document_id = $2`,
    [workspaceId, documentId]
  );
  return rows;
}

export async function getOutgoingLinks(workspaceId: string, documentId: string) {
  const { rows } = await pool.query(
    `SELECT coalesce(d.id, l.target_document_id) AS id,
            l.target_path AS path,
            coalesce(d.title, l.target_path) AS title,
            l.link_type
     FROM document_links l
     LEFT JOIN documents d ON d.id = l.target_document_id
     WHERE l.workspace_id = $1 AND l.source_document_id = $2`,
    [workspaceId, documentId]
  );
  return rows;
}

async function insertRevision(client: PoolClient, documentId: string, content: string, contentHash: string) {
  await client.query(
    'INSERT INTO revisions (document_id, content, content_hash) VALUES ($1, $2, $3)',
    [documentId, content, contentHash]
  );
}

function tryDecodeUrl(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

async function syncLinks(client: PoolClient, workspaceId: string, documentId: string, content: string) {
  await client.query('DELETE FROM document_links WHERE source_document_id = $1', [documentId]);

  const wiki = extractWikiLinks(content);
  const standard = extractStandardLinks(content);
  const targets = new Map<string, { type: string }>();

  for (const link of wiki) {
    const target = normalizePath(link.target).toLowerCase();
    targets.set(target, { type: 'wiki' });
  }
  for (const link of standard) {
    const decoded = tryDecodeUrl(link.url);
    if (!decoded.endsWith('.md')) continue;
    const target = normalizePath(decoded.slice(0, -3)).toLowerCase();
    targets.set(target, { type: 'markdown' });
  }

  for (const [targetPath, meta] of targets) {
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM documents WHERE workspace_id = $1 AND LOWER(path) = $2',
      [workspaceId, targetPath]
    );
    const targetId = rows[0]?.id ?? null;
    await client.query(
      `INSERT INTO document_links (workspace_id, source_document_id, target_document_id, target_path, link_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source_document_id, target_path, link_type) DO UPDATE SET target_document_id = $3`,
      [workspaceId, documentId, targetId, targetPath, meta.type]
    );
  }
}

async function resolveBacklinks(client: PoolClient, workspaceId: string, documentId: string, path: string) {
  await client.query(
    `UPDATE document_links
     SET target_document_id = $1
     WHERE workspace_id = $2 AND LOWER(target_path) = $3 AND target_document_id IS NULL`,
    [documentId, workspaceId, path.toLowerCase()]
  );
}

export async function duplicateDocument(workspaceId: string, documentId: string): Promise<DocumentRow> {
  const existing = await getDocument(workspaceId, documentId);
  if (!existing) throw new Error('Document not found');

  const document = await withTx(async (client) => {
    const newPath = await uniqueDuplicatePath(client, workspaceId, existing.path);
    const parsed = parseDocumentContent(existing.content);
    const title = computeTitle(parsed.frontmatter, newPath);
    const contentHash = hashContent(existing.content);
    const { rows } = await client.query<DocumentRow>(
      `INSERT INTO documents (workspace_id, path, title, content, frontmatter, content_hash, search_vector)
       VALUES ($1, $2, $3, $4, $5, $6, to_tsvector('english', coalesce($3, '') || ' ' || $4))
       RETURNING id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at`,
      [workspaceId, newPath, title, existing.content, JSON.stringify(parsed.frontmatter), contentHash]
    );
    const doc = rows[0];
    await insertRevision(client, doc.id, existing.content, contentHash);
    await syncLinks(client, workspaceId, doc.id, existing.content);
    await resolveBacklinks(client, workspaceId, doc.id, doc.path);
    return doc;
  });

  await safeIndexDocument(workspaceId, document.id, document.path, document.content, document.content_hash);
  return document;
}

export async function archiveDocument(workspaceId: string, documentId: string): Promise<DocumentRow> {
  const { rows } = await pool.query<DocumentRow>(
    `UPDATE documents SET archived_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at`,
    [workspaceId, documentId]
  );
  if (!rows[0]) throw new Error('Document not found');
  await safeDeleteDocumentIndex(workspaceId, documentId);
  return rows[0];
}

export interface IndexStatus {
  document_count: number;
  indexed_document_count: number;
  current_document_count: number;
  stale_document_count: number;
  failed_document_count: number;
  chunk_count: number;
  embedded_chunk_count: number;
}

export async function getWorkspaceIndexStatus(workspaceId: string): Promise<IndexStatus> {
  const { rows: docs } = await pool.query<{ id: string; content_hash: string }>(
    'SELECT id, content_hash FROM documents WHERE workspace_id = $1 AND archived_at IS NULL',
    [workspaceId]
  );
  const hashById = new Map(docs.map((d) => [d.id, d.content_hash]));

  const zero: IndexStatus = {
    document_count: docs.length,
    indexed_document_count: 0,
    current_document_count: 0,
    stale_document_count: 0,
    failed_document_count: 0,
    chunk_count: 0,
    embedded_chunk_count: 0,
  };

  let status;
  try {
    status = await getLightRAGIndexStatus(workspaceId);
  } catch (err) {
    return zero;
  }

  const statusDocs = status.documents ?? [];
  const indexed = statusDocs.filter((d) => String(d.status).toLowerCase() === 'processed');
  const failed = statusDocs.filter((d) => String(d.status).toLowerCase() === 'failed');
  const current = indexed.filter((d) => hashById.get(d.document_id) === d.content_hash).length;
  const stale = indexed.filter((d) => {
    const canonicalHash = hashById.get(d.document_id);
    return canonicalHash !== undefined && canonicalHash !== d.content_hash;
  }).length;
  const chunkCount = indexed.reduce((sum, d) => sum + (d.chunks_count ?? 0), 0);

  return {
    document_count: docs.length,
    indexed_document_count: indexed.length,
    current_document_count: current,
    stale_document_count: stale,
    failed_document_count: failed.length,
    chunk_count: chunkCount,
    embedded_chunk_count: chunkCount,
  };
}

export async function getDocumentIndexStatus(workspaceId: string, documentId: string) {
  const { rows: docRows } = await pool.query<DocumentRow>(
    'SELECT id, content_hash, archived_at FROM documents WHERE workspace_id = $1 AND id = $2',
    [workspaceId, documentId]
  );
  const doc = docRows[0];
  if (!doc) return null;

  let status;
  try {
    status = await getLightRAGIndexStatus(workspaceId);
  } catch (err) {
    // If the AI service is unreachable we cannot confirm the index is current, so report failed.
    return { document_id: doc.id, chunk_count: 0, embedded_chunk_count: 0, stale: false, failed: true };
  }

  const ragDoc = status.documents?.find((d) => d.document_id === documentId);
  if (!ragDoc) {
    return { document_id: doc.id, chunk_count: 0, embedded_chunk_count: 0, stale: false, failed: false };
  }

  const statusName = String(ragDoc.status).toLowerCase();
  const failed = statusName === 'failed';
  const stale = !failed && statusName === 'processed' && ragDoc.content_hash !== undefined && ragDoc.content_hash !== doc.content_hash;
  const chunkCount = ragDoc.chunks_count ?? 0;
  const embeddedChunkCount = statusName === 'processed' ? chunkCount : 0;

  return {
    document_id: doc.id,
    chunk_count: chunkCount,
    embedded_chunk_count: embeddedChunkCount,
    stale,
    failed,
  };
}

export async function restoreDocument(workspaceId: string, documentId: string): Promise<DocumentRow> {
  const { rows } = await pool.query<DocumentRow>(
    `UPDATE documents SET archived_at = NULL
     WHERE workspace_id = $1 AND id = $2
     RETURNING id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at`,
    [workspaceId, documentId]
  );
  if (!rows[0]) throw new Error('Document not found');
  const doc = rows[0];
  await safeIndexDocument(workspaceId, doc.id, doc.path, doc.content, doc.content_hash);
  return doc;
}

async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function uniqueDuplicatePath(client: PoolClient, workspaceId: string, path: string): Promise<string> {
  const base = path.replace(/\.md$/i, '');
  let candidate = `${base} (copy).md`;
  let counter = 2;
  while (await getDocumentByPathWithClient(client, workspaceId, candidate)) {
    candidate = `${base} (copy ${counter}).md`;
    counter++;
  }
  return candidate;
}

async function getDocumentByPathWithClient(client: PoolClient, workspaceId: string, path: string): Promise<DocumentRow | null> {
  const normalized = normalizePath(path);
  const { rows } = await client.query<DocumentRow>(
    'SELECT id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at FROM documents WHERE workspace_id = $1 AND path = $2',
    [workspaceId, normalized]
  );
  return rows[0] ?? null;
}
