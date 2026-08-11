'use client';

import { useMemo } from 'react';
import { extractOutline } from '@pkm/markdown';

interface OutlinePanelProps {
  content: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/;

function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_RE, '');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export default function OutlinePanel({ content }: OutlinePanelProps) {
  const headings = useMemo(() => extractOutline(stripFrontmatter(content)), [content]);

  if (headings.length === 0) {
    return (
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outline</h3>
        <p className="mt-2 text-xs text-muted-foreground">No headings in this note.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outline</h3>
      <ul className="mt-2 space-y-1">
        {headings.map((heading) => {
          const id = slugify(heading.title);
          return (
            <li key={`${heading.level}-${heading.start}`}>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById(id);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    el.focus({ preventScroll: true });
                  }
                }}
                className="w-full truncate text-left text-sm text-foreground hover:text-primary hover:underline"
                style={{ paddingLeft: (heading.level - 1) * 12 }}
                title={heading.title}
              >
                {heading.title}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
