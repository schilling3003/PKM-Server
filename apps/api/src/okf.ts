import { parseCanonical, serializeCanonical, wikiToStandard, standardToWiki } from '@pkm/markdown';
import { isReservedFilename, OKF_VERSION } from '@pkm/okf';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as documents from './documents.js';
import * as workspaces from './workspaces.js';

const importConceptSchema = z.object({
  id: z.string().optional(),
  path: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  document: z
    .object({
      frontmatter: z.record(z.unknown()).optional(),
      body: z.string().default(''),
    })
    .optional(),
});

const reservedEntrySchema = z.object({
  path: z.string().min(1),
  content: z.string().default(''),
});

const importBundleSchema = z.object({
  version: z.string().optional(),
  okfVersion: z.string().optional(),
  workspace: z.string().optional(),
  id: z.string().optional(),
  timestamp: z.string().optional(),
  concepts: z.array(importConceptSchema).default([]),
  indices: z.array(z.union([reservedEntrySchema, z.unknown()])).default([]),
  logs: z.array(z.union([reservedEntrySchema, z.unknown()])).default([]),
});

export interface ImportResult {
  imported: number;
  concepts: documents.DocumentRow[];
}

function isReservedEntry(value: unknown): value is { path: string; content: string } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.path === 'string' && typeof v.content === 'string';
}

export async function importOkf(workspaceId: string, payload: unknown): Promise<ImportResult> {
  const bundle = importBundleSchema.parse(payload);
  const results: documents.DocumentRow[] = [];

  for (const concept of bundle.concepts) {
    const path = concept.path;

    if (isReservedFilename(path)) {
      throw new Error(`Reserved filename cannot be used for a concept: ${path}`);
    }

    const frontmatter = concept.metadata;
    if (typeof frontmatter.type !== 'string' || frontmatter.type.trim() === '') {
      throw new Error(`Missing or empty required "type" field for ${path}`);
    }

    const body = wikiToStandard(concept.document?.body ?? '');
    const content = serializeCanonical({ frontmatter, body });

    const existing = await documents.getDocumentByPath(workspaceId, path);
    if (existing) {
      const updated = await documents.updateDocument(workspaceId, existing.id, { content });
      results.push(updated);
    } else {
      const created = await documents.createDocument(workspaceId, path, content);
      results.push(created);
    }
  }

  // Reserved filenames are stored as documents but exported/imported as bundle-level
  // indices/logs so a workspace can round-trip without semantic loss.
  for (const item of [...bundle.indices, ...bundle.logs]) {
    if (!isReservedEntry(item)) continue;
    const existing = await documents.getDocumentByPath(workspaceId, item.path);
    if (existing) {
      const updated = await documents.updateDocument(workspaceId, existing.id, { content: item.content }, { allowReserved: true });
      results.push(updated);
    } else {
      const created = await documents.createDocument(workspaceId, item.path, item.content, { allowReserved: true });
      results.push(created);
    }
  }

  return { imported: results.length, concepts: results };
}

export interface ReservedExportEntry {
  path: string;
  content: string;
}

export interface ExportConcept {
  id: string;
  path: string;
  metadata: Record<string, unknown>;
  document: {
    frontmatter: Record<string, unknown>;
    body: string;
  };
}

export interface ExportBundle {
  version: string;
  okfVersion: string;
  workspace: string;
  id: string;
  timestamp: string;
  concepts: ExportConcept[];
  indices: ReservedExportEntry[];
  logs: ReservedExportEntry[];
}

export async function exportOkf(workspaceId: string): Promise<ExportBundle> {
  const ws = await workspaces.getWorkspace(workspaceId);
  const wsName = ws?.name ?? workspaceId;
  const docs = await documents.getWorkspaceDocuments(workspaceId);

  const concepts: ExportConcept[] = [];
  const indices: ReservedExportEntry[] = [];
  const logs: ReservedExportEntry[] = [];

  for (const doc of docs) {
    if (isReservedFilename(doc.path)) {
      if (doc.path.endsWith('index.md')) {
        indices.push({ path: doc.path, content: doc.content });
      } else if (doc.path.endsWith('log.md')) {
        logs.push({ path: doc.path, content: doc.content });
      }
      continue;
    }

    const parsed = parseCanonical(doc.content);
    const body = standardToWiki(parsed.body);
    concepts.push({
      id: doc.path.replace(/\.md$/, ''),
      path: doc.path,
      metadata: parsed.frontmatter,
      document: {
        frontmatter: parsed.frontmatter,
        body,
      },
    });
  }

  return {
    version: OKF_VERSION,
    okfVersion: OKF_VERSION,
    workspace: wsName,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    concepts,
    indices,
    logs,
  };
}
