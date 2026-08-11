'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import NextLink from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { wikiToStandard, extractWikiLinks } from '@pkm/markdown';
import {
  createDocument,
  deleteDocument,
  getDocument,
  getOutgoingLinks,
  getBacklinks,
  listDocuments,
  listWorkspaces,
  getWorkspace,
  updateDocument,
  type Document,
  type Link,
  type Workspace,
} from '../../../lib/api';
import SearchPalette from '@/components/SearchPalette';
import ThemeToggle from '@/components/ThemeToggle';

type TreeNode = { name: string; path: string; children: (TreeNode | Document)[] };

interface WorkspaceContextValue {
  workspaceId: string;
  documents: Document[];
  navigateToDoc: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceContext');
  return ctx;
}

function findDocumentByHref(docs: Document[], href: string): Document | undefined {
  if (!href) return undefined;
  const exact = docs.find((d) => d.path === href);
  if (exact) return exact;
  const lowerHref = href.toLowerCase();
  return docs.find((d) => d.path.toLowerCase() === lowerHref);
}

type MarkdownLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  node?: unknown;
  children?: ReactNode;
};

function MarkdownLink({ node: _node, href, children, ...props }: MarkdownLinkProps) {
  const { documents, navigateToDoc } = useWorkspace();

  if (!href) {
    return <span {...props}>{children}</span>;
  }

  const allowedScheme = /^(https?|mailto|tel):/i.test(href);
  const isExternal = allowedScheme || href.startsWith('//');
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(href);
  if (!href.endsWith('.md') || isExternal) {
    if (isExternal) {
      return (
        <a
          href={href}
          className="text-primary underline hover:text-primary/80"
          target="_blank"
          rel="noopener noreferrer"
          {...props}
        >
          {children}
        </a>
      );
    }
    if (hasScheme) {
      return (
        <span
          className="border-b border-dashed border-destructive/50 text-destructive"
          title={`Unsupported link: ${href}`}
          {...props}
        >
          {children}
        </span>
      );
    }
    return (
      <a href={href} className="text-primary underline hover:text-primary/80" {...props}>
        {children}
      </a>
    );
  }

  const target = findDocumentByHref(documents, href);
  if (!target) {
    return (
      <span
        className="cursor-not-allowed border-b border-dashed border-destructive/50 text-destructive"
        title={`Unresolved: ${href}`}
        {...props}
      >
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigateToDoc(target.id)}
      className="text-primary underline hover:text-primary/80"
    >
      {children}
    </button>
  );
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/;

function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_RE, '');
}

function displayName(d: Document | TreeNode): string {
  if ('children' in d) return d.name;
  return d.title ?? d.path.split('/').pop() ?? d.path;
}

function folderOfPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx > 0 ? path.slice(0, idx) : '';
}

function resolveWikiTarget(target: string): string {
  return target.endsWith('.md') ? target : `${target}.md`;
}

function findDocByWikiTarget(docs: Document[], target: string): Document | undefined {
  const resolved = resolveWikiTarget(target);
  return docs.find((d) => d.path === resolved || d.path === target);
}

function linkFromDoc(d: Document, linkType = 'wiki'): Link {
  return {
    id: d.id,
    path: d.path,
    title: d.title ?? d.path.split('/').pop() ?? d.path,
    link_type: linkType,
  };
}

function buildOutgoingLinks(doc: Document, docs: Document[]): Link[] {
  const targets = extractWikiLinks(stripFrontmatter(doc.content));
  const seen = new Set<string>();
  const out: Link[] = [];
  for (const t of targets) {
    const resolved = resolveWikiTarget(t.target);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    const targetDoc = findDocByWikiTarget(docs, t.target);
    if (targetDoc) out.push(linkFromDoc(targetDoc));
  }
  return out;
}

function buildBacklinks(doc: Document, docs: Document[]): Link[] {
  const back: Link[] = [];
  const seen = new Set<string>();
  for (const d of docs) {
    if (d.id === doc.id) continue;
    const targets = extractWikiLinks(stripFrontmatter(d.content));
    for (const t of targets) {
      const resolved = resolveWikiTarget(t.target);
      if (resolved === doc.path || t.target === doc.path) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          back.push(linkFromDoc(d));
        }
      }
    }
  }
  return back;
}

