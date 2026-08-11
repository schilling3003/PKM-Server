-- Add archived_at timestamp for document lifecycle soft-delete.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- Default index for filtering active documents.
CREATE INDEX IF NOT EXISTS idx_documents_archived_at ON documents(archived_at) WHERE archived_at IS NULL;
