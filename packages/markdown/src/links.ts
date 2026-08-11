import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { Link, Text } from 'mdast';

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
    const url = encodeURI(`${target.trim()}.md`);
    const text = alias ? alias.trim() : target.trim();
    return `[${text}](${url})`;
  });
}

function tryDecodeUrl(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

export function standardToWiki(body: string): string {
  const tree = unified().use(remarkParse).parse(body);
  const replacements: { start: number; end: number; text: string }[] = [];

  visit(tree, 'link', (node: Link) => {
    if (!node.url.endsWith('.md') || node.title) return;

    const decoded = tryDecodeUrl(node.url);
    const target = decoded.slice(0, -'.md'.length).trim();
    let text = '';
    visit(node, 'text', (n: Text) => {
      text += n.value;
    });
    text = text.trim();

    const wiki = text === target ? `[[${target}]]` : `[[${target}|${text}]]`;
    if (node.position) {
      replacements.push({
        start: node.position.start.offset!,
        end: node.position.end.offset!,
        text: wiki,
      });
    }
  });

  replacements.sort((a, b) => a.start - b.start);
  let result = '';
  let last = 0;
  for (const r of replacements) {
    result += body.slice(last, r.start);
    result += r.text;
    last = r.end;
  }
  result += body.slice(last);
  return result;
}
