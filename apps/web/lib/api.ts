export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

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

export async function listWorkspaces(): Promise<Workspace[]> {
  const res = await fetch(`${API_BASE}/workspaces`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listDocuments(workspaceId: string): Promise<Document[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDocument(workspaceId: string, id: string): Promise<Document> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createDocument(workspaceId: string, path: string, content: string): Promise<Document> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateDocument(workspaceId: string, id: string, updates: { path?: string; content?: string }): Promise<Document> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteDocument(workspaceId: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/documents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}
