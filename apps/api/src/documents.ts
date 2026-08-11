import { parseCanonical, serializeCanonical, extractWikiLinks, extractStandardLinks, hashContent } from '@pkm/markdown';
import { isReservedFilename, OkfValidationError } from '@pkm/okf';
import { toSql } from 'pgvector/utils';
import type { PoolClient } from 'pg';
import { pool } from './db.js';
import { generateChunks, embedChunks } from './chunks.js';

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

  const chunks = generateChunks(parsed.body);
  const chunkEmbeddings = await safeEmbedChunks(chunks);

  return await withTx(async (client) => {
    const { rows } = await client.query<DocumentRow>(
      `INSERT INTO documents (workspace_id, path, title, content, frontmatter, content_hash, search_vector)
       VALUES ($1, $2, $3, $4, $5, $6, to_tsvector('english', coalesce($3, '') || ' ' || $4))
       RETURNING id, workspace_id, path, title, content, frontmatter, content_hash, created_at, updated_at`,
      [workspaceId, normalized, title, canonicalContent, JSON.stringify(parsed.frontmatter), hash]
    );
    const document = rows[0];
    await insertRevision(client, document.id, canonicalContent, hash);
    await syncLinks(client, workspaceId, document.id, canonicalContent);
    await resolveBacklinks(client, workspaceId, document.id, document.path);
    await syncChunks(client, workspaceId, document.id, chunks, chunkEmbeddings, hash);
    return document;
  });
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

  const chunks = generateChunks(parsed.body);
  const chunkEmbeddings = await safeEmbedChunks(chunks);

  return await withTx(async (client) => {
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
    const document = rows[0];
    if (!document) throw new Error('Document not found');

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
    await resolveBacklinks(client, workspaceId, documentId, document.path);
    await syncChunks(client, workspaceId, documentId, chunks, chunkEmbeddings, hash);
    return document;
  });
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

  const chunks = generateChunks(parsed.body);
  const chunkEmbeddings = await safeEmbedChunks(chunks);

  return await withTx(async (client) => {
    const { rows } = await client.query<DocumentRow>(
      `UPDATE documents
       SET path = $1, title = $2, content = $3, frontmatter = $4, content_hash = $5,
           search_vector = to_tsvector('english', coalesce($2, '') || ' ' || $3),
           updated_at = now()
       WHERE workspace_id = $6 AND id = $7
       RETURNING id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at`,
      [existing.path, title, canonicalContent, JSON.stringify(parsed.frontmatter), hash, workspaceId, documentId]
    );
    const document = rows[0];
    if (!document) throw new Error('Document not found');

    await insertRevision(client, documentId, canonicalContent, hash);
    await syncLinks(client, workspaceId, documentId, canonicalContent);
    await resolveBacklinks(client, workspaceId, documentId, document.path);
    await syncChunks(client, workspaceId, documentId, chunks, chunkEmbeddings, hash);
    return document;
  });
}

export async function deleteDocument(workspaceId: string, documentId: string): Promise<void> {
  await pool.query('DELETE FROM documents WHERE workspace_id = $1 AND id = $2', [workspaceId, documentId]);
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

async function syncChunks(
  client: PoolClient,
  workspaceId: string,
  documentId: string,
  chunks: string[],
  embeddings: (number[] | null)[],
  contentHash: string
) {
  await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    const embeddingSql = embedding ? toSql(embedding) : null;
    await client.query(
      `INSERT INTO document_chunks (workspace_id, document_id, chunk_index, content, embedding, search_vector, content_hash)
       VALUES ($1, $2, $3, $4, $5::vector, to_tsvector('english', $4), $6)`,
      [workspaceId, documentId, i, chunk, embeddingSql, contentHash]
    );
  }
}

