import type { FastifyInstance } from 'fastify';
import { pool } from './db.js';

export interface GraphNode {
  id: string;
  path: string;
  title: string | null;
  type: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function getWorkspaceGraph(workspaceId: string): Promise<GraphData> {
  const { rows: documents } = await pool.query<GraphNode>(
    `SELECT id, path, title, COALESCE(frontmatter->>'type', 'Note') AS type
     FROM documents
     WHERE workspace_id = $1
     ORDER BY path`,
    [workspaceId]
  );

  const { rows: links } = await pool.query<GraphEdge>(
    `SELECT source_document_id AS source, target_document_id AS target, link_type AS type
     FROM document_links
     WHERE workspace_id = $1 AND target_document_id IS NOT NULL`,
    [workspaceId]
  );

  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const link of links) {
    const a = link.source;
    const b = link.target;
    if (!a || !b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({ source: a, target: b, type: link.type ?? 'link' });
  }

  return { nodes: documents, edges };
}

export async function registerGraphRoutes(app: FastifyInstance) {
  app.get('/workspaces/:workspaceId/graph', async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    return getWorkspaceGraph(workspaceId);
  });
}
