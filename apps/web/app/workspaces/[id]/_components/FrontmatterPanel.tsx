'use client';

import { useMemo, useState } from 'react';
import { extractTags } from '@pkm/markdown';
import type { Document } from '../../../../lib/api';

interface FrontmatterPanelProps {
  doc: Document | null;
  content: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/;

function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_RE, '');
}

function stringifyValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export default function FrontmatterPanel({ doc, content }: FrontmatterPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  const tags = useMemo(() => {
    const frontmatterTags = doc?.frontmatter?.tags;
    if (Array.isArray(frontmatterTags)) {
      return frontmatterTags.map((t) => String(t));
    }
    if (typeof frontmatterTags === 'string' && frontmatterTags.trim()) {
      return frontmatterTags
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
    }
    return extractTags(stripFrontmatter(content));
  }, [doc?.frontmatter?.tags, content]);

  if (!doc) {
    return (
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Properties</h3>
        <p className="mt-2 text-xs text-muted-foreground">Select a note to see its frontmatter.</p>
      </section>
    );
  }

  const entries = Object.entries(doc.frontmatter).filter(([key]) => key !== 'tags' && key !== 'type');
  const typeValue = doc.frontmatter.type;

  return (
    <section>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        aria-expanded={isOpen}
      >
        <span>Properties</span>
        <span className="text-muted-foreground">{isOpen ? '▾' : '▸'}</span>
      </button>

      {isOpen && (
        <div className="mt-2 space-y-3">
          {typeof typeValue === 'string' && typeValue && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">type</span>
              <span className="ml-2 inline-block rounded bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
                {typeValue}
              </span>
            </div>
          )}

          <div>
            <span className="text-xs font-medium text-muted-foreground">tags</span>
            {tags.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No tags.</p>
            )}
          </div>

          {entries.length > 0 && (
            <dl className="space-y-2">
              {entries.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs font-medium text-muted-foreground">{key}</dt>
                  <dd className="break-words text-xs text-foreground">{stringifyValue(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
