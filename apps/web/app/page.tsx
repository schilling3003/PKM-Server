'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createWorkspace, listWorkspaces, type Workspace } from '../lib/api';

export default function Home() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listWorkspaces().then(setWorkspaces).catch((e) => setError(String(e)));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const ws = await createWorkspace(name.trim());
      setWorkspaces([ws, ...workspaces]);
      setName('');
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="text-3xl font-bold text-foreground">PKM v1</h1>
      <p className="mt-2 text-muted-foreground">Markdown-first personal knowledge management.</p>

      {error && <p className="mt-4 rounded bg-destructive/10 p-3 text-destructive">{error}</p>}

      <form onSubmit={handleCreate} className="mt-8 flex max-w-md gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New workspace name"
          className="flex-1 rounded border border-border bg-card px-3 py-2 text-foreground"
        />
        <button type="submit" className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90">
          Create
        </button>
      </form>

      <h2 className="mt-8 text-xl font-semibold">Workspaces</h2>
      <ul className="mt-4 space-y-2">
        {workspaces.map((ws) => (
          <li key={ws.id}>
            <Link
              href={`/workspaces/${ws.id}`}
              className="block rounded border border-border bg-card p-4 hover:shadow-sm"
            >
              <span className="font-medium">{ws.name}</span>
              <span className="ml-2 text-sm text-muted-foreground">{ws.id}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