async function safeEmbedChunks(chunks: string[]): Promise<(number[] | null)[]> {
  try {
    return await embedChunks(chunks);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Embedding failed, continuing without vector index', err);
    return chunks.map(() => null);
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

export async function duplicateDocument(workspaceId: string, documentId: string): Promise<DocumentRow> {
  const existing = await getDocument(workspaceId, documentId);
  if (!existing) throw new Error('Document not found');

  const parsed = parseDocumentContent(existing.content);
  const chunks = generateChunks(parsed.body);
  const chunkEmbeddings = await safeEmbedChunks(chunks);

  return withTx(async (client) => {
    const newPath = await uniqueDuplicatePath(client, workspaceId, existing.path);
    const title = computeTitle(parsed.frontmatter, newPath);
    const { rows } = await client.query<DocumentRow>(
      `INSERT INTO documents (workspace_id, path, title, content, frontmatter, content_hash, search_vector)
       VALUES ($1, $2, $3, $4, $5, $6, to_tsvector('english', coalesce($3, '') || ' ' || $4))
       RETURNING id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at`,
      [workspaceId, newPath, title, existing.content, JSON.stringify(parsed.frontmatter), hashContent(existing.content)]
    );
    const document = rows[0];
    await insertRevision(client, document.id, existing.content, document.content_hash);
    await syncLinks(client, workspaceId, document.id, existing.content);
    await resolveBacklinks(client, workspaceId, document.id, document.path);
    await syncChunks(client, workspaceId, document.id, chunks, chunkEmbeddings, document.content_hash);
    return document;
  });
}

export async function archiveDocument(workspaceId: string, documentId: string): Promise<DocumentRow> {
  const { rows } = await pool.query<DocumentRow>(
    `UPDATE documents SET archived_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at`,
    [workspaceId, documentId]
  );
  if (!rows[0]) throw new Error('Document not found');
  return rows[0];
}

export interface IndexStatus {
  document_count: number;
  indexed_document_count: number;
  current_document_count: number;
  stale_document_count: number;
  chunk_count: number;
  embedded_chunk_count: number;
}

export async function getWorkspaceIndexStatus(workspaceId: string): Promise<IndexStatus> {
  const { rows } = await pool.query<IndexStatus>(
    `SELECT
       COUNT(DISTINCT d.id)::int AS document_count,
       COUNT(DISTINCT CASE WHEN dc.id IS NOT NULL THEN d.id END)::int AS indexed_document_count,
       COUNT(DISTINCT CASE WHEN dc.id IS NOT NULL AND dc.content_hash = d.content_hash THEN d.id END)::int AS current_document_count,
       COUNT(DISTINCT CASE WHEN dc.id IS NOT NULL AND dc.content_hash <> d.content_hash THEN d.id END)::int AS stale_document_count,
       COUNT(dc.id)::int AS chunk_count,
       COUNT(CASE WHEN dc.embedding IS NOT NULL THEN 1 END)::int AS embedded_chunk_count
     FROM documents d
     LEFT JOIN document_chunks dc ON dc.document_id = d.id
     WHERE d.workspace_id = $1 AND d.archived_at IS NULL`,
    [workspaceId]
  );
  return rows[0];
}

export async function getDocumentIndexStatus(workspaceId: string, documentId: string) {
  const { rows: docRows } = await pool.query<DocumentRow>(
    'SELECT id, content_hash FROM documents WHERE workspace_id = $1 AND id = $2 AND archived_at IS NULL',
    [workspaceId, documentId]
  );
  const doc = docRows[0];
  if (!doc) return null;

  const { rows } = await pool.query(
    `SELECT content_hash, embedding IS NOT NULL AS has_embedding
     FROM document_chunks
     WHERE document_id = $1`,
    [documentId]
  );
  const chunks = rows as { content_hash: string; has_embedding: boolean }[];
  const chunk_count = chunks.length;
  const embedded_chunk_count = chunks.filter((c) => c.has_embedding).length;
  const stale = chunk_count > 0 && chunks.some((c) => c.content_hash !== doc.content_hash);
  return { document_id: doc.id, chunk_count, embedded_chunk_count, stale };
}

export async function restoreDocument(workspaceId: string, documentId: string): Promise<DocumentRow> {
  const { rows } = await pool.query<DocumentRow>(
    `UPDATE documents SET archived_at = NULL
     WHERE workspace_id = $1 AND id = $2
     RETURNING id, workspace_id, path, title, content, frontmatter, content_hash, archived_at, created_at, updated_at`,
    [workspaceId, documentId]
  );
  if (!rows[0]) throw new Error('Document not found');
  return rows[0];
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
