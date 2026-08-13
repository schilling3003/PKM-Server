import { askWithLightRAG, type AskResult, type Citation } from './ai.js';
import { pool } from './db.js';

interface AskOutput {
  answer: string;
  citations: Citation[];
  warning?: string;
}

async function resolveCitationTitles(workspaceId: string, citations: Citation[]): Promise<Citation[]> {
  if (citations.length === 0) return citations;

  const ids: string[] = [];
  const paths: string[] = [];
  for (const c of citations) {
    if (c.id && !c.title) ids.push(c.id);
    if (c.path && !c.title) paths.push(c.path);
  }

  const titles = new Map<string, string | null>();
  if (ids.length > 0) {
    const { rows } = await pool.query<{ id: string; title: string | null; path: string }>(
      `SELECT id, title, path FROM documents WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
      [workspaceId, ids]
    );
    for (const row of rows) {
      titles.set(row.id, row.title);
      titles.set(row.path, row.title);
    }
  }
  if (paths.length > 0) {
    const { rows } = await pool.query<{ title: string | null; path: string }>(
      `SELECT title, path FROM documents WHERE workspace_id = $1 AND path = ANY($2::text[])`,
      [workspaceId, paths]
    );
    for (const row of rows) {
      titles.set(row.path, row.title);
    }
  }

  return citations.map((c) => ({
    ...c,
    title: c.title ?? titles.get(c.id) ?? titles.get(c.path) ?? c.path,
  }));
}

export async function askWorkspace(workspaceId: string, question: string): Promise<AskOutput> {
  let data: AskResult;
  try {
    data = await askWithLightRAG(workspaceId, question);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      answer: 'I do not have enough information in this workspace to answer that question.',
      citations: [],
      warning: `AI service unavailable: ${msg}`,
    };
  }

  const citations = await resolveCitationTitles(workspaceId, data.citations ?? []);
  return {
    answer: data.answer,
    citations,
    warning: data.warning,
  };
}
