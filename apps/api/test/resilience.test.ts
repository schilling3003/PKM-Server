import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'pg';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import * as documents from '../src/documents.js';
import * as workspaces from '../src/workspaces.js';
import * as search from '../src/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const shouldRun = !!process.env.RUN_RESILIENCE_TESTS;

// Shared helpers used when tests run.
function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCompose() {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', ['compose', '-f', path.join(repoRoot, 'docker-compose.yml'), 'up', '-d', '--wait'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    let stderr = '';
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('exit', (code) => {
      if (code === 0 || code === null) return resolve();
      reject(new Error(`docker compose up failed: ${stderr || `exit ${code}`}`));
    });
    proc.on('error', (err) => reject(err));
  });
}

async function runDocker(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', ['compose', '-f', path.join(repoRoot, 'docker-compose.yml'), ...args], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    let stderr = '';
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('exit', (code) => {
      if (code === 0 || code === null) return resolve();
      reject(new Error(`docker compose ${args.join(' ')} failed: ${stderr || `exit ${code}`}`));
    });
    proc.on('error', (err) => reject(err));
  });
}

async function ensureTestDb() {
  const baseDatabaseUrl = process.env.DATABASE_URL || 'postgresql://pkm:pkm@localhost:5432/pkm';
  const adminUrl = new URL(baseDatabaseUrl);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['pkm_test']);
    if (exists.rowCount === 0) {
      await client.query('CREATE DATABASE pkm_test');
    }
  } finally {
    await client.end();
  }
  const testUrl = new URL(baseDatabaseUrl);
  testUrl.pathname = '/pkm_test';
  process.env.DATABASE_URL = testUrl.toString();
  await migrate(pool);
}

