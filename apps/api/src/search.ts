import { toSql } from 'pgvector/utils';
import { pool } from './db.js';
import { embed } from './ai.js';

export async function fullTextSearch(workspaceId: string, query: string, limit = 20) {
  const { rows } = await pool.query(
    `SELECT id, path, title, content, ts_rank_cd(search_vector, plainto_tsquery('english', $2)) AS rank
     FROM documents
     WHERE workspace_id = $1 AND search_vector @@ plainto_tsquery('english', $2)
     ORDER BY rank DESC
     LIMIT $3`,
    [workspaceId, query, limit]
  );
  return rows;
}

export async function semanticSearch(workspaceId: string, query: string, limit = 20) {
  const vector = await embed(query);
  const { rows } = await pool.query(
    `SELECT d.id, d.path, d.title, c.content, c.embedding <=> $2::vector AS distance
     FROM document_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.workspace_id = $1 AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $2::vector
     LIMIT $3`,
    [workspaceId, toSql(vector), limit]
  );
  return rows;
}

export async function hybridSearch(workspaceId: string, query: string, limit = 20) {
  const [fulltext, semantic] = await Promise.all([
    fullTextSearch(workspaceId, query, limit),
    (async () => {
      try {
        return await semanticSearch(workspaceId, query, limit);
      } catch (err) {
        return [];
      }
    })(),
  ]);

  const scores = new Map<string, { id: string; path: string; title: string | null; content: string; score: number }>();

  for (let i = 0; i < fulltext.length; i++) {
    const row = fulltext[i];
    scores.set(row.id, { ...row, score: (fulltext.length - i) * 1.0 + (row.rank ?? 0) });
  }

  for (let i = 0; i < semantic.length; i++) {
    const row = semantic[i];
    const distance = row.distance ?? 1;
    const semanticScore = (1 - distance) * 100 + (semantic.length - i) * 0.5;
    const existing = scores.get(row.id);
    if (existing) {
      existing.score += semanticScore;
    } else {
      scores.set(row.id, { id: row.id, path: row.path, title: row.title, content: row.content, score: semanticScore });
    }
  }

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
