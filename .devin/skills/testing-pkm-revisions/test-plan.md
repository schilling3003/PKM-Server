# End-to-end test plan: Workstream 18 revision history (refresh fix)

## Goal
Verify that saving a note now refreshes the Revisions panel and Index status
immediately, without a page reload, and that restoring an older revision still
reverts the editor/preview and keeps panels current.

## Code references that inform the plan
- `apps/web/app/workspaces/[id]/page.tsx:448-476` — `handleSave` now calls
  `listRevisions`, `getDocumentIndexStatus`, and `getWorkspaceIndexStatus` and
  updates the right-sidebar panels after a successful save.
- `apps/web/app/workspaces/[id]/page.tsx:1190-1237` — Index status and Revisions
  panels render `chunk_count`/`stale` and the latest 5 revisions.
- `apps/api/src/documents.ts:210-259` — `restoreRevision()` re-parses canonical
  Markdown, updates the document, inserts a new revisions row, syncs links/backlinks,
  and re-indexes chunks/embeddings.
- `apps/api/test/integration.test.ts:350-448` — backend `revision history` tests.

## Preconditions (already verified)
- Docker Compose services (`postgres`, `redis`, `minio`, `temporal`) healthy.
- AI service on port 8000; API on port 4000; web dev server on port 3000.
- Web dev server has picked up the latest `page.tsx` change (restart it if HMR
  did not apply the change).

## Setup (not part of assertions)
1. Open `http://localhost:3000/login` in the browser.
2. Register or sign in.
3. On `/`, create a workspace and open it.

## Test steps and pass/fail criteria
1. **Create a note**
   - Click **New** in the left sidebar, enter path `revision-refresh.md`, and confirm.
   - **Pass:** editor loads with source `---\ntype: Note\n---\n\n`; Revisions panel
     shows 1 entry; Index status shows `0 chunk(s), 0 embedded`.

2. **Save version 1**
   - In the source textarea type `Version 1 - first text.` after the frontmatter and
     press **Ctrl+S**.
   - **Pass:** source and preview show `Version 1 - first text.`; within a few
     seconds the Revisions panel grows to **2 entries** and the Index status updates
     to `This note: 1 chunk(s), 1 embedded` and `1 indexed, 1 current` with no
     `stale` marker.

3. **Save version 2**
   - Replace the body with `Version 2 - second text.` and press **Ctrl+S**.
   - **Pass:** source/preview update; Revisions panel grows to **3 entries**;
     Index status stays current (`1 chunk(s), 1 embedded`).

4. **Save version 3**
   - Replace the body with `Version 3 - third text.` and press **Ctrl+S**.
   - **Pass:** source/preview update; Revisions panel grows to **4 entries**;
     Index status stays current.

5. **Restore an older revision**
   - Click **Restore** on the second row in the Revisions panel (the oldest
     distinct prior version, not the top row).
   - **Pass within 10 s:** editor source and preview revert to the older version
     text; the Revisions panel grows by **one new entry at the top**; Index status
     remains current (`1 chunk(s), 1 embedded`, not stale).

6. **Run integration tests**
   - In the repo root run `pnpm -r test`.
   - **Pass:** command exits `0` and the `revision history` block in
     `apps/api/test/integration.test.ts` passes.

## What would indicate a bug
- Revisions panel or Index status do **not** update immediately after a save.
- Restoring a revision does not change editor/preview text.
- Index status shows `stale` after a save or restore.
- `pnpm -r test` fails any test.
