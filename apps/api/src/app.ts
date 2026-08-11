import Fastify from 'fastify';
import cors from '@fastify/cors';
import { OkfValidationError } from '@pkm/okf';
import { DocumentValidationError } from '@pkm/markdown';
import { z } from 'zod';
import './middleware/auth.js';
import * as workspaces from './workspaces.js';
import * as documents from './documents.js';
import * as search from './search.js';
import { askWorkspace } from './ask.js';
import { importOkf, exportOkf } from './okf.js';

export async function buildApp(options: { logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  await app.register(cors, { origin: process.env.WEB_URL || 'http://localhost:3000' });

  // Workspaces
  app.post('/workspaces', async (req, reply) => {
    const schema = z.object({ name: z.string().min(1) });
    const body = schema.parse(req.body);
    if (!req.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    const ws = await workspaces.createWorkspace(body.name, req.user.id);
    reply.status(201).send(ws);
  });

  app.get('/workspaces', async (req) => {
    if (!req.user) {
      return [];
    }
    return workspaces.listUserWorkspaces(req.user.id);
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
    const limitNum = Number(limit);
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
      return reply.status(400).send({ error: 'Query parameter limit must be an integer between 1 and 100' });
    }
    return search.hybridSearch(workspaceId, q, limitNum);
  });

  app.post('/workspaces/:workspaceId/ask', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const schema = z.object({ question: z.string().min(1) });
    const body = schema.parse(req.body);
    const result = await askWorkspace(workspaceId, body.question);
    return result;
  });

  // OKF v0.2 import/export
  app.post('/workspaces/:workspaceId/okf/import', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const ws = await workspaces.getWorkspace(workspaceId);
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });
    try {
      const result = await importOkf(workspaceId, req.body);
      reply.status(200).send(result);
    } catch (err) {
      if (err instanceof z.ZodError) throw err;
      reply.status(400).send({ error: err instanceof Error ? err.message : 'Import failed' });
    }
  });

  app.get('/workspaces/:workspaceId/okf/export', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const ws = await workspaces.getWorkspace(workspaceId);
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });
    const result = await exportOkf(workspaceId);
    reply.send(result);
  });

  app.setErrorHandler((err, req, reply) => {
    app.log.error(err);
    if (err instanceof z.ZodError) {
      return reply.status(400).send({ error: 'Validation error', details: err.errors });
    }
    if (err instanceof OkfValidationError) {
      return reply.status(400).send({ error: err.message });
    }
    if (err instanceof DocumentValidationError) {
      return reply.status(400).send({ error: err.message });
    }
    reply.status(500).send({ error: 'Internal server error' });
  });

  return app;
}
