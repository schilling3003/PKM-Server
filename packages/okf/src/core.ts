import {
  parseCanonical,
  serializeCanonical,
  wikiToStandard,
  standardToWiki,
  type CanonicalDocument,
} from '@pkm/markdown';
import type {
  OkfActor,
  OkfBundle,
  OkfConcept,
  OkfIndex,
  OkfLog,
  OkfMetadata,
  OkfValidationError as OkfValidationErrorType,
  TrustTier,
} from './types.js';
import { OkfValidationError } from './types.js';

export const OKF_VERSION = '0.2';

export function isReservedFilename(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  return base === 'index.md' || base === 'log.md';
}

export function normalizeVerified(
  verified: OkfActor | OkfActor[] | undefined
): OkfActor[] | undefined {
  if (verified === undefined) return undefined;
  if (Array.isArray(verified)) return verified;
  return [verified];
}

export function trustTier(metadata: OkfMetadata): TrustTier {
  const verified = normalizeVerified(metadata.verified);
  if (!verified || verified.length === 0) return 'unverified';
  if (verified.some((v) => v.by.startsWith('human:'))) return 'human-reviewed';
  return 'machine-confirmed';
}

export function isStale(metadata: OkfMetadata, today = new Date()): boolean {
  if (!metadata.stale_after) return false;
  const stale = new Date(metadata.stale_after);
  if (isNaN(stale.getTime())) return false;
  return today >= stale;
}

export function validateConcept(
  document: CanonicalDocument,
  path: string
): asserts document is CanonicalDocument & { frontmatter: OkfMetadata } {
  if (isReservedFilename(path)) {
    throw new OkfValidationError(path, 'reserved filename cannot be used for a concept');
  }
  const type = document.frontmatter.type;
  if (typeof type !== 'string' || type.trim() === '') {
    throw new OkfValidationError(path, 'missing or empty required "type" field');
  }
}

export interface BundleFile {
  path: string;
  content: string;
}

export interface ImportOptions {
  restoreWikilinks?: boolean;
}

function parseIndex(path: string, content: string): OkfIndex {
  const doc = parseCanonical(content);
  const sections: OkfIndex['sections'] = [];
  const lines = doc.body.split('\n');
  let current: OkfIndex['sections'][number] | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#+\s+(.+)$/);
    if (headingMatch) {
      current = { heading: headingMatch[1].trim(), entries: [] };
      sections.push(current);
      continue;
    }
    const entryMatch = line.match(/^\*\s+\[([^\]]+)\]\(([^\)]+)\)\s*(?:-\s*(.+))?$/);
    if (entryMatch && current) {
      current.entries.push({
        title: entryMatch[1],
        url: entryMatch[2],
        description: entryMatch[3] ? entryMatch[3].trim() : undefined,
      });
    }
  }

  return {
    path,
    okfVersion: doc.frontmatter.okf_version as string | undefined,
    sections,
  };
}

function parseLog(path: string, content: string): OkfLog {
  const doc = parseCanonical(content);
  const entries: OkfLog['entries'] = [];
  const lines = doc.body.split('\n');
  let current: OkfLog['entries'][number] | null = null;

  for (const line of lines) {
    const dateMatch = line.match(/^##\s+(\d{4}-\d{2}-\d{2})$/);
    if (dateMatch) {
      current = { date: dateMatch[1], items: [] };
      entries.push(current);
      continue;
    }
    if (current && line.trim().startsWith('*')) {
      current.items.push(line.replace(/^\*\s+/, '').trim());
    }
  }

  return { path, entries };
}

export function importBundle(files: BundleFile[], options: ImportOptions = {}): OkfBundle {
  const bundle: OkfBundle = { okfVersion: OKF_VERSION, concepts: [], indices: [], logs: [] };

  for (const file of files) {
    const document = parseCanonical(
      options.restoreWikilinks ? standardToWiki(file.content) : file.content
    );

    if (file.path.endsWith('index.md')) {
      bundle.indices.push(parseIndex(file.path, file.content));
      continue;
    }

    if (file.path.endsWith('log.md')) {
      bundle.logs.push(parseLog(file.path, file.content));
      continue;
    }

    validateConcept(document, file.path);

    const metadata = document.frontmatter as OkfMetadata;
    if (metadata.verified) {
      metadata.verified = normalizeVerified(metadata.verified);
    }

    bundle.concepts.push({
      id: file.path.replace(/\.md$/, ''),
      path: file.path,
      metadata,
      document,
    });
  }

  return bundle;
}

export interface ExportOptions {
  convertWikilinks?: boolean;
}

export function exportBundle(bundle: OkfBundle, options: ExportOptions = {}): BundleFile[] {
  const files: BundleFile[] = [];

  for (const concept of bundle.concepts) {
    let body = concept.document.body;
    if (options.convertWikilinks) {
      body = wikiToStandard(body);
    }
    const content = serializeCanonical({ frontmatter: concept.metadata, body });
    files.push({ path: concept.path, content });
  }

  for (const index of bundle.indices) {
    const lines = [`# ${index.heading ?? 'Index'}`];
    for (const section of index.sections) {
      lines.push('', `## ${section.heading}`);
      for (const entry of section.entries) {
        const desc = entry.description ? ` - ${entry.description}` : '';
        lines.push(`* [${entry.title}](${entry.url})${desc}`);
      }
    }
    const frontmatter = index.okfVersion ? { okf_version: index.okfVersion } : {};
    files.push({
      path: index.path,
      content: serializeCanonical({ frontmatter, body: lines.join('\n') }),
    });
  }

  for (const log of bundle.logs) {
    const lines = ['# Directory Update Log'];
    for (const entry of log.entries) {
      lines.push('', `## ${entry.date}`);
      for (const item of entry.items) {
        lines.push(`* ${item}`);
      }
    }
    files.push({
      path: log.path,
      content: serializeCanonical({ frontmatter: {}, body: lines.join('\n') }),
    });
  }

  return files;
}

export { parseCanonical, serializeCanonical, wikiToStandard, standardToWiki };
export type { OkfValidationErrorType };
