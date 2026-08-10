import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { Link } from 'mdast';

export interface WikiLink {
  target: string;
  alias: string | null;
  start: number;
  end: number;
  raw: string;
}

export interface StandardLink {
  url: string;
  title: string | null;
  text: string;
  start: number;
  end: number;
}

const WIKILINK_RE = /\[\[([^\|\]\n]+?)(?:\|([^\|\]\n]+?))?\]\]/g;
const TAG_RE = /(?<=\s|^)(#[\w/-]+)/gm;
const HEADING_RE = /^(#{1,6})\s+(.+)$/gm;

export function extractWikiLinks(body: string): WikiLink[] {
  const results: WikiLink[] = [];
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(body)) !== null) {
    results.push({
      target: match[1].trim(),
      alias: match[2] ? match[2].trim() : null,
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
    });
  }
  return results;
}

export function extractStandardLinks(body: string): StandardLink[] {
  const tree = unified().use(remarkParse).parse(body);
  const results: StandardLink[] = [];
  visit(tree, 'link', (node: Link, index, parent) => {
    const position = node.position;
    if (!position || index === undefined || !parent) return;
    let text = '';
    visit(node, 'text', (n) => {
      text += n.value;
    });
    results.push({
      url: node.url,
      title: node.title ?? null,
      text,
      start: position.start.offset ?? 0,
      end: position.end.offset ?? 0,
    });
  });
  return results;
}

export function extractTags(body: string): string[] {
  const matches = body.match(TAG_RE) ?? [];
  const tags = new Set<string>();
  for (const m of matches) {
    tags.add(m.slice(1));
  }
  return Array.from(tags);
}

export interface Heading {
  level: number;
  title: string;
  start: number;
  end: number;
}

export function extractOutline(body: string): Heading[] {
  const results: Heading[] = [];
  let match: RegExpExecArray | null;
  while ((match = HEADING_RE.exec(body)) !== null) {
    results.push({
      level: match[1].length,
      title: match[2].trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return results;
}

export function wikiToStandard(body: string): string {
  return body.replace(WIKILINK_RE, (_, target: string, alias?: string) => {
    const url = `${target.trim()}.md`;
    const text = alias ? alias.trim() : target.trim();
    return `[${text}](${url})`;
  });
}

export function standardToWiki(body: string): string {
  // Convert [text](target.md) back to [[target]] or [[target|text]].
  return body.replace(/\[([^\]]+)\]\(([^)]+)\.md\)/g, (_, text: string, target: string) => {
    const t = target.trim();
    const x = text.trim();
    return x === t ? `[[${t}]]` : `[[${t}|${x}]]`;
  });
}
