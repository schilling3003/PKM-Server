# PKM v1 round 0.8 end-to-end test plan

Branch under test: `origin/devin/pkm-v1-search-ai`
Environment: local Docker Compose stack (postgres, redis, minio, temporal) + AI service (port 8000) + API (port 4000) + web production build (port 3000)

## Setup state assumed before execution

- Local stack is healthy: `docker compose ps` reports postgres, redis, minio, temporal as `healthy`.
- `curl http://localhost:4000/health` returns `{"status":"ok","version":"0.1.0"}`.
- `curl http://localhost:8000/health` returns `{"status":"ok","version":"0.1.0"}`.
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` returns `200`.

## Flow A — Registration, login, workspace and note creation

**Goal:** Prove a new user can register, log in, create a workspace, create a note, edit and save Markdown, and see the file tree update.

### Steps

1. Open `http://localhost:3000/login`.
2. Click "Need an account? Register" to switch the form to registration.
3. Enter email `pkm-tester-20260811@example.com` and password `TestPass123!`.
4. Submit. Expect redirect to `/` (workspace list).
5. On the workspace list, enter `Test Round 0.8` in the "New workspace name" input and click `Create`.
6. Click the new workspace card to navigate to `/workspaces/{id}`.
7. Click the `New` button in the left sidebar, enter `notes/intro.md` in the dialog, and click `Create`.
8. Wait for the editor to load `intro.md`.
9. In the Markdown source textarea, append the following at the end of the default frontmatter:
   ```
   ## Goals
   
   - Build a Markdown-first PKM.
   - Use AI as an inspectable capability.
   
   ## References
   See also [[Roadmap]].
   ```
10. Press `Ctrl+S` (or click `Save`).
11. Click the `New` button again, enter `notes/roadmap.md`, and create it with content containing:
    ```
    ---
    type: Note
    status: active
    tags: [planning, v1]
    ---

    # Roadmap

    This is the project roadmap.
    ```
12. Return to `intro.md` by clicking it in the file tree.

### Pass/fail criteria

- A.1 After submitting the registration form, the browser URL is `/` and the page shows the "Workspaces" heading and the `Create` button (not the login form).
- A.2 The new workspace `Test Round 0.8` appears in the list immediately after creation.
- A.3 The file tree in the left sidebar shows both `notes/intro.md` and `notes/roadmap.md`.
- A.4 After editing `intro.md` and pressing `Ctrl+S`, the "Unsaved" indicator disappears and the right preview pane renders the new headings and `[[Roadmap]]` link.
- A.5 The right "Note details" panel for `intro.md` shows an outgoing link to `roadmap.md` and no "No outgoing links" text.
- A.6 The `roadmap.md` note details panel shows a backlink from `intro.md`.

## Flow B — Workspace isolation

**Goal:** Prove one user's workspaces and notes are not visible to another user.

### Steps

1. Open a second browser context / incognito window to `http://localhost:3000/login`.
2. Register a second account with email `pkm-tester-2-20260811@example.com` and password `TestPass123!`.
3. Create a workspace named `Other Workspace`.
4. Create a note `private.md` with content `# Private`.
5. In the first browser window, refresh the workspace list (`/`).
6. Switch the first browser to the second user's workspace URL by manually editing the address bar to `/workspaces/{other-workspace-id}`.

### Pass/fail criteria

- B.1 The first user's workspace list does not show `Other Workspace`.
- B.2 Navigating directly to the second user's workspace URL shows an error/blank/forbidden state or redirects to `/` rather than displaying `private.md`.
- B.3 The right panel and file tree do not contain `private.md`.

## Flow C — Search palette (Command-K)

**Goal:** Prove the search/command palette finds a note by title and by content.

### Steps

1. In the first browser window, inside `Test Round 0.8` workspace, click the `Search` button in the header (or press `Cmd+K` / `Ctrl+K`).
2. Type `roadmap` in the search input.
3. Press `Enter`.

### Pass/fail criteria

- C.1 The search palette opens and shows a query input with placeholder "Search notes, titles, or content…".
- C.2 While typing `roadmap`, the result list includes `roadmap.md`.
- C.3 Pressing `Enter` opens `roadmap.md` in the editor and the URL updates to `/workspaces/{id}?doc={roadmap-id}`.
- C.4 Closing the palette (Esc) and reopening it with no query shows the most recent notes.

## Flow D — Graph view

**Goal:** Prove the graph view renders nodes and edges scoped to the current workspace.

### Steps

1. In `Test Round 0.8` workspace, click the `Graph` button in the header.
2. Wait for the canvas to render.
3. Hover over nodes and observe labels.
4. Click the `Workspace` link to return to the note list.

### Pass/fail criteria

