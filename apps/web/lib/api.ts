export const API_BASE =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_BASE_URL || '/api')
    : (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000');

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
}

export interface Document {
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

export interface Link {
  id: string;
  path: string;
  title: string | null;
  link_type?: string;
}

export interface SearchResult extends Document {
  rank?: number;
  distance?: number;
  score?: number;
}

export interface AskResult {
  answer: string;
  citations: { id: string; path: string; title: string | null; snippet: string }[];
  warning?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public info?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let text = '';
    try {
      text = await res.text();
    } catch {
      text = 'Unknown error';
    }
    throw new ApiError(text || `Request failed with ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const res = await fetch(`${API_BASE}/workspaces`);
  return handleResponse<Workspace[]>(res);
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/workspaces/${id}`);
  return handleResponse<Workspace>(res);
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return handleResponse<Workspace>(res);
}

export async function listDocuments(workspaceId: string): Promise<Document[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents`);
  return handleResponse<Document[]>(res);
}

export async function getDocument(workspaceId: string, id: string): Promise<Document> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${id}`);
  return handleResponse<Document>(res);
}

export async function createDocument(workspaceId: string, path: string, content: string): Promise<Document> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  return handleResponse<Document>(res);
}

export async function updateDocument(
  workspaceId: string,
  id: string,
  updates: { path?: string; content?: string }
): Promise<Document> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return handleResponse<Document>(res);
}

export async function deleteDocument(workspaceId: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${id}`, { method: 'DELETE' });
  await handleResponse<void>(res);
}

export async function getBacklinks(workspaceId: string, documentId: string): Promise<Link[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${documentId}/backlinks`);
  return handleResponse<Link[]>(res);
}

export async function getOutgoingLinks(workspaceId: string, documentId: string): Promise<Link[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${documentId}/links`);
  return handleResponse<Link[]>(res);
}

export async function searchDocuments(workspaceId: string, query: string, limit = 20): Promise<SearchResult[]> {
  const res = await fetch(
    `${API_BASE}/workspaces/${workspaceId}/search?${new URLSearchParams({ q: query, limit: String(limit) })}`
  );
  return handleResponse<SearchResult[]>(res);
}

export async function askWorkspace(workspaceId: string, question: string): Promise<AskResult> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  return handleResponse<AskResult>(res);
}

export interface GraphNode {
  id: string;
  path: string;
  title: string | null;
  type: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
