'use client';

import { useMemo, useRef, useState } from 'react';
import { useSearch } from '../hooks/useSearch';
import type { Document, SearchResult } from '../lib/api';

export interface SearchPaletteProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (doc: Document) => void;
}

function displayTitle(d: Pick<SearchResult, 'title' | 'path'>) {
  return d.title ?? d.path.split('/').pop() ?? d.path;
}

export default function SearchPalette({ workspaceId, isOpen, onClose, onSelect }: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, loading, error } = useSearch(workspaceId, query, { limit: 20 });

  const flatResults = useMemo(() => results.slice(0, 20), [results]);
  const safeIndex =
    flatResults.length > 0 ? Math.min(selectedIndex, flatResults.length - 1) : -1;

  function select(doc: Document) {
    onSelect(doc);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (flatResults.length === 0) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((safeIndex + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((safeIndex - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = flatResults[safeIndex];
      if (selected) select(selected);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 sm:pt-24"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Search and quick switcher"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search notes, titles, or content…"
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none"
            aria-label="Search query"
            aria-autocomplete="list"
            aria-controls="search-results"
            autoFocus
          />
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>

        {error && (
          <div className="border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div
          id="search-results"
          className="max-h-[60vh] overflow-auto"
          role="listbox"
          aria-label="Search results"
        >
          {flatResults.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {query.trim() ? 'No notes found.' : 'Start typing to search, or select a recent note.'}
            </div>
          )}

          {flatResults.map((doc, index) => {
            const selected = index === safeIndex;
            const title = displayTitle(doc);
            return (
              <button
                key={doc.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => select(doc)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full border-b border-border px-4 py-3 text-left last:border-0 transition-colors ${
                  selected ? 'bg-accent text-accent-foreground' : 'bg-card text-foreground hover:bg-muted'
                }`}
              >
                <div className="truncate font-medium">{title}</div>
                <div className="truncate text-xs text-muted-foreground">{doc.path}</div>
              </button>
            );
          })}

          {loading && (
            <div className="px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
              Searching…
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
          <span>{flatResults.length} result{flatResults.length === 1 ? '' : 's'}</span>
          <span className="hidden sm:inline">
            ↑↓ to navigate · Enter to open · Esc to close
          </span>
        </div>
      </div>
    </div>
  );
}
