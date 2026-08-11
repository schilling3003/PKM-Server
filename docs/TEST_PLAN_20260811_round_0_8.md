# PKM v1 round 0.8 end-to-end test plan

**Branch under test:** `origin/devin/pkm-v1-search-ai` (latest, including workstream 16)
**Environment:** local Docker Compose stack (postgres, redis, minio, temporal) + AI service (port 8000) + API (port 4000) + Next.js production build (port 3000)

## Setup state assumed before execution

- Local stack is healthy: `docker compose ps` reports postgres, redis, minio, temporal as `healthy`.
- `curl http://localhost:4000/health` returns `{"status":"ok","version":"0.1.0"}`.
- `curl http://localhost:8000/health` returns `{"status":"ok","version":"0.1.0"}`.
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` returns `200`.
- API is the **unmodified production build**; no temporary `bcryptjs` patch is applied.

## Flow A — Registration, login, workspace and note creation

**Goal:** A new user can register, log in, create a workspace, create notes, edit and save Markdown, and see the file tree and link panels update.

1. Open `http://localhost:3000/login`.
2. Click "Need an account? Register".
3. Enter email `pkm-tester-20260811@example.com` and password `TestPass123!`.
4. Submit. Expect redirect to `/` (workspace list).
5. Enter `Test Round 0.8` in "New workspace name" and click `Create`.
6. Click the new workspace card.
7. Click `New` (or "New note"), enter `notes/intro.md`, click `Create`.
8. In the Markdown source, enter:
   ```markdown
   ---
   type: Note
   ---

   ## Goals

   - Build a Markdown-first PKM.
   - Use AI as an inspectable capability.
   ```
9. Press `Ctrl+S` and wait for the Save button to disable and the `Saving…`/`Unsaved` indicators to settle.
10. Click `New` again, enter `notes/Roadmap.md`, click `Create`.
11. Replace content with:
    ```markdown
    ---
    type: Note
    status: active
    tags: [planning, v1]
    ---

    # Roadmap

    This is the project roadmap.
    ```
12. Press `Ctrl+S` to save.
13. Click `notes/intro.md` in the file tree, and add a wikilink `[[notes/Roadmap]]` in the References section. Press `Ctrl+S`.

### Pass/fail criteria

- A.1 Registration redirects to `/` and the workspace list appears.
- A.2 `Test Round 0.8` appears in the workspace list.
- A.3 File tree shows `notes/intro.md` and `notes/Roadmap.md`.
- A.4 After saving `intro.md`, the preview pane and right panel show an outgoing link to `Roadmap.md` and no unresolved wikilink.
- A.5 `Roadmap.md` right panel shows a backlink from `intro.md` and properties `type: Note`, `status: active`, tags `planning` and `v1`.

## Flow B — Autosave

**Goal:** The editor persists content after a typing pause without requiring `Ctrl+S`.

1. Select `notes/intro.md`.
2. Place the cursor at the end of the Markdown source.
3. Type `\n\nAutosave test paragraph.`.
4. Wait at least 1 second without pressing `Ctrl+S`.

### Pass/fail criteria

- B.1 The header shows a `Saving…` indicator after the pause.
- B.2 The `Save` button becomes disabled (or `Unsaved` disappears).
- B.3 Refreshing the page and re-selecting `intro.md` shows the added paragraph still present.

## Flow C — Wikilink autocomplete

**Goal:** Typing `[[` inside the editor suggests notes and inserts a wikilink.

1. Select `notes/intro.md`.
2. In the Markdown source, type `[[` at the end of a line.
3. Type `road`.
4. Wait for the autocomplete dropdown to show `Roadmap` (or `notes/Roadmap.md`).
5. Press `Tab` or `Enter` (or click the dropdown item) to insert the link.
6. Add a closing `]]` only if the inserted text does not already include it.
7. Wait for autosave or press `Ctrl+S`.

### Pass/fail criteria

- C.1 The autocomplete dropdown appears after typing `[[road`.
- C.2 Selecting the candidate inserts a valid wikilink (e.g. `[[notes/Roadmap|road]]` or `[[notes/Roadmap]]`).
- C.3 The preview renders the link as a clickable button and the right panel updates the outgoing link.

## Flow D — Unlinked mentions

**Goal:** The right panel lists other notes whose titles appear in the current note body, even without an explicit wikilink.

1. Select `notes/Roadmap.md`.
2. Add the text `Also see the intro note for context.` to the body.
3. Save (Ctrl+S or wait for autosave).
4. Look at the right panel "Unlinked mentions" section.

### Pass/fail criteria

