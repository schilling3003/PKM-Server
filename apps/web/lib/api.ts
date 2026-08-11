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
  archived_at: string | null;
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

export interface Citation {
  id: string;
  path: string;
  title: string | null;
  snippet: string;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
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

export async function listDocuments(workspaceId: string, includeArchived = true): Promise<Document[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents?includeArchived=${includeArchived ? 'true' : 'false'}`);
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

export async function duplicateDocument(workspaceId: string, id: string): Promise<Document> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${id}/duplicate`, { method: 'POST' });
  return handleResponse<Document>(res);
}

export async function archiveDocument(workspaceId: string, id: string): Promise<Document> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${id}/archive`, { method: 'POST' });
  return handleResponse<Document>(res);
}

export async function restoreDocument(workspaceId: string, id: string): Promise<Document> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${id}/restore`, { method: 'POST' });
  return handleResponse<Document>(res);
}

export interface Revision {
  id: string;
  content_hash: string;
  created_at: string;
}

export async function listRevisions(workspaceId: string, documentId: string): Promise<Revision[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${documentId}/revisions`);
  return handleResponse<Revision[]>(res);
}

export async function getRevision(workspaceId: string, documentId: string, revisionId: string): Promise<Revision & { content: string }> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${documentId}/revisions/${revisionId}`);
  return handleResponse<Revision & { content: string }>(res);
}

export async function restoreRevision(workspaceId: string, documentId: string, revisionId: string): Promise<Document> {
  const res = await fetch(
    `${API_BASE}/workspaces/${workspaceId}/documents/${documentId}/revisions/${revisionId}/restore`,
    { method: 'POST' }
  );
  return handleResponse<Document>(res);
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
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/index-status`);
  return handleResponse<IndexStatus>(res);
}

export async function getDocumentIndexStatus(
  workspaceId: string,
  documentId: string
): Promise<{ document_id: string; chunk_count: number; embedded_chunk_count: number; stale: boolean; failed: boolean }> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${documentId}/index-status`);
  return handleResponse<{ document_id: string; chunk_count: number; embedded_chunk_count: number; stale: boolean; failed: boolean }>(res);
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

export interface ProposedEdit {
  originalPath: string;
  proposedPath: string;
  originalContent: string;
  proposedContent: string;
  explanation: string;
  citations: Citation[];
  warning?: string;
}

export async function proposeEdit(
  workspaceId: string,
  request: { instruction: string; documentId?: string; path?: string }
): Promise<ProposedEdit> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/propose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<ProposedEdit>(res);
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

export interface OkfImportResult {
  imported: number;
}

export async function exportOkf(workspaceId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/okf/export`);
  if (!res.ok) {
    let text = '';
    try {
      text = await res.text();
    } catch {
      text = 'Unknown error';
    }
    throw new ApiError(text || `Request failed with ${res.status}`, res.status);
  }
  return res.blob();
}

export async function importOkf(workspaceId: string, file: File): Promise<OkfImportResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error('Could not read the selected file');
  }

  let bundle: unknown;
  try {
    bundle = JSON.parse(text);
  } catch {
    throw new Error('The selected file is not valid JSON');
  }

  if (
    !bundle ||
    typeof bundle !== 'object' ||
    !Array.isArray((bundle as Record<string, unknown>).concepts) ||
    (bundle as Record<string, unknown[]>).concepts.length === 0
  ) {
    throw new Error('The selected file is not a valid OKF bundle: concepts array must be non-empty');
  }

  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/okf/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: text,
  });

  try {
    return handleResponse<OkfImportResult>(res);
  } catch (err) {
    if (err instanceof ApiError) {
      try {
        const parsed = JSON.parse(err.message) as { error?: string } | undefined;
        if (parsed && typeof parsed.error === 'string') {
          throw new ApiError(parsed.error, err.status, parsed);
        }
      } catch {
        // fall through to the original error
      }
    }
    throw err;
  }
}
