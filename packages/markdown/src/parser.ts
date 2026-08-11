import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface CanonicalDocument {
  raw: string;
  frontmatterRaw: string | null;
  frontmatter: Record<string, unknown>;
  body: string;
  hash: string;
}

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/;

// Defensive limits to prevent DoS from YAML bombs or huge notes.
export const MAX_DOCUMENT_BYTES = 1 * 1024 * 1024; // 1 MiB
export const MAX_FRONTMATTER_BYTES = 64 * 1024; // 64 KiB
export const MAX_YAML_ALIAS_COUNT = 100;

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function computeHash(text: string): string {
  return createHash('sha256').update(normalizeLineEndings(text)).digest('hex');
}

export function parseCanonical(content: string): CanonicalDocument {
  const normalized = normalizeLineEndings(content);
  if (Buffer.byteLength(normalized, 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new DocumentValidationError(`Document exceeds maximum size of ${MAX_DOCUMENT_BYTES} bytes`);
  }

  const match = normalized.match(FRONTMATTER_RE);

  let frontmatterRaw: string | null = null;
  let frontmatter: Record<string, unknown> = {};
  let body: string;

  if (match) {
    frontmatterRaw = match[1];
    body = normalized.slice(match[0].length);
    if (frontmatterRaw.trim()) {
      if (Buffer.byteLength(frontmatterRaw, 'utf8') > MAX_FRONTMATTER_BYTES) {
        throw new DocumentValidationError(`Frontmatter exceeds maximum size of ${MAX_FRONTMATTER_BYTES} bytes`);
      }
      let parsed: unknown;
      try {
        parsed = parseYaml(frontmatterRaw, {
          strict: false,
          uniqueKeys: true,
          maxAliasCount: MAX_YAML_ALIAS_COUNT,
        });
      } catch (err) {
        throw new DocumentValidationError(err instanceof Error ? err.message : 'Invalid frontmatter YAML');
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        frontmatter = parsed as Record<string, unknown>;
      } else if (parsed !== null) {
        throw new DocumentValidationError('Frontmatter must be a YAML mapping object');
      }
    }
  } else {
    body = normalized;
  }

  return {
    raw: normalized,
    frontmatterRaw,
    frontmatter,
    body,
    hash: computeHash(normalized),
  };
}

export function serializeCanonical(args: {
  frontmatter: Record<string, unknown>;
  body: string;
  frontmatterRaw?: string | null;
}): string {
  const frontmatter = Object.keys(args.frontmatter).length
    ? `---\n${stringifyYaml(args.frontmatter, { sortMapEntries: false }).trimEnd()}\n---\n`
    : '---\n---\n';

  const body = args.body.startsWith('\n') ? args.body : `\n${args.body}`;
  return `${frontmatter}${body}`;
}

export function hashContent(content: string): string {
  return computeHash(content);
}
