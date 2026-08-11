import { API_BASE, ApiError } from './api';

export interface Attachment {
  id: string;
  workspace_id: string;
  document_id: string | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  created_at: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
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

export async function listAttachments(workspaceId: string): Promise<Attachment[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/attachments`);
  return handleResponse<Attachment[]>(res);
}

export async function uploadAttachment(workspaceId: string, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/attachments`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<Attachment>(res);
}

export function getAttachmentDownloadUrl(attachmentId: string, workspaceId: string): string {
  return `${API_BASE}/attachments/${attachmentId}?workspaceId=${workspaceId}`;
}

export async function deleteAttachment(attachmentId: string, workspaceId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/attachments/${attachmentId}?workspaceId=${workspaceId}`, {
    method: 'DELETE',
  });
  await handleResponse<void>(res);
}
