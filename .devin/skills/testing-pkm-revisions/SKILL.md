---
name: testing-pkm-revisions
description: End-to-end testing notes for the PKM v1 revision-history UI and API (workstream 18).
---

# Testing PKM v1 revision history

## Devin Secrets Needed
- None for the local walking-skeleton flow.

## Prerequisites
- Same as `testing-pkm` and `testing-pkm-search-ai`: Docker Compose services up, AI service on port 8000, API on 4000, web on 3000.
- `EMBEDDING_PROVIDER=sentence-transformers` on the AI service; first `/embed` call downloads the model and may take 10–60 s.

## UI walkthrough
1. Open `http://localhost:3000/login`, register or sign in, and create a workspace from `/`.
2. In `/workspaces/[id]`, create a note (click **New** in the left sidebar, enter a path, and confirm).
3. In the left source pane, edit the body and press **Ctrl+S** (or Cmd+S) to save.
4. Make at least two more distinct edits, saving each time, to generate a revision chain.
5. The right-sidebar `Revisions` panel and `Index status` should refresh **automatically** after each save, showing new revision entries and current index counts without a page reload.
6. Click **Restore** on an older row; the editor source and preview should revert to that version, the Revisions list should grow by one entry at the top, and the per-note Index status should stay `current` / `not stale` with `chunk_count > 0`.

## Caveats
- Some blue submit/save/restore buttons may not register automated mouse clicks in the current harness; use keyboard shortcuts (Enter in form inputs, Ctrl+S for save) or invoke the button's `onClick` handler directly when automating.

## API sanity checks
- `GET /workspaces/:workspaceId/documents/:documentId/revisions`
- `GET /workspaces/:workspaceId/documents/:documentId/revisions/:revisionId`
- `POST /workspaces/:workspaceId/documents/:documentId/revisions/:revisionId/restore`

## Test command
- `pnpm -r test` runs unit/integration tests, including the `revision history` integration block in `apps/api/test/integration.test.ts`.
