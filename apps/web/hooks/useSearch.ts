'use client';

import { useEffect, useRef, useState } from 'react';
import { searchAll } from '../lib/search';
import type { SearchResult } from '../lib/api';

const DEFAULT_DEBOUNCE_MS = 150;

export interface UseSearchOptions {
  limit?: number;
  debounceMs?: number;
}

export function useSearch(
  workspaceId: string,
  query: string,
  options: UseSearchOptions = {}
) {
  const { limit = 20, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchAll(workspaceId, query, limit)
        .then(setResults)
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [workspaceId, query, limit, debounceMs]);

  return { results, loading, error };
}
