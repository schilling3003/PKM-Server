'use client';

import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getWorkspace,
  listDocuments,
  proposeEdit,
  updateDocument,
  type Document,
  type ProposedEdit,
  type Workspace,
} from '../../../../lib/api';
import ThemeToggle from '@/components/ThemeToggle';

export default function DiffPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.id;
  const documentId = searchParams.get('documentId') ?? '';
  const instructionParam = searchParams.get('instruction') ?? '';

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState(documentId);
  const [instruction, setInstruction] = useState(instructionParam);
  const [proposal, setProposal] = useState<ProposedEdit | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasParams = Boolean(documentId || instructionParam);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getWorkspace(workspaceId).catch(() => null), listDocuments(workspaceId)])
      .then(([ws, docs]) => {
        if (cancelled) return;
        setWorkspace(ws ?? { id: workspaceId, name: workspaceId, created_at: '' });
        setDocuments(docs);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (workspace) {
      document.title = `Diff — ${workspace.name} — PKM`;
    } else {
      document.title = 'Diff — PKM';
    }
  }, [workspace]);

  useEffect(() => {
    if (!hasParams || !documentId || !instructionParam) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setProposal(null);
      try {
        const result = await proposeEdit(workspaceId, { documentId, instruction: instructionParam });
        if (!cancelled) setProposal(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, documentId, instructionParam, hasParams]);

  async function handlePropose(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDocumentId || !instruction.trim()) return;
    setLoading(true);
    setError(null);
    setProposal(null);
    try {
      const result = await proposeEdit(workspaceId, {
        documentId: selectedDocumentId,
        instruction: instruction.trim(),
      });
      setProposal(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!proposal || !selectedDocumentId) return;
    setApplying(true);
    setError(null);
    try {
      const updates: { path?: string; content?: string } = {};
      if (proposal.proposedPath !== proposal.originalPath) updates.path = proposal.proposedPath;
      if (proposal.proposedContent !== proposal.originalContent) updates.content = proposal.proposedContent;
      await updateDocument(workspaceId, selectedDocumentId, updates);
      router.push(`/workspaces/${workspaceId}?doc=${selectedDocumentId}`);
    } catch (err) {
      setApplying(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleReject() {
    router.push(`/workspaces/${workspaceId}${selectedDocumentId ? `?doc=${selectedDocumentId}` : ''}`);
  }

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedDocumentId),
    [documents, selectedDocumentId]
  );

  const hasChanges = useMemo(() => {
    if (!proposal) return false;
    return proposal.proposedPath !== proposal.originalPath || proposal.proposedContent !== proposal.originalContent;
  }, [proposal]);

  return (
    <main id="main-content" className="flex h-screen flex-col bg-background text-foreground" role="main" aria-label="Proposed edit review">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <NextLink href={`/workspaces/${workspaceId}`} className="text-sm text-primary hover:underline">
            ← Workspace
          </NextLink>
          <span className="text-muted-foreground">/</span>
          <h1 className="truncate text-base font-semibold text-foreground">
            {workspace ? `${workspace.name} — Diff` : 'Diff'}
          </h1>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 flex-col overflow-auto p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        {!proposal && (
          <form onSubmit={handlePropose} className="mx-auto w-full max-w-2xl space-y-4">
            <div>
              <label htmlFor="diff-doc" className="block text-sm font-medium text-foreground">
                Target note
              </label>
              <select
                id="diff-doc"
                value={selectedDocumentId}
                onChange={(e) => setSelectedDocumentId(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground"
                disabled={loading || hasParams}
              >
                <option value="">Select a note…</option>
                {documents
                  .filter((d) => !d.archived_at)
                  .sort((a, b) => a.path.localeCompare(b.path))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title ?? d.path.split('/').pop()} ({d.path})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="diff-instruction" className="block text-sm font-medium text-foreground">
                Instruction
              </label>
              <input
                id="diff-instruction"
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe the edit you want the AI to propose…"
                className="mt-1 w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground"
                disabled={loading || hasParams}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !selectedDocumentId || !instruction.trim()}
              className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50"
            >
              {loading ? 'Proposing…' : 'Propose edit'}
            </button>
          </form>
        )}

        {loading && !proposal && (
          <div className="mt-8 text-center text-sm text-muted-foreground">Proposing edit…</div>
        )}

        {proposal && (
          <div className="mx-auto w-full max-w-6xl space-y-4">
            <div className="rounded border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground">Explanation</h2>
              <p className="mt-1 text-sm text-foreground">{proposal.explanation}</p>
              {proposal.proposedPath !== proposal.originalPath && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Path will change from <code>{proposal.originalPath}</code> to <code>{proposal.proposedPath}</code>.
                </p>
              )}
            </div>

            {proposal.warning && (
              <div className="rounded bg-amber-100 p-3 text-sm text-amber-800 dark:bg-amber-900 dark:text-amber-100" role="status">
                {proposal.warning}
              </div>
            )}

            {!hasChanges && (
              <div className="rounded border border-border bg-card p-3 text-sm text-muted-foreground" role="status">
                No changes were proposed.
              </div>
            )}

            <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col rounded border border-border bg-card">
                <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">Original</div>
                <textarea
                  readOnly
                  value={proposal.originalContent}
                  className="h-96 w-full resize-none bg-card p-3 font-mono text-xs text-foreground outline-none"
                  aria-label="Original note content"
                />
              </div>
              <div className="flex flex-col rounded border border-border bg-card">
                <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">Proposed</div>
                <textarea
                  readOnly
                  value={proposal.proposedContent}
                  className="h-96 w-full resize-none bg-card p-3 font-mono text-xs text-foreground outline-none"
                  aria-label="Proposed note content"
                />
              </div>
            </div>

            {proposal.citations.length > 0 && (
              <div className="rounded border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Sources</h2>
                <ol className="mt-2 list-decimal pl-5 text-sm">
                  {proposal.citations.map((citation) => (
                    <li key={citation.id} className="mb-1">
                      <button
                        type="button"
                        onClick={() => router.push(`/workspaces/${workspaceId}?doc=${citation.id}`)}
                        className="text-left text-primary hover:underline"
                      >
                        {citation.title ?? citation.path.split('/').pop() ?? citation.path}
                      </button>
                      <span className="ml-2 text-xs text-muted-foreground">({citation.path})</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleReject}
                disabled={applying}
                className="rounded border border-border bg-muted px-4 py-2 text-sm text-foreground hover:bg-muted/80 disabled:cursor-not-allowed"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={applying || !hasChanges}
                title={!hasChanges ? 'No proposed changes to apply' : undefined}
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50"
              >
                {applying ? 'Applying…' : 'Apply'}
              </button>
            </div>
          </div>
        )}

        {!hasParams && !proposal && !loading && selectedDoc && (
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
            Describe the change you want and click <strong>Propose edit</strong> to review a diff before applying.
          </p>
        )}
      </div>
    </main>
  );
}