export default function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.id;
  const selectedId = searchParams.get('doc') ?? null;

  const [documents, setDocuments] = useState<Document[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [content, setContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newNotePath, setNewNotePath] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Document | null>(null);
  const [renamePath, setRenamePath] = useState('');
  const [outgoingLinks, setOutgoingLinks] = useState<Link[]>([]);
  const [backlinks, setBacklinks] = useState<Link[]>([]);
  const [unresolvedWikilinks, setUnresolvedWikilinks] = useState<string[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const newNotePathRef = useRef<string>('');
  const renamePathRef = useRef<string>('');

  const navigateToDoc = useCallback(
    (id: string) => {
      router.push(`/workspaces/${workspaceId}?doc=${id}`);
    },
    [router, workspaceId]
  );

  const contextValue = useMemo<WorkspaceContextValue>(
    () => ({ workspaceId, documents, navigateToDoc }),
    [workspaceId, documents, navigateToDoc]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setLoadingDocs(true);
        setError(null);
      })
      .then(() => Promise.all([getWorkspace(workspaceId).catch(() => null), listWorkspaces(), listDocuments(workspaceId)]))
      .then(([ws, wss, docs]) => {
        if (cancelled) return;
        setWorkspace(ws ?? { id: workspaceId, name: workspaceId, created_at: '' });
        setWorkspaces(wss);
        setDocuments(docs.sort((a, b) => a.path.localeCompare(b.path)));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingDocs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        if (!selectedId) {
          setDoc(null);
          setContent('');
          setIsDirty(false);
          setOutgoingLinks([]);
          setBacklinks([]);
          setUnresolvedWikilinks([]);
          setLoadingDoc(false);
          return null;
        }
        setLoadingDoc(true);
        setError(null);
        return getDocument(workspaceId, selectedId);
      })
      .then((d) => {
        if (cancelled || !d) return;
        setDoc(d);
        setContent(d.content);
        setIsDirty(false);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingDoc(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, selectedId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        if (!doc) {
          setOutgoingLinks([]);
          setBacklinks([]);
          setUnresolvedWikilinks([]);
          return null;
        }
        const wikiLinks = extractWikiLinks(stripFrontmatter(doc.content));
        const unresolved = wikiLinks
          .map((l) => resolveWikiTarget(l.target))
          .filter((target) => !documents.some((d) => d.path === target));
        setUnresolvedWikilinks(Array.from(new Set(unresolved)));
        return Promise.all([getOutgoingLinks(workspaceId, doc.id), getBacklinks(workspaceId, doc.id)]);
      })
      .then((result) => {
        if (cancelled || !result || !doc) return;
        const [out, back] = result;
        setOutgoingLinks(out.length ? out : buildOutgoingLinks(doc, documents));
        setBacklinks(back.length ? back : buildBacklinks(doc, documents));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
        if (doc) {
          setOutgoingLinks(buildOutgoingLinks(doc, documents));
          setBacklinks(buildBacklinks(doc, documents));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, doc, documents]);

  const handleSave = useCallback(async () => {
    if (!doc || !isDirty) return;
    setIsSaving(true);
    try {
      const body = textareaRef.current?.value ?? content;
      const updated = await updateDocument(workspaceId, doc.id, { content: body });
      setDoc(updated);
      setContent(updated.content);
      setDocuments((prev) =>
        prev
          .map((d) => (d.id === updated.id ? updated : d))
          .sort((a, b) => a.path.localeCompare(b.path))
      );
      setIsDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSaving(false);
    }
  }, [doc, isDirty, workspaceId, content]);

  const saveRef = useRef(handleSave);
  useEffect(() => {
    saveRef.current = handleSave;
  }, [handleSave]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isDirty) saveRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDirty]);

  const filteredDocuments = useMemo(() => {
    if (!search.trim()) return documents;
    const q = search.toLowerCase();
    return documents.filter(
      (d) => (d.title ?? '').toLowerCase().includes(q) || d.path.toLowerCase().includes(q)
    );
  }, [documents, search]);

  const fileTree = useMemo(() => {
    const root: TreeNode = { name: '', path: '', children: [] };
    for (const d of filteredDocuments) {
      const parts = d.path.split('/');
      let node = root;
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        const name = parts[i];
        currentPath = currentPath ? `${currentPath}/${name}` : name;
        let child = node.children.find(
          (c): c is TreeNode => 'children' in c && (c as TreeNode).path === currentPath
        );
        if (!child) {
          child = { name, path: currentPath, children: [] };
          node.children.push(child);
        }
        node = child;
      }
      node.children.push(d);
    }

    function sortNode(n: TreeNode) {
      n.children.sort((a, b) => {
        const aFolder = 'children' in a;
        const bFolder = 'children' in b;
        if (aFolder !== bFolder) return aFolder ? -1 : 1;
        return displayName(a).localeCompare(displayName(b));
      });
      for (const child of n.children) {
        if ('children' in child) sortNode(child);
      }
    }
    sortNode(root);
    return root.children;
  }, [filteredDocuments]);

  async function handleCreate() {
    const path = newNotePathRef.current.trim();
    if (!path) return;
    try {
      const d = await createDocument(workspaceId, path, '---\ntype: Note\n---\n\n');
      setDocuments((prev) => [...prev, d].sort((a, b) => a.path.localeCompare(b.path)));
      setNewNotePath('');
      newNotePathRef.current = '';
      setShowNewDialog(false);
      router.push(`/workspaces/${workspaceId}?doc=${d.id}`);
    } catch (e) {
      setError(String(e));
    }
  }

  function confirmDelete(id: string, path: string) {
    if (!confirm(`Delete "${path}"? This cannot be undone.`)) return;
    deleteDocument(workspaceId, id)
      .then(() => {
        setDocuments((prev) => prev.filter((d) => d.id !== id));
        if (doc?.id === id) {
          router.push(`/workspaces/${workspaceId}`);
        }
      })
      .catch((e) => setError(String(e)));
  }

  async function handleRename() {
    if (!renameTarget) return;
    const path = renamePathRef.current.trim();
    if (!path) return;
    try {
      const updated = await updateDocument(workspaceId, renameTarget.id, { path });
      setDocuments((prev) =>
        prev
          .map((d) => (d.id === updated.id ? updated : d))
          .sort((a, b) => a.path.localeCompare(b.path))
      );
      if (doc?.id === updated.id) {
        setDoc(updated);
      }
      setRenameTarget(null);
      setRenamePath('');
      renamePathRef.current = '';
    } catch (e) {
      setError(String(e));
    }
  }

  function openNewDialog(folderPath = '') {
    const initial = folderPath ? `${folderPath}/` : '';
    setNewNotePath(initial);
    newNotePathRef.current = initial;
    setShowNewDialog(true);
  }

  function toggleFolder(path: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const previewContent = useMemo(() => {
    const body = stripFrontmatter(content);
    return wikiToStandard(body);
  }, [content]);

  const markdownComponents = useMemo(
    () => ({
      a: MarkdownLink,
    }),
    []
  );

  function renderTree(nodes: (TreeNode | Document)[], depth = 0) {
    return nodes.map((node) => {
      if ('children' in node) {
        const isExpanded = expandedFolders.has(node.path);
        return (
          <div key={node.path} className="select-none">
            <div
              className="group flex items-center rounded py-1 pr-1 hover:bg-muted"
              style={{ paddingLeft: depth * 12 }}
            >
              <button
                type="button"
                onClick={() => toggleFolder(node.path)}
                className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
              >
                {isExpanded ? '▾' : '▸'}
              </button>
              <span className="flex-1 cursor-pointer text-sm font-medium text-foreground" onClick={() => toggleFolder(node.path)}>
                {node.name}
              </span>
              <button
                type="button"
                onClick={() => openNewDialog(node.path)}
                className="rounded px-1 text-xs text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                title={`New note in ${node.path}`}
              >
                + new
              </button>
            </div>
            {isExpanded && <div>{renderTree(node.children, depth + 1)}</div>}
          </div>
        );
      }

      const d = node;
      const isSelected = d.id === selectedId;
      return (
        <div
          key={d.id}
          className="group flex items-center rounded py-1 hover:bg-muted"
          style={{ paddingLeft: depth * 12 }}
        >
          <button
            type="button"
            onClick={() => navigateToDoc(d.id)}
            className={`flex-1 truncate rounded px-2 py-1 text-left text-sm ${
              isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground'
            }`}
          >
            {d.title ?? d.path.split('/').pop()}
          </button>
          <button
            type="button"
            onClick={() => {
              setRenameTarget(d);
              setRenamePath(d.path);
              renamePathRef.current = d.path;
            }}
            className="ml-1 rounded px-1 text-xs text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
            aria-label="Rename or move note"
          >
            rename
          </button>
          <button
            type="button"
            onClick={() => confirmDelete(d.id, d.path)}
            className="ml-1 rounded px-1 text-xs text-destructive opacity-0 hover:bg-destructive/10 group-hover:opacity-100"
            aria-label="Delete note"
          >
            ×
          </button>
        </div>
      );
    });
  }

  function onContentChange(value: string) {
    setContent(value);
    if (!isDirty) setIsDirty(true);
  }

  const headerTitle = doc ? doc.title ?? doc.path.split('/').pop() ?? doc.path : 'Select or create a note';

  return (
    <WorkspaceContext.Provider value={contextValue}>
      <div className="flex h-screen bg-background text-sm">
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={`flex flex-col border-r border-border bg-card ${
            mobileSidebarOpen
              ? 'fixed inset-y-0 left-0 z-40 w-80'
              : 'hidden lg:flex lg:w-80'
          }`}
        >
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <NextLink href="/" className="hover:text-foreground hover:underline">
                  Workspaces
                </NextLink>
                <span>/</span>
                <select
                  value={workspaceId}
                  onChange={(e) => router.push(`/workspaces/${e.target.value}`)}
                  className="flex-1 truncate rounded border border-border bg-card px-2 py-1 text-sm font-medium text-foreground"
                  aria-label="Switch workspace"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
                aria-label="Close notes sidebar"
                title="Close notes sidebar"
              >
                ×
              </button>
            </div>
            {workspace && <p className="mt-1 truncate text-xs text-muted-foreground">{workspace.id}</p>}
          </div>

          <div className="border-b border-border p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter notes..."
                className="flex-1 rounded border border-border bg-card px-2 py-1 text-sm text-foreground"
              />
              <button
                type="button"
                onClick={() => openNewDialog(doc ? folderOfPath(doc.path) : '')}
                className="rounded bg-primary px-2 py-1 text-sm text-primary-foreground hover:bg-primary/90"
                title="New note"
              >
                New
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-4 rounded bg-destructive/10 p-2 text-xs text-destructive">
              <div className="flex items-start justify-between gap-2">
                <span className="break-words">{error}</span>
                <button type="button" onClick={() => setError(null)} className="text-destructive hover:underline">
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <nav className="flex-1 overflow-auto p-4">
            {loadingDocs ? (
              <p className="text-muted-foreground">Loading notes…</p>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-muted-foreground">
                <p>No notes found.</p>
                <button
                  type="button"
                  onClick={() => openNewDialog()}
                  className="mt-2 text-primary hover:underline"
                >
                  Create a note
                </button>
              </div>
            ) : (
              <div className="space-y-1">{renderTree(fileTree)}</div>
            )}
          </nav>
        </aside>

        <main className="flex flex-1 flex-col overflow-hidden">
          {/* BEGIN search + theme integration (header) */}
          <header className="flex items-center justify-between border-b border-border bg-card px-3 py-2 sm:px-6 sm:py-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
                aria-label="Open notes sidebar"
                title="Open notes sidebar"
              >
                ☰
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">{headerTitle}</h1>
                {doc && <p className="truncate text-xs text-muted-foreground">{doc.path}</p>}
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex items-center gap-2 rounded border border-border bg-muted px-2 py-1.5 text-sm text-foreground hover:bg-muted/80"
                aria-label="Open search"
                title="Open search (Ctrl+K / Cmd+K)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="hidden sm:inline">Search</span>
                <kbd className="hidden rounded border border-border bg-card px-1.5 py-0.5 text-xs text-muted-foreground md:inline-block">
                  ⌘K
                </kbd>
              </button>

              <ThemeToggle />

              <NextLink
                href={`/workspaces/${workspaceId}/attachments`}
                className="rounded border border-border bg-muted px-2 py-1.5 text-sm text-foreground hover:bg-muted/80"
                title="Attachments"
              >
                Attachments
              </NextLink>

              {isDirty && <span className="hidden text-xs text-amber-600 sm:inline">Unsaved</span>}
              {isSaving && <span className="text-xs text-muted-foreground">Saving…</span>}
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50 sm:px-4 sm:py-2"
              >
                Save
              </button>
              {doc && (
                <button
                  type="button"
                  onClick={() => confirmDelete(doc.id, doc.path)}
                  className="rounded border border-destructive/30 px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 sm:px-3 sm:py-2"
                >
                  Delete
                </button>
              )}
            </div>
          </header>
          {/* END search + theme integration (header) */}

          {loadingDoc ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">Loading note…</div>
          ) : doc ? (
            <div className="grid flex-1 grid-cols-1 divide-y divide-border overflow-hidden md:grid-cols-2 md:divide-x md:divide-y-0">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                className="h-full w-full resize-none bg-card p-4 font-mono text-sm leading-relaxed text-foreground outline-none"
                spellCheck={false}
                aria-label="Markdown source"
              />
              <div className="markdown-preview h-full overflow-auto bg-card p-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {previewContent}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
              <p>Select or create a note to begin.</p>
              <button
                type="button"
                onClick={() => openNewDialog()}
                className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              >
                New note
              </button>
            </div>
          )}
        </main>

        <aside className="hidden lg:flex lg:w-72 flex-col border-l border-border bg-card p-4">
          <h2 className="font-semibold text-foreground">Links</h2>
          {doc ? (
            <div className="mt-4 flex flex-1 flex-col gap-6 overflow-auto">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outgoing</h3>
                {outgoingLinks.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">No outgoing links.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {outgoingLinks.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => navigateToDoc(l.id)}
                          className="w-full truncate text-left text-sm text-primary hover:underline"
                          title={l.path}
                        >
                          {l.title ?? l.path.split('/').pop()}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Backlinks</h3>
                {backlinks.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">No backlinks yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {backlinks.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => navigateToDoc(l.id)}
                          className="w-full truncate text-left text-sm text-primary hover:underline"
                          title={l.path}
                        >
                          {l.title ?? l.path.split('/').pop()}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {unresolvedWikilinks.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-destructive">Unresolved wikilinks</h3>
                  <ul className="mt-2 space-y-1">
                    {unresolvedWikilinks.map((target) => (
                      <li key={target} className="truncate text-xs text-destructive" title={target}>
                        {target}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Select a note to see its links.</p>
          )}
        </aside>
      </div>

      {showNewDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewDialog(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-foreground">Create note</h2>
            <p className="mt-1 text-xs text-muted-foreground">Path may include folders, e.g. journal/2024-01.md</p>
            <input
              type="text"
              value={newNotePath}
              onChange={(e) => {
                setNewNotePath(e.target.value);
                newNotePathRef.current = e.target.value;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setShowNewDialog(false);
              }}
              placeholder="path/to/note.md"
              className="mt-4 w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewDialog(false)} className="rounded px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                Cancel
              </button>
              <button type="button" onClick={handleCreate} className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRenameTarget(null);
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-foreground">Rename / move note</h2>
            <p className="mt-1 text-xs text-muted-foreground">Change the full path to move it into a different folder.</p>
            <input
              type="text"
              value={renamePath}
              onChange={(e) => {
                setRenamePath(e.target.value);
                renamePathRef.current = e.target.value;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setRenameTarget(null);
              }}
              placeholder="new/path.md"
              className="mt-4 w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRenameTarget(null)} className="rounded px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                Cancel
              </button>
              <button type="button" onClick={handleRename} className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BEGIN search palette (workstream 5) */}
      <SearchPalette
        workspaceId={workspaceId}
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(d) => navigateToDoc(d.id)}
      />
      {/* END search palette (workstream 5) */}
    </WorkspaceContext.Provider>
  );
}
