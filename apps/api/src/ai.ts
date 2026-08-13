
const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const aiKey = process.env.AI_SERVICE_API_KEY;

if (process.env.NODE_ENV === 'production' && !aiKey) {
  throw new Error('AI_SERVICE_API_KEY is required in production');
}

function aiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (aiKey) headers['X-API-Key'] = aiKey;
  return headers;
}

// Legacy embedding endpoint: kept until all callers are migrated to LightRAG search.
export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${aiUrl}/embed`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`AI embed failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

export interface GenerateAnswerResult {
  answer: string;
  warning?: string;
  noLlm?: boolean;
}

/** @deprecated Use askWithLightRAG instead. */
export async function generateAnswer(params: { context: string; question: string }): Promise<GenerateAnswerResult> {
  const res = await fetch(`${aiUrl}/ask`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify({ context: params.context, question: params.question }),
  });
  if (!res.ok) {
    throw new Error(`AI ask failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as GenerateAnswerResult;
  return data;
}

export interface LightRAGIndexInput {
  workspace_id: string;
  document_id: string;
  path: string;
  content: string;
  content_hash: string;
  skip_kg?: boolean;
}

export async function indexDocument(input: LightRAGIndexInput): Promise<void> {
  const res = await fetch(`${aiUrl}/index`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`LightRAG index failed: ${res.status} ${await res.text()}`);
  }
}

export async function deleteDocumentIndex(workspaceId: string, documentId: string): Promise<void> {
  const res = await fetch(`${aiUrl}/index/${encodeURIComponent(workspaceId)}/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
    headers: aiHeaders(),
  });
  if (!res.ok) {
    throw new Error(`LightRAG delete index failed: ${res.status} ${await res.text()}`);
  }
}

export interface LightRAGSearchChunk {
  content: string;
  file_path: string;
  chunk_id: string;
  reference_id: string;
}

export interface LightRAGSearchResult {
  chunks: LightRAGSearchChunk[];
  references: { reference_id: string; file_path: string }[];
}

export async function searchDocuments(workspaceId: string, query: string, limit = 20): Promise<LightRAGSearchResult> {
  const res = await fetch(`${aiUrl}/query`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify({
      workspace_id: workspaceId,
      query,
      mode: 'naive',
      top_k: limit,
      chunk_top_k: limit,
    }),
  });
  if (!res.ok) {
    throw new Error(`LightRAG query failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as LightRAGSearchResult;
  return data;
}

export interface Citation {
  id: string;
  path: string;
  title?: string;
  snippet: string;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  warning?: string;
}

export async function askWithLightRAG(workspaceId: string, question: string): Promise<AskResult> {
  const res = await fetch(`${aiUrl}/ask`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify({ workspace_id: workspaceId, question }),
  });
  if (!res.ok) {
    throw new Error(`LightRAG ask failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as AskResult;
  return data;
}

export interface LightRAGNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface LightRAGEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

export async function getLightRAGGraph(workspaceId: string): Promise<{ nodes: LightRAGNode[]; edges: LightRAGEdge[] }> {
  const res = await fetch(`${aiUrl}/graph/${encodeURIComponent(workspaceId)}`, {
    headers: aiHeaders(),
  });
  if (!res.ok) {
    throw new Error(`LightRAG graph failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { nodes: LightRAGNode[]; edges: LightRAGEdge[] };
  return data;
}

export interface LightRAGDocStatus {
  document_id: string;
  file_path: string;
  status: string;
  content_hash?: string;
  chunks_count?: number;
  error_msg?: string;
}

export interface LightRAGIndexStatus {
  counts: Record<string, number>;
  documents: LightRAGDocStatus[];
}

export async function getLightRAGIndexStatus(workspaceId: string): Promise<LightRAGIndexStatus> {
  const res = await fetch(`${aiUrl}/index-status/${encodeURIComponent(workspaceId)}`, {
    headers: aiHeaders(),
  });
  if (!res.ok) {
    throw new Error(`LightRAG index-status failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as LightRAGIndexStatus;
  return data;
}

export async function checkAiHealth(): Promise<{ status: string }> {
  const res = await fetch(`${aiUrl}/health`, { headers: aiHeaders() });
  if (!res.ok) {
    throw new Error(`AI health check failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { status: string };
}

export async function checkAiReady(): Promise<{ status: string }> {
  const res = await fetch(`${aiUrl}/ready`, { headers: aiHeaders() });
  if (!res.ok) {
    throw new Error(`AI ready check failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { status: string };
}