- D.1 The graph page loads and shows the canvas with the legend text "X notes · Y links" where X ≥ 2 and Y ≥ 1 (because `intro.md` links to `roadmap.md`).
- D.2 Nodes for `intro.md` and `roadmap.md` are visible (node labels or colors).
- D.3 There is at least one edge connecting the `intro.md` node to the `roadmap.md` node.
- D.4 No node from `Other Workspace` (e.g., `private.md`) appears in the graph.

## Flow E — Outline and tags/properties panels

**Goal:** Prove the right sidebar outline and frontmatter/tags/properties panels update with the active note.

### Steps

1. Select `roadmap.md`.
2. Look at the right panel under "Note details".
3. Expand the "Properties" section if collapsed.
4. Select `intro.md` and observe the outline section.
5. Click an outline heading to scroll the preview.

### Pass/fail criteria

- E.1 The right panel shows the `type: Note` tag and `status: active` property for `roadmap.md`.
- E.2 The tags `planning` and `v1` appear as pills in the right panel for `roadmap.md`.
- E.3 The outline section for `intro.md` lists at least `Goals` and `References` headings with correct indentation.
- E.4 Clicking an outline heading scrolls the preview pane to the corresponding heading.

## Flow F — Attachment upload and download

**Goal:** Prove a user can upload and download an attachment within a workspace.

### Steps

1. Create a small file `/tmp/pkm_test_attachment.txt` with content `PKM round 0.8 attachment test`.
2. In `Test Round 0.8` workspace, click `Attachments` in the header.
3. Click `choose a file`, select `/tmp/pkm_test_attachment.txt`, and upload.
4. Wait for the attachment to appear in the list.
5. Click `Download` for the attachment and observe the downloaded content.

### Pass/fail criteria

- F.1 The attachments page shows the uploaded file with filename `pkm_test_attachment.txt`, content type `text/plain`, and size `31 B`.
- F.2 Clicking `Download` triggers a download whose body equals `PKM round 0.8 attachment test`.
- F.3 The downloaded file is not accessible to the second user (cross-user attachment isolation; confirmed via curl in Flow H).

## Flow G — Logout and re-login

**Goal:** Prove logout invalidates the session and re-login restores access.

### Steps

1. Click the `Logout` button in the top-right user nav.
2. Expect redirect to `/login`.
3. Enter the first user's email and password and sign in.
4. Navigate to `/` and click `Test Round 0.8`.

### Pass/fail criteria

- G.1 After logout, the `/` URL redirects to `/login` or shows the login form.
- G.2 After re-login, the workspace list still contains `Test Round 0.8`.
- G.3 Opening `Test Round 0.8` still shows `notes/intro.md` and `notes/roadmap.md`.

## Flow H — Curl verification of workspace isolation, graph leakage, and CSP

**Goal:** Use HTTP-level checks to confirm the same protections the UI relies on.

### Steps

1. Use `curl -I http://localhost:3000/login` and capture the `Content-Security-Policy` header.
2. Verify the CSP contains a `nonce-` value and does not contain `unsafe-inline` or `unsafe-eval`.
3. Register `user1` and `user2` via `curl` (or reuse the UI session cookies) and capture their session cookies.
4. As `user1`, create a workspace and note; record the workspace ID `WS1` and note ID `D1`.
5. As `user2`, attempt `curl -b user2.jar http://localhost:4000/workspaces/{WS1}/documents` and `curl -b user2.jar http://localhost:4000/workspaces/{WS1}/graph`.
6. As `user2`, create their own workspace and note; fetch both users' graph endpoints.
7. Verify the graph node IDs are disjoint.

### Pass/fail criteria

- H.1 `Content-Security-Policy` header is present on `http://localhost:3000/login`.
- H.2 The `script-src` directive contains `nonce-` and neither `unsafe-inline` nor `unsafe-eval`.
- H.3 `X-Powered-By` header is absent.
- H.4 `user2` receives HTTP `403` for `GET /workspaces/{WS1}/documents`, `GET /workspaces/{WS1}/documents/{D1}`, and `GET /workspaces/{WS1}/graph`.
- H.5 The graph JSON for `user1` and `user2` has an empty intersection of node IDs.

## Recording annotations

- `setup`: "Local Docker Compose stack, AI service, API, and production web server are running; health checks pass."
- `test_start` before each flow above.
- `assertion` after each meaningful check with the result passed/failed.

## Known temporary setup note

The production API build (`pnpm --filter @pkm/api start`) fails with `bcrypt.hash is not a function` because the source uses a namespace import against `bcryptjs`'s default CommonJS export. For this test run the generated `apps/api/dist/auth.js` was temporarily patched to `import bcrypt from 'bcryptjs';` so registration/login could be exercised. This should be fixed in source and the test plan retested against an unmodified production build.