- D.1 The "Unlinked mentions" panel lists `intro.md` (because the word "intro" appears in Roadmap's body).
- D.2 Clicking the mention navigates to `intro.md`.

## Flow E — Duplicate, archive, and restore

**Goal:** Notes can be duplicated, archived (soft-deleted), hidden from the active tree, and restored.

1. In the file tree, hover over `notes/Roadmap.md` and click the `dup` button.
2. Confirm a new note `notes/Roadmap (copy).md` appears in the tree.
3. Hover over `notes/Roadmap (copy).md` and click the `arch` button.
4. Confirm `notes/Roadmap (copy).md` disappears from the active file tree.
5. At the bottom of the sidebar, check "Show archived".
6. Confirm the archived note appears with a `restore` button.
7. Click `restore`.
8. Uncheck "Show archived" and confirm the restored note is back in the active tree.

### Pass/fail criteria

- E.1 Duplicate creates `notes/Roadmap (copy).md` with the same content.
- E.2 Archive removes the note from the active file tree.
- E.3 "Show archived" reveals the archived note.
- E.4 Restore returns the note to the active file tree.

## Flow F — Search palette (Command-K)

**Goal:** The search/command palette finds a note by title/content.

1. Press `Ctrl+K`.
2. Type `roadmap`.
3. Wait for results to filter, then press `Enter` or click the `Roadmap` result.

### Pass/fail criteria

- F.1 The palette opens with placeholder "Search notes, titles, or content…".
- F.2 Typing `roadmap` shows `notes/Roadmap.md`.
- F.3 Selecting it navigates to `notes/Roadmap.md`.

## Flow G — Graph view

**Goal:** The graph renders nodes and edges scoped to the current workspace.

1. Click the `Graph` link in the header.
2. Wait for the canvas.

### Pass/fail criteria

- G.1 The page shows `2 notes · 1 links`.
- G.2 Nodes for `intro.md` and `Roadmap.md` are visible.
- G.3 At least one edge connects the two nodes.

## Flow H — Attachment upload and download

**Goal:** A user can upload and download an attachment within a workspace.

1. Create a small file `/tmp/pkm_test_attachment.txt` with content `PKM round 0.8 attachment test`.
2. Click `Attachments` in the header.
3. Choose `/tmp/pkm_test_attachment.txt` and upload.
4. Wait for the attachment to appear in the list.
5. Click `Download` and verify the content.

### Pass/fail criteria

- H.1 The attachments page lists `pkm_test_attachment.txt`, `text/plain`, size `29 B`.
- H.2 Downloading returns exactly `PKM round 0.8 attachment test`.

## Flow I — Workspace isolation and switching

**Goal:** A user's workspaces and notes are isolated.

1. Return to `/`.
2. Create a second workspace named `Other Workspace`.
3. Create a note `private.md` with content `# Private`.
4. Switch back to `Test Round 0.8` via the workspace dropdown.
5. Confirm `private.md` is not in the file tree and only `intro.md`/`Roadmap.md` are visible.

### Pass/fail criteria

- I.1 The workspace dropdown lists both workspaces.
- I.2 `Test Round 0.8` shows `notes/intro.md` and `notes/Roadmap.md`, not `private.md`.
- I.3 `Other Workspace` shows `private.md`, not the Test Round 0.8 notes.

## Flow J — Logout and re-login

**Goal:** Logout invalidates the session and re-login restores access.

1. Click `Logout`.
2. Expect redirect to `/login`.
3. Sign in with the same credentials.
4. Confirm both workspaces are listed and `Test Round 0.8` still contains the notes.

### Pass/fail criteria

- J.1 `/` redirects to `/login` after logout.
- J.2 Re-login restores both workspaces.
- J.3 `Test Round 0.8` still shows `notes/intro.md` and `notes/Roadmap.md`.

## Flow K — Curl verification of isolation, graph leakage, and CSP

**Goal:** HTTP-level checks confirm the protections the UI relies on.

1. `curl -I http://localhost:3000/login` and capture `Content-Security-Policy`.
2. Verify CSP contains `nonce-...` and does not contain `unsafe-inline` or `unsafe-eval`; verify `X-Powered-By` is absent.
3. Register `u1` and `u2` via `curl` and capture their session cookies.
4. As `u1`, create a workspace and note; record `WS1` and `D1`.
5. As `u2`, attempt `GET /workspaces/{WS1}/documents`, `GET /workspaces/{WS1}/documents/{D1}`, `GET /workspaces/{WS1}/graph`, `GET /workspaces/{WS1}/attachments` (if attachment id available). Expect `403`.
6. As `u2`, create their own workspace/note; fetch both users' graph endpoints.
7. Verify the graph node ID sets are disjoint.

### Pass/fail criteria

- K.1 CSP header is present and nonce-based.
- K.2 `script-src` contains `nonce-...` and no `unsafe-inline`/`unsafe-eval`.
- K.3 `X-Powered-By` header is absent.
- K.4 `u2` receives HTTP `403` for all cross-workspace endpoints.
- K.5 The graph JSON node ID intersection between `u1` and `u2` is empty.

## Recording annotations

- `setup`: "Latest `origin/devin/pkm-v1-search-ai` checked out; Docker Compose, AI service, API production build, and web production build running; health checks pass."
- `test_start` before each flow above.
- `assertion` after each meaningful check with the result passed/failed.

## Known issues to watch for

- The production API build previously failed with `bcrypt.hash is not a function` due to a namespace import of `bcryptjs`. If this reappears, the source fix did not take effect.
- The create-note dialog previously required careful focus handling; it now uses `autoFocus` on the path input.
