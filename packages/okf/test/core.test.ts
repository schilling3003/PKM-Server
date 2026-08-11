import { describe, it, expect } from 'vitest';
import {
  importBundle,
  exportBundle,
  validateConcept,
  isReservedFilename,
  trustTier,
  isStale,
  OKF_VERSION,
  parseCanonical,
  type OkfBundle,
  type OkfConcept,
} from '../src/index.js';

describe('OKF v0.2 core', () => {
  it('imports a valid concept bundle', () => {
    const files = [
      {
        path: 'concepts/customers.md',
        content: '---\ntype: BigQuery Table\ntitle: Customers\n---\n\n# Schema\n',
      },
      {
        path: 'index.md',
        content: '---\nokf_version: "0.2"\n---\n\n# Concepts\n\n* [Customers](concepts/customers.md) - customer table\n',
      },
      {
        path: 'log.md',
        content: '# Directory Update Log\n\n## 2026-08-10\n* Initial creation.\n',
      },
    ];
    const bundle = importBundle(files);
    expect(bundle.okfVersion).toBe(OKF_VERSION);
    expect(bundle.concepts).toHaveLength(1);
    expect(bundle.concepts[0].metadata.type).toBe('BigQuery Table');
    expect(bundle.indices).toHaveLength(1);
    expect(bundle.indices[0].okfVersion).toBe('0.2');
    expect(bundle.logs).toHaveLength(1);
  });

  it('rejects concepts without a type', () => {
    const doc = parseCanonical('---\ntitle: Untyped\n---\n\nbody\n');
    expect(() => validateConcept(doc, 'missing.md')).toThrow('missing or empty required "type"');
  });

  it('rejects reserved filenames as concepts', () => {
    const doc = parseCanonical('---\ntype: Index\n---\n');
    expect(() => validateConcept(doc, 'index.md')).toThrow('reserved filename');
    expect(() => validateConcept(doc, 'log.md')).toThrow('reserved filename');
  });

  it('preserves unknown producer-defined fields', () => {
    const files = [
      {
        path: 'custom.md',
        content: '---\ntype: Custom\ncustom_key: [1, 2]\n---\n\nbody\n',
      },
    ];
    const bundle = importBundle(files);
    expect(bundle.concepts[0].metadata.custom_key).toEqual([1, 2]);
    const exported = exportBundle(bundle);
    expect(exported[0].content).toContain('custom_key:');
  });

  it('converts wikilinks to standard markdown on export and back on import', () => {
    const bundle: OkfBundle = {
      okfVersion: OKF_VERSION,
      concepts: [
        {
          id: 'a',
          path: 'a.md',
          metadata: { type: 'Concept' },
          document: parseCanonical('---\ntype: Concept\n---\n\nSee [[b|note b]].\n'),
        },
      ],
      indices: [],
      logs: [],
    };
    const exported = exportBundle(bundle, { convertWikilinks: true });
    expect(exported[0].content).toContain('[note b](b.md)');
    expect(exported[0].content).not.toContain('[[');

    const reimported = importBundle(exported, { restoreWikilinks: true });
    expect(reimported.concepts[0].document.body).toContain('[[b|note b]]');
  });

  it('derives trust tiers', () => {
    expect(trustTier({ type: 'X' })).toBe('unverified');
    expect(trustTier({ type: 'X', verified: { by: 'agent/foo', at: '2026-01-01' } })).toBe('machine-confirmed');
    expect(
      trustTier({
        type: 'X',
        verified: [
          { by: 'agent/foo', at: '2026-01-01' },
          { by: 'human:alice', at: '2026-01-02' },
        ],
      })
    ).toBe('human-reviewed');
  });

  it('checks staleness', () => {
    expect(isStale({ type: 'X' })).toBe(false);
    expect(isStale({ type: 'X', stale_after: '2020-01-01' }, new Date('2026-01-01'))).toBe(true);
    expect(isStale({ type: 'X', stale_after: '2030-01-01' }, new Date('2026-01-01'))).toBe(false);
  });
});
