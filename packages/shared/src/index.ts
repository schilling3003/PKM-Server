export interface Health {
  status: 'ok' | 'degraded' | 'error';
  services: Record<string, { status: 'ok' | 'error'; latencyMs: number; message?: string }>;
  version: string;
}

export interface Document {
  id: string;
  workspaceId: string;
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}
