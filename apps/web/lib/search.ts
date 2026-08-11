import { listDocuments, searchDocuments, type SearchResult } from './api';

/**
 * Hybrid search helper for the web app.
 *
 * - For non-empty queries it calls the workspace `/search` endpoint.
 * - For empty queries it returns the most recently updated documents so the
 *   quick switcher is useful before the user types.
 */
export async function searchAll(
  workspaceId: string,
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) {
    const docs = await listDocuments(workspaceId);
    return docs
      .slice()
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, limit)
      .map((d) => ({ ...d }));
  }
  return searchDocuments(workspaceId, q, limit);
}
