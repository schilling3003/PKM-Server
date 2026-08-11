'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AttachmentUpload } from '../../../../components/AttachmentUpload';
import {
  deleteAttachment,
  getAttachmentDownloadUrl,
  listAttachments,
  type Attachment,
} from '../../../../lib/attachments';
import { getWorkspace, type Workspace } from '../../../../lib/api';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentsPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getWorkspace(workspaceId), listAttachments(workspaceId)])
      .then(([ws, list]) => {
        if (cancelled) return;
        setWorkspace(ws);
        setAttachments(list);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load attachments');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (workspace) {
      document.title = `Attachments — ${workspace.name} — PKM`;
    } else {
      document.title = 'Attachments — PKM';
    }
  }, [workspace]);

  async function handleDelete(attachment: Attachment) {
    if (!confirm(`Delete "${attachment.filename}"? This cannot be undone.`)) return;
    try {
      await deleteAttachment(attachment.id, workspaceId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function handleUploaded(attachment: Attachment) {
    setAttachments((prev) => [attachment, ...prev]);
  }

  return (
    <main id="main-content" className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-900 hover:underline">
            Workspaces
          </Link>
          <span>/</span>
          {workspace ? (
            <Link href={`/workspaces/${workspaceId}`} className="hover:text-gray-900 hover:underline">
              {workspace.name}
            </Link>
          ) : (
            <span>Workspace</span>
          )}
          <span>/</span>
          <span className="font-medium text-gray-900">Attachments</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">Attachments</h1>

        {error && <p className="mt-4 rounded bg-red-100 p-3 text-red-700" role="alert">{error}</p>}

        <div className="mt-6">
          <AttachmentUpload
            workspaceId={workspaceId}
            onUploaded={handleUploaded}
            onError={(msg) => setError(msg)}
          />
        </div>

        <div className="mt-8 rounded border border-gray-200 bg-white">
          {loading ? (
            <p className="p-4 text-gray-500">Loading attachments…</p>
          ) : attachments.length === 0 ? (
            <p className="p-4 text-gray-500">No attachments yet.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-gray-900">{attachment.filename}</p>
                    <p className="text-xs text-gray-500">
                      {attachment.content_type} · {formatBytes(attachment.size_bytes)}
                    </p>
                  </div>
                  <a
                    href={getAttachmentDownloadUrl(attachment.id, workspaceId)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
                    aria-label={`Download ${attachment.filename}`}
                    title={`Download ${attachment.filename}`}
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(attachment)}
                    className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                    aria-label={`Delete ${attachment.filename}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
