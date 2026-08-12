import type { FastifyInstance } from 'fastify';
import { pool } from './db.js';
import { getLightRAGGraph } from './ai.js';

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
  description?: string;
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function getWorkspaceGraph(workspaceId: string): Promise<GraphData> {
  // Manual wikilink/markdown-link graph derived from canonical documents.
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

  const nodeIds = new Set(documents.map((d) => d.id));
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

  // Merge in LightRAG-derived entity/relationship graph, if any.
  try {
    const ragGraph = await getLightRAGGraph(workspaceId);
    for (const node of ragGraph.nodes ?? []) {
      if (nodeIds.has(node.id)) continue;
      nodeIds.add(node.id);
      const props = node.properties ?? {};
      documents.push({
        id: node.id,
        path: '',
        title: node.id,
        type: String(props.entity_type ?? (node.labels?.[0] || 'entity')),
      });
    }
    for (const edge of ragGraph.edges ?? []) {
      const key = `${edge.source}|${edge.target}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      const props = edge.properties ?? {};
      edges.push({
        source: edge.source,
        target: edge.target,
        type: 'relationship',
        description: props.description ? String(props.description) : undefined,
        weight: typeof props.weight === 'number' ? props.weight : undefined,
      });
    }
  } catch (err) {
    // If the AI service is unavailable, return the manual graph only.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('unavailable')) {
      // ignore
    }
  }

  return { nodes: documents, edges };
}

export async function registerGraphRoutes(app: FastifyInstance) {
  app.get('/workspaces/:workspaceId/graph', async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    return getWorkspaceGraph(workspaceId);
  });
}