describe.skipIf(!shouldRun)('resilience', () => {
  beforeAll(async () => {
    await ensureCompose();
    await ensureTestDb();
  });

  describe('failed AI indexing exposes failed status', () => {
    let workspaceId: string;
    let originalFetch: typeof fetch;
    let aiHealthy = true;
    const indexedDocs = new Map<string, { status: string; chunks_count: number }>();

    function makeResponse(body: unknown, status = 200) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }

    beforeEach(async () => {
      const ws = await workspaces.createWorkspace(`ai-fail-${Date.now()}`);
      workspaceId = ws.id;
      indexedDocs.clear();
      originalFetch = globalThis.fetch;
      aiHealthy = true;
      vi.stubGlobal('fetch', vi.fn(async (url: string | Request | URL, init?: RequestInit) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('/embed')) {
          if (!aiHealthy) throw new Error('AI service unavailable');
          return makeResponse({ embedding: Array(384).fill(0.1) });
        }
        if (u.includes('/ask')) return makeResponse({ answer: 'mock' });
        if (u.includes('/health')) return makeResponse({ status: aiHealthy ? 'ok' : 'degraded' });
        if (u.endsWith('/index') && (init?.method ?? 'POST') === 'POST') {
          if (!aiHealthy) throw new Error('AI service unavailable');
          const body = init?.body ? JSON.parse(init.body.toString()) : {};
          indexedDocs.set(body.document_id, { status: 'processed', chunks_count: 1 });
          return makeResponse({ workspace_id: body.workspace_id, document_id: body.document_id, status: 'ok' });
        }
        if (u.includes('/index-status/')) {
          if (!aiHealthy) throw new Error('AI service unavailable');
          return makeResponse({
            counts: { processed: indexedDocs.size },
            documents: Array.from(indexedDocs.entries()).map(([id, meta]) => ({
              document_id: id,
              file_path: 'mock.md',
              ...meta,
            })),
          });
        }
        if (u.includes('/query') || u.includes('/graph/')) {
          return makeResponse({ chunks: [], references: [], nodes: [], edges: [] });
        }
        return originalFetch(url as string, init);
      }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('reports failed index after AI embedding stops returning vectors and recovers after AI comes back', async () => {
      const doc = await documents.createDocument(
        workspaceId,
        'ai-test.md',
        '---\ntype: Note\n---\n\nThis is a test note about apples and bananas.\n'
      );

      const status1 = await documents.getDocumentIndexStatus(workspaceId, doc.id);
      expect(status1).not.toBeNull();
      expect(status1!.failed).toBe(false);
      expect(status1!.stale).toBe(false);
      expect(status1!.chunk_count).toBeGreaterThan(0);
      expect(status1!.embedded_chunk_count).toBe(status1!.chunk_count);

      aiHealthy = false;
      const updated = await documents.updateDocument(workspaceId, doc.id, {
        content: '---\ntype: Note\n---\n\nThis is updated content without AI embeddings.\n',
      });
      expect(updated).toBeDefined();

      const status2 = await documents.getDocumentIndexStatus(workspaceId, doc.id);
      expect(status2!.failed).toBe(true);
      expect(status2!.stale).toBe(false);
      expect(status2!.embedded_chunk_count).toBe(0);

      aiHealthy = true;
      await documents.updateDocument(workspaceId, doc.id, {
        content: '---\ntype: Note\n---\n\nThis is recovered content with AI embeddings back.\n',
      });

      const status3 = await documents.getDocumentIndexStatus(workspaceId, doc.id);
      expect(status3!.failed).toBe(false);
      expect(status3!.stale).toBe(false);
      expect(status3!.embedded_chunk_count).toBe(status3!.chunk_count);
    });
  });

  describe('bulk workspace isolation', () => {
    it('creates 100+ notes per workspace and returns only correct workspace results', async () => {
      const wsA = await workspaces.createWorkspace('bulk-alpha');
      const wsB = await workspaces.createWorkspace('bulk-beta');

      const count = 110;
      for (let i = 0; i < count; i++) {
        await documents.createDocument(
          wsA.id,
          `alpha-${i}.md`,
          `---\ntype: Note\n---\n\nalpha keyword document number ${i} with some filler words.\n`
        );
        await documents.createDocument(
          wsB.id,
          `beta-${i}.md`,
          `---\ntype: Note\n---\n\nbeta keyword document number ${i} with some filler words.\n`
        );
      }

      const alphaResults = await search.fullTextSearch(wsA.id, 'alpha', count + 10);
      expect(alphaResults.length).toBe(count);
      for (const row of alphaResults) {
        expect(row.path.startsWith('alpha-')).toBe(true);
      }

      const betaResults = await search.fullTextSearch(wsB.id, 'beta', count + 10);
      expect(betaResults.length).toBe(count);
      for (const row of betaResults) {
        expect(row.path.startsWith('beta-')).toBe(true);
      }

      // Cross-workspace query should not leak.
      const alphaInBeta = await search.fullTextSearch(wsB.id, 'alpha', count + 10);
      expect(alphaInBeta.length).toBe(0);

      const betaInAlpha = await search.fullTextSearch(wsA.id, 'beta', count + 10);
      expect(betaInAlpha.length).toBe(0);
    }, 120_000);
  });

  describe('container restart recovery', () => {
    let api: ChildProcess | null = null;
    let aiServer: http.Server | null = null;
    let aiPort = 0;
    let aiHealthy = true;

    function startAiServer(): Promise<number> {
      return new Promise((resolve, reject) => {
        aiHealthy = true;
        const server = http.createServer((req, res) => {
          res.setHeader('Content-Type', 'application/json');
          if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(aiHealthy ? 200 : 503);
            res.end(JSON.stringify({ status: aiHealthy ? 'ok' : 'degraded' }));
            return;
          }
          if (req.url === '/embed' && req.method === 'POST') {
            res.writeHead(aiHealthy ? 200 : 503);
            res.end(JSON.stringify({ embedding: aiHealthy ? Array(384).fill(0.1) : null }));
            return;
          }
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'not found' }));
        });
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          aiPort = typeof addr === 'object' && addr ? addr.port : 0;
          aiServer = server;
          resolve(aiPort);
        });
      });
    }

    async function stopAiServer() {
      if (!aiServer) return;
      await new Promise<void>((resolve) => aiServer!.close(() => resolve()));
      aiServer = null;
    }

    async function waitForApi(target: 'ok' | 'degraded', timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      let last: string | null = null;
      while (Date.now() < deadline) {
        try {
          const res = await fetch('http://localhost:4000/health');
          const body = await res.json() as { status: string };
          last = body.status;
          if (body.status === target) return;
        } catch {
          last = 'unreachable';
        }
        await wait(500);
      }
      throw new Error(`Timed out waiting for API health=${target}; last=${last}`);
    }

    beforeAll(async () => {
      const port = await startAiServer();

      api = spawn('pnpm', ['exec', 'tsx', 'src/index.ts'], {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          API_PORT: '4000',
          AI_SERVICE_URL: `http://127.0.0.1:${port}`,
          S3_ENDPOINT: 'http://localhost:9000',
          S3_ACCESS_KEY: 'minioadmin',
          S3_SECRET_KEY: 'minioadmin',
          S3_BUCKET: 'pkm',
        },
        stdio: 'pipe',
      });

      api.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.warn(`API child process exited with ${code}`);
        }
      });

      await waitForApi('ok', 30_000);
    }, 60_000);

    afterAll(async () => {
      if (api && !api.killed) {
        api.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          if (!api) return resolve();
          api.on('exit', () => resolve());
        });
      }
      await stopAiServer();
    }, 30_000);

    async function restartService(name: string) {
      await runDocker(['stop', name]);
      await waitForApi('degraded', 15_000);
      await runDocker(['start', name]);
      await waitForApi('ok', 30_000);
    }

    it('reports degraded health when Postgres is stopped and recovers when restarted', async () => {
      await restartService('postgres');
    }, 60_000);

    it('reports degraded health when Redis is stopped and recovers when restarted', async () => {
      await restartService('redis');
    }, 60_000);

    it('reports degraded health when MinIO is stopped and recovers when restarted', async () => {
      await restartService('minio');
    }, 60_000);

    it('reports degraded health when AI is unavailable and recovers when it returns', async () => {
      aiHealthy = false;
      await waitForApi('degraded', 15_000);
      aiHealthy = true;
      await waitForApi('ok', 15_000);
    }, 45_000);
  });
});
