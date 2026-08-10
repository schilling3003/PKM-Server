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
} from '../src/index.js';

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
    expect(standard).toContain('[ideas](Project Ideas.md)');
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
