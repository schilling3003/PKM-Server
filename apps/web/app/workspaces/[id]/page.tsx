'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
  type Document,
} from '../../../lib/api';

type TreeNode = { name: string; children: (TreeNode | Document)[] };

export default function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.id;
  const selectedId = searchParams.get('doc') ?? null;

  const [documents, setDocuments] = useState<Document[]>([]);
  const [doc, setDoc] = useState<Document | null>(null);
  const [content, setContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPath, setNewPath] = useState('');

  useEffect(() => {
    listDocuments(workspaceId)
      .then(setDocuments)
      .catch((e) => setError(String(e)));
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDoc(null);
      setContent('');
      return;
    }
    getDocument(workspaceId, selectedId)
      .then((d) => {
        setDoc(d);
        setContent(d.content);
        setIsDirty(false);
      })
      .catch((e) => setError(String(e)));
  }, [workspaceId, selectedId]);

  const fileTree = useMemo(() => {
    function isFolder(n: TreeNode | Document, folderName: string): n is TreeNode {
      return 'children' in n && Array.isArray((n as TreeNode).children) && (n as TreeNode).name === folderName;
    }
    const root: TreeNode = { name: '', children: [] };
    for (const d of documents) {
      const parts = d.path.split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const name = parts[i];
        let child = node.children.find((c): c is TreeNode => isFolder(c, name));
        if (!child) {
          child = { name, children: [] };
          node.children.push(child);
        }
        node = child;
      }
      node.children.push(d);
    }
    return root.children;
  }, [documents]);

  async function handleSave() {
    if (!doc) return;
    try {
      const updated = await updateDocument(workspaceId, doc.id, { content });
      setDoc(updated);
      setIsDirty(false);
      setDocuments(documents.map((d) => (d.id === updated.id ? updated : d)));
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newPath.trim()) return;
    try {
      const d = await createDocument(
        workspaceId,
        newPath.trim(),
        '---\ntype: Note\n---\n\n'
      );
      setDocuments([...documents, d]);
      setNewPath('');
      router.push(`/workspaces/${workspaceId}?doc=${d.id}`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this note?')) return;
    try {
      await deleteDocument(workspaceId, id);
      setDocuments(documents.filter((d) => d.id !== id));
      if (doc?.id === id) router.push(`/workspaces/${workspaceId}`);
    } catch (e) {
      setError(String(e));
    }
  }

  function renderTree(nodes: (TreeNode | Document)[], depth = 0) {
    return nodes.map((node) => {
      if ('path' in node) {
        const d = node;
        const isSelected = d.id === selectedId;
        return (
          <div key={d.id} style={{ paddingLeft: depth * 12 }} className="group flex items-center justify-between">
            <button
              onClick={() => router.push(`/workspaces/${workspaceId}?doc=${d.id}`)}
              className={`flex-1 truncate rounded px-2 py-1 text-left text-sm ${
                isSelected ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-100'
              }`}
            >
              {d.title ?? d.path.split('/').pop()}
            </button>
            <button
              onClick={() => handleDelete(d.id)}
              className="ml-1 rounded px-1 text-xs text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-50"
              aria-label="Delete note"
            >
              ×
            </button>
          </div>
        );
      }
      return (
        <div key={node.name} style={{ paddingLeft: depth * 12 }}>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{node.name}</div>
          {renderTree(node.children, depth + 1)}
        </div>
      );
    });
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-72 flex flex-col border-r border-gray-200 bg-white p-4">
        <h1 className="text-lg font-bold">Workspace</h1>
        {error && <p className="mt-2 rounded bg-red-100 p-2 text-xs text-red-700">{error}</p>}
        <form onSubmit={handleCreate} className="mt-4 flex gap-2">
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="path/to/note.md"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button type="submit" className="rounded bg-blue-600 px-2 py-1 text-sm text-white hover:bg-blue-700">
            New
          </button>
        </form>
        <nav className="mt-4 flex-1 overflow-auto">{renderTree(fileTree)}</nav>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        {doc ? (
          <>
            <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
              <div>
                <h2 className="font-semibold text-gray-900">{doc.title ?? doc.path}</h2>
                <p className="text-xs text-gray-500">{doc.path}</p>
              </div>
              <div className="flex items-center gap-3">
                {isDirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
                <button
                  onClick={handleSave}
                  className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="rounded border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </header>
            <div className="grid flex-1 grid-cols-2 divide-x divide-gray-200">
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full resize-none p-4 font-mono text-sm outline-none"
                spellCheck={false}
                aria-label="Markdown source"
              />
              <div className="markdown-preview overflow-auto p-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-gray-500">
            Select or create a note to begin.
          </div>
        )}
      </main>
    </div>
  );
}
