'use client';

import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getWorkspace, type Workspace } from '../../../../lib/api';
import { getWorkspaceGraph, type GraphData, type GraphNode } from '../../../../lib/graph';
import { useTheme } from '@/components/ThemeProvider';
import GraphView from '../_components/GraphView';

export default function GraphPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const workspaceId = params.id;
  const { resolvedTheme } = useTheme();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      setData(null);
      Promise.all([getWorkspace(workspaceId).catch(() => null), getWorkspaceGraph(workspaceId)])
        .then(([ws, graph]) => {
          if (cancelled) return;
          setWorkspace(ws ?? { id: workspaceId, name: workspaceId, created_at: '' });
          setData(graph);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      clearTimeout(timeout);
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (workspace) {
      document.title = `Graph — ${workspace.name} — PKM`;
    } else {
      document.title = 'Graph — PKM';
    }
  }, [workspace]);

  function handleNodeClick(node: GraphNode) {
    if (node.source === 'entity' || node.type === 'entity') return;
    router.push(`/workspaces/${workspaceId}?doc=${node.id}`);
  }

  return (
    <div id="main-content" className="flex h-screen flex-col bg-background text-foreground" role="main" aria-label="Graph view">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <NextLink href={`/workspaces/${workspaceId}`} className="text-sm text-primary hover:underline">
            ← Workspace
          </NextLink>
          <span className="text-muted-foreground">/</span>
          <h1 className="truncate text-base font-semibold text-foreground">
            {workspace?.name ? `${workspace.name} graph` : 'Graph'}
          </h1>
        </div>
      </header>

      {error && (
        <div className="border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {loading || !data ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">Loading graph…</div>
      ) : (
        <GraphView data={data} onNodeClick={handleNodeClick} theme={resolvedTheme} />
      )}
    </div>
  );
}
