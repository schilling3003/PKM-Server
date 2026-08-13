import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the repository root .env so tests use the same configuration as the
// package scripts regardless of the package working directory.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const baseDatabaseUrl = process.env.DATABASE_URL || 'postgresql://pkm:pkm@localhost:5432/pkm';

function databaseUrlWithName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL || databaseUrlWithName(baseDatabaseUrl, 'pkm_test');

// Create the isolated test database if it does not exist, then point all
// subsequent code at it. This prevents integration tests from truncating
// the developer's main database.
const adminUrl = databaseUrlWithName(testDatabaseUrl, 'postgres');
const adminClient = new Client({ connectionString: adminUrl });
await adminClient.connect();
try {
  const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', ['pkm_test']);
  if (exists.rowCount === 0) {
    await adminClient.query('CREATE DATABASE pkm_test');
  }
} finally {
  await adminClient.end();
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.TEST_DATABASE_URL = testDatabaseUrl;

// Lightweight in-memory mock of the LightRAG AI service. It keeps tests
// deterministic without requiring the real Python AI service, while still
// exercising the same HTTP contracts (index, delete, query, ask, graph,
// index-status) used by the API.
type MockDoc = {
  workspace_id: string;
  document_id: string;
  path: string;
  content: string;
  content_hash: string;
  chunks: string[];
};

const docs = new Map<string, MockDoc>();

function docKey(workspaceId: string, documentId: string): string {
  return `${workspaceId}:${documentId}`;
}

function chunkContent(content: string): string[] {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/, '');
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const p of paragraphs) {
    const sentences = p.split(/(?<=\.\s)/);
    for (const s of sentences) {
      const trimmed = s.trim();
      if (trimmed) chunks.push(trimmed);
    }
  }
  return chunks.length ? chunks : [body.trim() || content.trim()];
}

function matchDocs(workspaceId: string, query: string): MockDoc[] {
  const q = query.toLowerCase();
  return Array.from(docs.values()).filter(
    (d) => d.workspace_id === workspaceId && (d.content.toLowerCase().includes(q) || d.path.toLowerCase().includes(q))
  );
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');

    const url = new URL(req.url || '/', `http://localhost`);
    const method = req.method || 'GET';

    if (method === 'GET' && url.pathname === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (method === 'GET' && url.pathname === '/ready') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (method === 'GET' && url.pathname.startsWith('/graph/')) {
      res.writeHead(200);
      res.end(JSON.stringify({ nodes: [], edges: [] }));
      return;
    }

    if (method === 'GET' && url.pathname.startsWith('/index-status/')) {
      const workspaceId = decodeURIComponent(url.pathname.slice('/index-status/'.length));
      const workspaceDocs = Array.from(docs.values()).filter((d) => d.workspace_id === workspaceId);
      const counts: Record<string, number> = { processed: workspaceDocs.length };
      res.writeHead(200);
      res.end(
        JSON.stringify({
          counts,
          documents: workspaceDocs.map((d) => ({
            document_id: d.document_id,
            file_path: d.path,
            status: 'processed',
            content_hash: d.content_hash,
            chunks_count: d.chunks.length,
          })),
        })
      );
      return;
    }

    if (method === 'DELETE' && url.pathname.startsWith('/index/')) {
      const rest = url.pathname.slice('/index/'.length);
      const [workspaceId, documentId] = rest.split('/').map(decodeURIComponent);
      docs.delete(docKey(workspaceId, documentId));
      res.writeHead(204);
      res.end();
      return;
    }

    let payload: Record<string, unknown> = {};
    if (body) {
      try {
        payload = JSON.parse(body) as Record<string, unknown>;
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid json' }));
        return;
      }
    }

    if (method === 'POST' && url.pathname === '/index') {
      const workspaceId = String(payload.workspace_id || '');
      const documentId = String(payload.document_id || '');
      const path = String(payload.path || '');
      const content = String(payload.content || '');
      const contentHash = String(payload.content_hash || '');
      docs.set(docKey(workspaceId, documentId), {
        workspace_id: workspaceId,
        document_id: documentId,
        path,
        content,
        content_hash: contentHash,
        chunks: chunkContent(content),
      });
      res.writeHead(200);
      res.end(JSON.stringify({ workspace_id: workspaceId, document_id: documentId, status: 'ok' }));
      return;
    }

    if (method === 'POST' && url.pathname === '/query') {
      const workspaceId = String(payload.workspace_id || '');
      const query = String(payload.query || '');
      const matches = matchDocs(workspaceId, query);
      const chunks: Array<{
        content: string;
        file_path: string;
        chunk_id: string;
        reference_id: string;
      }> = [];
      const references: Array<{ reference_id: string; file_path: string }> = [];
      for (const d of matches) {
        for (let i = 0; i < d.chunks.length; i++) {
          const refId = `${d.document_id}-${i}`;
          chunks.push({
            content: d.chunks[i],
            file_path: d.path,
            chunk_id: `${d.document_id}--${i}`,
            reference_id: refId,
          });
          references.push({ reference_id: refId, file_path: d.path });
        }
      }
      res.writeHead(200);
      res.end(JSON.stringify({ chunks, references }));
      return;
    }

    if (method === 'POST' && url.pathname === '/ask') {
      const workspaceId = String(payload.workspace_id || '');
      const question = String(payload.question || '');
      const matches = matchDocs(workspaceId, question);
      if (matches.length === 0) {
        res.writeHead(200);
        res.end(JSON.stringify({ answer: 'No relevant notes were found.', citations: [], warning: 'No indexed chunks available.' }));
        return;
      }
      const d = matches[0];
      const snippet = d.chunks[0] || d.content.slice(0, 200);
      res.writeHead(200);
      res.end(
        JSON.stringify({
          answer: `Mock answer based on ${d.path}.`,
          citations: [{ id: d.document_id, path: d.path, snippet }],
          warning: undefined,
        })
      );
      return;
    }

    // Legacy /embed endpoint: no longer used by the API, but kept for any
    // older callers.
    if (method === 'POST' && url.pathname === '/embed') {
      res.writeHead(200);
      res.end(JSON.stringify({ embedding: null }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
process.env.AI_SERVICE_URL = `http://127.0.0.1:${port}`;
