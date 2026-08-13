import { API_BASE, handleResponse, listDocuments, type Document, type GraphData, type GraphEdge } from './api';

export type { GraphData, GraphNode, GraphEdge } from './api';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/;

function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_RE, '');
}

function normalizeLinkTarget(target: string): string {
  const clean = target.split('#')[0].split('?')[0].trim();
  return clean.endsWith('.md') ? clean : `${clean}.md`;
}

function extractWikiLinks(content: string): { target: string }[] {
  const links: { target: string }[] = [];
  const re = /\[\[([^[\]\r\n|]+)(?:\|[^[\]\r\n|]+)?\]\]/g;
  for (const m of content.matchAll(re)) {
    links.push({ target: m[1].trim() });
  }
  return links;
}

function extractStandardLinks(content: string): { url: string }[] {
  const links: { url: string }[] = [];
  const re = /\[([^\]\\\r\n]*)\]\(([^()\s]+)\)/g;
  for (const m of content.matchAll(re)) {
    links.push({ url: m[2].trim() });
  }
  return links;
}

export async function getWorkspaceGraph(workspaceId: string): Promise<GraphData> {
  try {
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/graph`);
    if (res.ok) {
      return handleResponse<GraphData>(res);
    }
  } catch {
    // Endpoint may not be wired yet; fall back to client-side graph construction.
  }

  const docs = await listDocuments(workspaceId);
  const byPath = new Map(docs.map((d: Document) => [d.path, d]));
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];

  function addEdge(source: string, target: string, type: string) {
    const [a, b] = source < target ? [source, target] : [target, source];
    const key = `${a}|${b}|${type}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target, type });
  }

  for (const doc of docs) {
    const body = stripFrontmatter(doc.content);
    const wikiLinks = extractWikiLinks(body);
    for (const link of wikiLinks) {
      const targetPath = normalizeLinkTarget(link.target);
      const targetDoc = byPath.get(targetPath);
      if (targetDoc) {
        addEdge(doc.id, targetDoc.id, 'wiki');
      }
    }

    const standardLinks = extractStandardLinks(body);
    for (const link of standardLinks) {
      const cleanUrl = link.url.split('#')[0].split('?')[0].trim();
      if (!cleanUrl.endsWith('.md')) continue;
      const targetDoc = byPath.get(cleanUrl);
      if (targetDoc) {
        addEdge(doc.id, targetDoc.id, 'markdown');
      }
    }
  }

  return {
    nodes: docs.map((d) => ({
      id: d.id,
      path: d.path,
      title: d.title,
      type: typeof d.frontmatter.type === 'string' ? d.frontmatter.type : 'Note',
      source: 'document' as const,
    })),
    edges,
  };
}
