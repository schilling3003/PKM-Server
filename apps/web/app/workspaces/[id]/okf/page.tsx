'use client';

import { useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { exportOkf, importOkf, getWorkspace, type Workspace } from '../../../../lib/api';

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace'
  );
}

export default function OkfPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setLoading(true);
        setError(null);
      })
      .then(() => getWorkspace(workspaceId))
      .then((ws) => {
        if (!cancelled) setWorkspace(ws);
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspace({ id: workspaceId, name: workspaceId, created_at: '' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (workspace?.name) {
      document.title = `OKF Import/Export — ${workspace.name} — PKM`;
    } else {
      document.title = 'OKF Import/Export — PKM';
    }
  }, [workspace]);

  async function handleExport() {
    setError(null);
    setSuccess(null);
    setExporting(true);
    try {
      const blob = await exportOkf(workspaceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const wsName = slugifyName(workspace?.name ?? workspaceId);
      a.download = `okf-export-${wsName}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSuccess('Export downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    if (!selectedFile) return;
    setError(null);
    setSuccess(null);
    setImporting(true);
    try {
      const result = await importOkf(workspaceId, selectedFile);
      setSuccess(`Imported ${result.imported} concept${result.imported === 1 ? '' : 's'}.`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div
      id="main-content"
      className="flex h-screen flex-col bg-background text-foreground"
      role="main"
      aria-label="OKF import and export"
    >
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <NextLink
            href={`/workspaces/${workspaceId}`}
            className="text-sm text-primary hover:underline"
          >
            ← Workspace
          </NextLink>
          <span className="text-muted-foreground">/</span>
          <h1 className="truncate text-base font-semibold text-foreground">
            {workspace?.name ? `${workspace.name} — OKF` : 'OKF Import / Export'}
          </h1>
        </div>
      </header>

      {error && (
        <div
          className="border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="border-b border-border bg-primary/10 px-4 py-2 text-sm text-primary"
          role="status"
          aria-live="polite"
        >
          {success}
        </div>
      )}

      <main className="flex flex-1 items-start justify-center overflow-auto p-6">
        {loading ? (
          <div className="text-muted-foreground">Loading workspace…</div>
        ) : (
          <section
            className="w-full max-w-2xl rounded border border-border bg-card p-6 shadow-sm"
            aria-labelledby="okf-title"
          >
            <h2 id="okf-title" className="text-xl font-semibold">
              Open Knowledge Format (v0.2)
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Export this workspace as a portable OKF bundle, or import a bundle to add or update notes.
            </p>

            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-base font-medium">Export</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Download the workspace bundle as JSON.
                </p>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  className="mt-3 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Export OKF bundle"
                >
                  {exporting ? 'Exporting…' : 'Export OKF bundle'}
                </button>
              </div>

              <hr className="border-border" />

              <div>
                <h3 className="text-base font-medium">Import</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select an OKF v0.2 JSON bundle. It must contain a non-empty{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">concepts</code> array.
                </p>
                <label htmlFor="okf-import" className="mt-3 block text-sm font-medium">
                  Select OKF bundle
                </label>
                <input
                  id="okf-import"
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    setError(null);
                    setSuccess(null);
                    setSelectedFile(e.target.files?.[0] ?? null);
                  }}
                  className="mt-2 block w-full rounded border border-border bg-background p-2 text-sm text-foreground file:mr-4 file:rounded file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-muted/80 focus-visible:outline-none"
                  aria-describedby="okf-import-help"
                />
                <p id="okf-import-help" className="mt-2 text-xs text-muted-foreground">
                  Only .json files are accepted. The bundle is validated before it is uploaded.
                </p>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!selectedFile || importing}
                  className="mt-3 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Import selected OKF bundle"
                >
                  {importing ? 'Importing…' : 'Import OKF bundle'}
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
