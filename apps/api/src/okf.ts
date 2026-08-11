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

const importBundleSchema = z.object({
  version: z.string().optional(),
  workspace: z.string().optional(),
  id: z.string().optional(),
  timestamp: z.string().optional(),
  concepts: z.array(importConceptSchema).default([]),
  indices: z.array(z.unknown()).optional(),
  logs: z.array(z.unknown()).optional(),
});

export interface ImportResult {
  imported: number;
  concepts: documents.DocumentRow[];
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

  return { imported: results.length, concepts: results };
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
  workspace: string;
  id: string;
  timestamp: string;
  concepts: ExportConcept[];
  indices: unknown[];
  logs: unknown[];
}

export async function exportOkf(workspaceId: string): Promise<ExportBundle> {
  const ws = await workspaces.getWorkspace(workspaceId);
  const wsName = ws?.name ?? workspaceId;
  const docs = await documents.getWorkspaceDocuments(workspaceId);

  const concepts: ExportConcept[] = docs.map((doc) => {
    const parsed = parseCanonical(doc.content);
    const body = standardToWiki(parsed.body);
    return {
      id: doc.path.replace(/\.md$/, ''),
      path: doc.path,
      metadata: parsed.frontmatter,
      document: {
        frontmatter: parsed.frontmatter,
        body,
      },
    };
  });

  return {
    version: OKF_VERSION,
    workspace: wsName,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    concepts,
    indices: [],
    logs: [],
  };
}
