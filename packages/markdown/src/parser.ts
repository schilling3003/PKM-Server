import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface CanonicalDocument {
  raw: string;
  frontmatterRaw: string | null;
  frontmatter: Record<string, unknown>;
  body: string;
  hash: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/;

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function computeHash(text: string): string {
  return createHash('sha256').update(normalizeLineEndings(text)).digest('hex');
}

export function parseCanonical(content: string): CanonicalDocument {
  const normalized = normalizeLineEndings(content);
  const match = normalized.match(FRONTMATTER_RE);

  let frontmatterRaw: string | null = null;
  let frontmatter: Record<string, unknown> = {};
  let body: string;

  if (match) {
    frontmatterRaw = match[1];
    body = normalized.slice(match[0].length);
    if (frontmatterRaw.trim()) {
      const parsed = parseYaml(frontmatterRaw, {
        strict: false,
        maxAliasCount: 50,
      });
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        frontmatter = parsed as Record<string, unknown>;
      } else if (parsed !== null) {
        throw new Error('Frontmatter must be a YAML mapping object');
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
