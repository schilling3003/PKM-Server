import { describe, it, expect } from 'vitest';
import {
  parseCanonical,
  serializeCanonical,
  extractWikiLinks,
  extractStandardLinks,
  extractTags,
  extractOutline,
  wikiToStandard,
  standardToWiki,
  insertWikilink,
  MAX_DOCUMENT_BYTES,
  MAX_FRONTMATTER_BYTES,
  MAX_YAML_ALIAS_COUNT,
} from '../src/index.js';

describe('insertWikilink', () => {
  it('replaces [[query with a wikilink and removes the .md extension', () => {
    const value = 'See [[roa';
    const cursor = value.length;
    const result = insertWikilink(value, cursor, 'roa', 'roadmap.md');
    expect(result.value).toBe('See [[roadmap|roa]]');
    expect(result.cursor).toBe('See [[roadmap|roa]]'.length);
  });

  it('inserts a wikilink without an alias when the query is empty', () => {
    const value = 'See [[';
    const cursor = value.length;
    const result = insertWikilink(value, cursor, '', 'roadmap.md');
    expect(result.value).toBe('See [[roadmap]]');
    expect(result.cursor).toBe('See [[roadmap]]'.length);
  });
});

describe('parseCanonical', () => {
  it('parses frontmatter and body', () => {
    const text = '---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body\n';
    const doc = parseCanonical(text);
    expect(doc.frontmatter.title).toBe('Hello');
    expect(doc.frontmatter.tags).toEqual(['a', 'b']);
    expect(doc.body).toContain('# Body');
    expect(doc.hash).toHaveLength(64);
  });

  it('preserves unknown frontmatter keys', () => {
    const text = '---\nfoo: bar\ntype: Concept\n---\n\nbody\n';
    const doc = parseCanonical(text);
    expect(doc.frontmatter.foo).toBe('bar');
    expect(doc.frontmatter.type).toBe('Concept');
  });

  it('handles content without frontmatter', () => {
    const text = '# Only body\n';
    const doc = parseCanonical(text);
    expect(doc.frontmatter).toEqual({});
    expect(doc.body).toBe('# Only body\n');
  });

  it('round-trips deterministic hashes for normalized content', () => {
    const text = '---\na: 1\n---\r\nbody\r\n';
    const d1 = parseCanonical(text);
    const d2 = parseCanonical(text.replace(/\r\n/g, '\n'));
    expect(d1.hash).toBe(d2.hash);
  });

  it('rejects documents exceeding the byte size limit', () => {
    const body = 'x'.repeat(MAX_DOCUMENT_BYTES + 1);
    expect(() => parseCanonical(body)).toThrow(/maximum size/);
  });

  it('rejects frontmatter exceeding the byte size limit', () => {
    const huge = 'a'.repeat(MAX_FRONTMATTER_BYTES + 100);
    const text = `---\nkey: ${huge}\n---\nbody\n`;
    expect(() => parseCanonical(text)).toThrow(/Frontmatter exceeds/);
  });

  it('rejects YAML alias bombs', () => {
    const width = 50;
    const text = `---\na: &a [${Array(width).fill('x').join(',')}]\nb: &b [${Array(width).fill('*a').join(',')}]\nc: &c [${Array(width).fill('*b').join(',')}]\n---\nbody\n`;
    expect(() => parseCanonical(text)).toThrow();
  });

  it('preserves the configured maximum alias count for legitimate content', () => {
    const aliases = Array.from({ length: MAX_YAML_ALIAS_COUNT }, (_, i) => `v${i}: &v${i} value`).join('\n');
    const refs = Array.from({ length: MAX_YAML_ALIAS_COUNT }, (_, i) => `r${i}: *v${i}`).join('\n');
    const text = `---\n${aliases}\n${refs}\n---\nbody\n`;
    const doc = parseCanonical(text);
    for (let i = 0; i < MAX_YAML_ALIAS_COUNT; i++) {
      expect(doc.frontmatter[`r${i}`]).toBe('value');
    }
  });
});

describe('serializeCanonical', () => {
  it('produces a frontmatter block', () => {
    const text = serializeCanonical({ frontmatter: { title: 'T' }, body: 'B' });
    expect(text).toMatch(/^---\ntitle: T\n---\n\nB$/);
  });

  it('round-trips unknown fields', () => {
    const doc = parseCanonical('---\nfoo: bar\n---\n\nbody\n');
    const serialized = serializeCanonical(doc);
    const reparsed = parseCanonical(serialized);
    expect(reparsed.frontmatter.foo).toBe('bar');
  });
});

describe('extractWikiLinks', () => {
  it('extracts wikilinks and aliases', () => {
    const body = 'See [[Another Note|alias]] and [[Third]]';
    const links = extractWikiLinks(body);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ target: 'Another Note', alias: 'alias' });
    expect(links[1]).toMatchObject({ target: 'Third', alias: null });
  });
});

describe('wikiToStandard / standardToWiki', () => {
  it('converts wikilinks to markdown and back', () => {
    const body = 'Read [[Project Ideas|ideas]] then [[Goals]]';
    const standard = wikiToStandard(body);
    expect(standard).toContain('[ideas](Project%20Ideas.md)');
    expect(standard).toContain('[Goals](Goals.md)');
    const restored = standardToWiki(standard);
    expect(restored).toContain('[[Project Ideas|ideas]]');
    expect(restored).toContain('[[Goals]]');
  });
});

describe('extractTags', () => {
  it('extracts hashtags', () => {
    const body = '# Title\n\nThis is #important and #status/done.';
    expect(extractTags(body)).toEqual(['important', 'status/done']);
  });
});

describe('extractOutline', () => {
  it('returns headings', () => {
    const body = '# A\n## B\n### C\n';
    const outline = extractOutline(body);
    expect(outline).toHaveLength(3);
    expect(outline.map((h) => h.title)).toEqual(['A', 'B', 'C']);
  });
});
