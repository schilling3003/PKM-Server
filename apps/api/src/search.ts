import { pool } from './db.js';
import { searchDocuments } from './ai.js';

export interface SearchResult {
  id: string;
  path: string;
  title: string | null;
  content: string;
  score: number;
}

export async function fullTextSearch(workspaceId: string, query: string, limit = 20): Promise<SearchResult[]> {
  // Full-text search remains available as a fast path; most callers should use
  // hybridSearch, which now delegates semantic ranking to the LightRAG AI service.
  const { rows } = await pool.query(
    `SELECT id, path, title, content, ts_rank_cd(search_vector, plainto_tsquery('english', $2)) AS score
     FROM documents
     WHERE workspace_id = $1 AND search_vector @@ plainto_tsquery('english', $2)
     ORDER BY score DESC
     LIMIT $3`,
    [workspaceId, query, limit]
  );
  return rows as SearchResult[];
}

export async function semanticSearch(workspaceId: string, query: string, limit = 20): Promise<SearchResult[]> {
  return (await hybridSearch(workspaceId, query, limit)).slice(0, limit);
}

export async function hybridSearch(workspaceId: string, query: string, limit = 20): Promise<SearchResult[]> {
  const result = await searchDocuments(workspaceId, query, limit);
  const chunks = result.chunks ?? [];
  if (chunks.length === 0) {
    return fullTextSearch(workspaceId, query, limit);
  }

  // Resolve chunk file paths to canonical documents and dedupe by document,
  // keeping the highest-scoring (first) chunk per document.
  const paths = [...new Set(chunks.map((c) => c.file_path))];
  const { rows: docs } = await pool.query<{ id: string; path: string; title: string | null; content: string }>(
    `SELECT id, path, title, content
     FROM documents
     WHERE workspace_id = $1 AND path = ANY($2::text[])`,
    [workspaceId, paths]
  );
  const byPath = new Map(docs.map((d) => [d.path, d]));

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const doc = byPath.get(chunk.file_path);
    if (!doc || seen.has(doc.id)) continue;
    seen.add(doc.id);
    results.push({
      id: doc.id,
      path: doc.path,
      title: doc.title,
      content: chunk.content,
      score: (limit - i) / limit,
    });
    if (results.length >= limit) break;
  }

  // If LightRAG returned no resolvable documents but the query is broad, fall
  // back to full-text so search still works when the index is empty/stale.
  if (results.length === 0) {
    return fullTextSearch(workspaceId, query, limit);
  }

  return results;
}
