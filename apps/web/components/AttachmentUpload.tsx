'use client';

import { useCallback, useRef, useState } from 'react';
import { uploadAttachment, type Attachment } from '../lib/attachments';

interface AttachmentUploadProps {
  workspaceId: string;
  onUploaded?: (attachment: Attachment) => void;
  onError?: (error: string) => void;
}

export function AttachmentUpload({ workspaceId, onUploaded, onError }: AttachmentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const attachment = await uploadAttachment(workspaceId, file);
        onUploaded?.(attachment);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setIsUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [workspaceId, onUploaded, onError]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
        isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        onChange={onFileSelect}
        className="hidden"
        aria-label="Select a file to upload"
      />
      <p className="text-sm text-gray-600">
        {isUploading ? (
          'Uploading...'
        ) : (
          <>
            Drag and drop a file here, or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-blue-600 hover:underline"
            >
              choose a file
            </button>
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-gray-500">Maximum file size: 10 MB</p>
    </div>
  );
}
