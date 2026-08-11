'use client';

import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { askWorkspace, getWorkspace, type Workspace, type Citation } from '../../../../lib/api';
import ThemeToggle from '@/components/ThemeToggle';

export default function AskPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const workspaceId = params.id;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWorkspace(workspaceId)
      .then((ws) => {
        if (!cancelled) setWorkspace(ws);
      })
      .catch(() => {
        if (!cancelled) setWorkspace({ id: workspaceId, name: workspaceId, created_at: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (workspace) {
      document.title = `Ask — ${workspace.name} — PKM`;
    } else {
      document.title = 'Ask — PKM';
    }
  }, [workspace]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setCitations([]);
    setWarning(null);
    try {
      const result = await askWorkspace(workspaceId, q);
      setAnswer(result.answer);
      setCitations(result.citations ?? []);
      setWarning(result.warning ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="main-content" className="flex h-screen flex-col bg-background text-foreground" role="main" aria-label="Ask workspace">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <NextLink href={`/workspaces/${workspaceId}`} className="text-sm text-primary hover:underline">
            ← Workspace
          </NextLink>
          <span className="text-muted-foreground">/</span>
          <h1 className="truncate text-base font-semibold text-foreground">
            {workspace ? `${workspace.name} — Ask` : 'Ask'}
          </h1>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 flex-col overflow-auto p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl space-y-4">
          <label htmlFor="ask-question" className="sr-only">
            Question
          </label>
          <div className="flex gap-2">
            <input
              id="ask-question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about your notes…"
              className="flex-1 rounded border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50"
            >
              {loading ? 'Asking…' : 'Ask'}
            </button>
          </div>

          {error && (
            <div className="rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          {warning && (
            <div className="rounded bg-amber-100 p-3 text-sm text-amber-800 dark:bg-amber-900 dark:text-amber-100" role="status">
              {warning}
            </div>
          )}

          {answer !== null && (
            <div className="space-y-4">
              <section className="rounded border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Answer</h2>
                <div className="markdown-preview mt-2 text-sm text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                </div>
              </section>

              {citations.length > 0 && (
                <section className="rounded border border-border bg-card p-4">
                  <h2 className="text-sm font-semibold text-foreground">Sources</h2>
                  <ol className="mt-2 list-decimal pl-5 text-sm">
                    {citations.map((citation) => (
                      <li key={citation.id} className="mb-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/workspaces/${workspaceId}?doc=${citation.id}`)}
                          className="text-left text-primary hover:underline"
                          title={`Open ${citation.path}`}
                        >
                          {citation.title ?? citation.path.split('/').pop() ?? citation.path}
                        </button>
                        <span className="ml-2 text-xs text-muted-foreground">({citation.path})</span>
                        {citation.snippet && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{citation.snippet}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          )}

          {answer === null && !loading && !error && (
            <p className="text-center text-sm text-muted-foreground">
              Ask a grounded question. Answers cite the notes they draw from.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
