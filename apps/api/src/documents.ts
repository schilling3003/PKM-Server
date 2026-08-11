import { parseCanonical, serializeCanonical, extractWikiLinks, extractStandardLinks, hashContent } from '@pkm/markdown';
import { toSql } from 'pgvector/utils';
import type { PoolClient } from 'pg';
import { pool } from './db.js';
import { generateChunks, embedChunks } from './chunks.js';

export interface DocumentRow {
  id: string;
  workspace_id: string;
  path: string;
  title: string | null;
  content: string;
  frontmatter: Record<string, unknown>;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

function normalizePath(path: string): string {
  if (!path.endsWith('.md')) return `${path}.md`;
  return path;
}

function computeTitle(frontmatter: Record<string, unknown>, fallback: string): string {
  const title = frontmatter.title;
  if (typeof title === 'string' && title.trim()) return title.trim();
  const base = fallback.split('/').pop()?.replace(/\.md$/, '') ?? fallback;
  return base;
}

export async function getWorkspaceDocuments(workspaceId: string): Promise<DocumentRow[]> {
  const { rows } = await pool.query<DocumentRow>(
    'SELECT id, workspace_id, path, title, content, frontmatter, content_hash, created_at, updated_at FROM documents WHERE workspace_id = $1 ORDER BY path',
    [workspaceId]
  );
  return rows;
}

export async function getDocumentByPath(workspaceId: string, path: string): Promise<DocumentRow | null> {
  const normalized = normalizePath(path);
  const { rows } = await pool.query<DocumentRow>(
    'SELECT id, workspace_id, path, title, content, frontmatter, content_hash, created_at, updated_at FROM documents WHERE workspace_id = $1 AND path = $2',
    [workspaceId, normalized]
  );
  return rows[0] ?? null;
}

export async function getDocument(workspaceId: string, documentId: string): Promise<DocumentRow | null> {
  const { rows } = await pool.query<DocumentRow>(
    'SELECT id, workspace_id, path, title, content, frontmatter, content_hash, created_at, updated_at FROM documents WHERE workspace_id = $1 AND id = $2',
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
  content: string
): Promise<DocumentRow> {
  const normalized = normalizePath(path);
  const parsed = parseCanonical(content);
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
  updates: { path?: string; content?: string }
): Promise<DocumentRow> {
  const existing = await getDocument(workspaceId, documentId);
  if (!existing) throw new Error('Document not found');

  const content = updates.content ?? existing.content;
  const parsed = parseCanonical(content);
  const hash = parsed.hash;
  const title = computeTitle(parsed.frontmatter, updates.path ?? existing.path);

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

async function syncLinks(client: PoolClient, workspaceId: string, documentId: string, content: string) {
  await client.query('DELETE FROM document_links WHERE source_document_id = $1', [documentId]);

  const wiki = extractWikiLinks(content);
  const standard = extractStandardLinks(content);
  const targets = new Map<string, { type: string }>();

  for (const link of wiki) {
    const target = normalizePath(link.target);
    targets.set(target, { type: 'wiki' });
  }
  for (const link of standard) {
    if (!link.url.endsWith('.md')) continue;
    const target = normalizePath(link.url.slice(0, -3));
    targets.set(target, { type: 'markdown' });
  }

  for (const [targetPath, meta] of targets) {
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM documents WHERE workspace_id = $1 AND path = $2',
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
     WHERE workspace_id = $2 AND target_path = $3 AND target_document_id IS NULL`,
    [documentId, workspaceId, path]
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
