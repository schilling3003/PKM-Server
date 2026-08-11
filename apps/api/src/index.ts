import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createClient } from 'redis';
import { z } from 'zod';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import * as workspaces from './workspaces.js';
import * as documents from './documents.js';
import * as search from './search.js';
import { askWorkspace } from './ask.js';

const port = Number(process.env.API_PORT || 4000);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/0';
const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';

const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.WEB_URL || 'http://localhost:3000' });

const redisClient = createClient({ url: redisUrl });
redisClient.on('error', (err) => app.log.warn({ msg: 'redis client error', error: err.message }));

async function checkPostgres() {
  const start = performance.now();
  await pool.query('SELECT 1');
  return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
}

async function checkRedis() {
  const start = performance.now();
  await redisClient.ping();
  return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
}

async function checkAi() {
  const start = performance.now();
  try {
    const res = await fetch(`${aiUrl}/health`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    app.log.warn({ msg: 'ai health check failed', error: String(err) });
    return { status: 'error' as const, latencyMs: Math.round(performance.now() - start), message: 'unavailable' };
  }
}

app.get('/health', async () => {
  const services: Record<string, { status: 'ok' | 'error'; latencyMs: number; message?: string }> = {};
  try { services.postgres = await checkPostgres(); } catch (err) { app.log.warn({ msg: 'postgres health check failed', error: String(err) }); services.postgres = { status: 'error', latencyMs: 0, message: 'unavailable' }; }
  try { services.redis = await checkRedis(); } catch (err) { app.log.warn({ msg: 'redis health check failed', error: String(err) }); services.redis = { status: 'error', latencyMs: 0, message: 'unavailable' }; }
  services.ai = await checkAi();

  const degraded = Object.values(services).some((s) => s.status !== 'ok');
  return {
    status: degraded ? 'degraded' : 'ok',
    services,
    version: '0.1.0',
  };
});

// Workspaces
app.post('/workspaces', async (req, reply) => {
  const schema = z.object({ name: z.string().min(1) });
  const body = schema.parse(req.body);
  const ws = await workspaces.createWorkspace(body.name);
  reply.status(201).send(ws);
});

app.get('/workspaces', async () => {
  return workspaces.listWorkspaces();
});

app.get('/workspaces/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const ws = await workspaces.getWorkspace(id);
  if (!ws) return reply.status(404).send({ error: 'Workspace not found' });
  return ws;
});

// Documents
app.get('/workspaces/:workspaceId/documents', async (req) => {
  const { workspaceId } = req.params as { workspaceId: string };
  return documents.getWorkspaceDocuments(workspaceId);
});

app.post('/workspaces/:workspaceId/documents', async (req, reply) => {
  const { workspaceId } = req.params as { workspaceId: string };
  const schema = z.object({
    path: z.string().min(1),
    content: z.string(),
  });
  const body = schema.parse(req.body);
  const doc = await documents.createDocument(workspaceId, body.path, body.content);
  reply.status(201).send(doc);
});

app.get('/workspaces/:workspaceId/documents/:id', async (req, reply) => {
  const { workspaceId, id } = req.params as { workspaceId: string; id: string };
  const doc = await documents.getDocument(workspaceId, id);
  if (!doc) return reply.status(404).send({ error: 'Document not found' });
  return doc;
});

app.put('/workspaces/:workspaceId/documents/:id', async (req, reply) => {
  const { workspaceId, id } = req.params as { workspaceId: string; id: string };
  const schema = z.object({
    path: z.string().min(1).optional(),
    content: z.string().optional(),
  }).refine((v) => v.path || v.content, { message: 'At least one of path or content is required' });
  const body = schema.parse(req.body);
  const doc = await documents.updateDocument(workspaceId, id, body);
  return doc;
});

app.delete('/workspaces/:workspaceId/documents/:id', async (req, reply) => {
  const { workspaceId, id } = req.params as { workspaceId: string; id: string };
  await documents.deleteDocument(workspaceId, id);
  reply.status(204).send();
});

app.get('/workspaces/:workspaceId/documents/:id/revisions', async (req) => {
  const { workspaceId, id } = req.params as { workspaceId: string; id: string };
  return documents.listRevisions(workspaceId, id);
});

app.get('/workspaces/:workspaceId/documents/:id/backlinks', async (req) => {
  const { workspaceId, id } = req.params as { workspaceId: string; id: string };
  return documents.getBacklinks(workspaceId, id);
});

app.get('/workspaces/:workspaceId/documents/:id/links', async (req) => {
  const { workspaceId, id } = req.params as { workspaceId: string; id: string };
  return documents.getOutgoingLinks(workspaceId, id);
});

app.get('/workspaces/:workspaceId/search', async (req, reply) => {
  const { workspaceId } = req.params as { workspaceId: string };
  const { q, limit = '20' } = req.query as { q?: string; limit?: string };
  if (!q) return reply.status(400).send({ error: 'Query parameter q is required' });
  return search.hybridSearch(workspaceId, q, Number(limit));
});

app.post('/workspaces/:workspaceId/ask', async (req, reply) => {
  const { workspaceId } = req.params as { workspaceId: string };
  const schema = z.object({ question: z.string().min(1) });
  const body = schema.parse(req.body);
  const result = await askWorkspace(workspaceId, body.question);
  return result;
});

app.setErrorHandler((err, req, reply) => {
  app.log.error(err);
  if (err instanceof z.ZodError) {
    return reply.status(400).send({ error: 'Validation error', details: err.errors });
  }
  reply.status(500).send({ error: 'Internal server error' });
});

async function main() {
  await redisClient.connect();
  await migrate(pool);
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
