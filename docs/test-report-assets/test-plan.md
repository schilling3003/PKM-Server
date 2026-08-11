# PKM v1 `devin/pkm-v1-search-ai` Golden-Path Test Plan

Branch under test: `devin/pkm-v1-search-ai`  
Local stack (pre-running):
- Postgres/Redis/MinIO/Temporal via Docker Compose (healthy)
- API: http://localhost:4000
- AI service: http://localhost:8000 (`EMBEDDING_PROVIDER=sentence-transformers`)
- Web: http://localhost:3000

## Preconditions / Setup

1. Confirm all services healthy (`curl http://localhost:8000/health`, `curl http://localhost:4000/health`, `curl -I http://localhost:3000`).
2. Open Google Chrome and navigate to `http://localhost:3000`.
3. Maximize browser window.
4. Start screen recording (`recording_start`).
5. Use a unique test account to avoid stale-data conflicts, e.g. `gp-<timestamp>@test.local` / `TestPass123!`.

## Browser Golden Path

### 1. Register a new user
- Navigate to `http://localhost:3000/login`.
- Click the toggle text **"Need an account? Register"** (`apps/web/app/login/page.tsx:79`).
- Fill Email and Password (≥8 chars) and click **"Create account"**.
- **Pass:** redirected to `/` and the workspace list heading **"Workspaces"** is visible (`apps/web/app/page.tsx:48`).

### 2. Create a workspace
- On `/`, type **"Golden Path WS"** in the **"New workspace name"** input and click **Create** (`apps/web/app/page.tsx:35-45`).
- **Pass:** workspace appears in the list with its name and a UUID. Click it to open `/workspaces/{id}`.

### 3. Create, edit and save notes
- In `/workspaces/{id}`, click sidebar **New** button (`apps/web/app/workspaces/[id]/page.tsx:839-846`).
- In the **Create note** dialog, type `animals.md` and click **Create** (`apps/web/app/workspaces/[id]/page.tsx:1171-1202`).
- The editor opens with default content `---\ntype: Note\n---\n\n`.
- Replace the editor content with:
  ```markdown
  ---
  type: Note
  tags: [animals]
  ---

  # Animals

  Animals include cats and dogs.
  ```
- Click **Save** (`apps/web/app/workspaces/[id]/page.tsx:984-991`).
- **Pass:** "Unsaved" disappears, preview pane renders heading **"Animals"**, and the note is listed as `animals.md`.
- Repeat to create `cats.md` with:
  ```markdown
  ---
  type: Note
  tags: [cats, pets]
  ---

  # Cats

  Cats are small furry #feline animals.
  ```
- Save. **Pass:** note appears, preview shows heading and the `#feline` tag text.

### 4. `[[` wikilink autocomplete
- Open `cats.md` in the editor.
- On a new line type `See [[anim`.
- **Pass:** an autocomplete dropdown appears below the cursor listing `animals.md` (`apps/web/app/workspaces/[id]/page.tsx:1019-1036`).
- Press `ArrowDown` + `Enter` (or click the candidate).
- **Pass:** editor now contains a wikilink to `animals.md` (e.g. `[[animals.md|animals]]` or `[[animals]]` depending on alias), and the dropdown closes.
- Save. In the right sidebar, **Outgoing** shows `animals.md`.

### 5. Backlinks and unlinked mentions
- Open `animals.md`.
- **Pass:** right sidebar **Backlinks** lists `cats.md` (`apps/web/app/workspaces/[id]/page.tsx:1084-1104`).
- Create `dogs.md` with body `Dogs are animals like cats.` (no wikilink).
- Save.
- Open `dogs.md`.
- **Pass:** right sidebar **Unlinked mentions** lists both `animals.md` and `cats.md` (`apps/web/app/workspaces/[id]/page.tsx:1107-1125`).
- Open `cats.md`.
- **Pass:** **Unlinked mentions** lists `dogs.md` because its body contains the word "cats".

### 6. Tags, outline, graph
- With `cats.md` selected, expand **Properties** if collapsed.
- **Pass:** tags rendered include `cats` and `pets` (from frontmatter) and `feline` (from body) (`apps/web/app/workspaces/[id]/_components/FrontmatterPanel.tsx:77-93`; `extractTags` in `packages/markdown/src/links.ts:62-69`).
- **Pass:** **Outline** panel lists heading **"Cats"** (`apps/web/app/workspaces/[id]/_components/OutlinePanel.tsx:38-65`).
- Click the header **Graph** link (`apps/web/app/workspaces/[id]/page.tsx:974-980`).
- **Pass:** `/workspaces/{id}/graph` loads and the canvas/graph is rendered (not stuck on "Loading graph…") (`apps/web/app/workspaces/[id]/graph/page.tsx:71-75`; `GraphView.tsx` canvas).

### 7. Search including semantic search
- Return to the workspace page.
- Click the header **Search** button or press `Ctrl/Cmd+K` (`apps/web/app/workspaces/[id]/page.tsx:938-962`; `SearchPalette.tsx:18`).
- Type `cat`.
- **Pass:** Search palette shows results and `cats.md` is listed (`hooks/useSearch.ts` -> `searchAll` -> `/search?q=cat`; `apps/api/src/search.ts:32-66` hybrid full-text + semantic).
- Clear and type `animals`.
- **Pass:** results include `animals.md` and likely `cats.md`/`dogs.md` (the word appears in them). Semantic vector hits should also surface conceptually related notes.

### 8. Index status panel
- With a note selected, look at the right sidebar **Index status** panel (`apps/web/app/workspaces/[id]/page.tsx:1140-1160`).
- **Pass:** `document_count` equals number of saved notes, `indexed_document_count` > 0, `embedded_chunk_count` > 0 after the auto-save/index cycle (`apps/api/src/documents.ts:394-409`).
- Per-note status should read e.g. `This note: 1 chunk(s), 1 embedded` and not `stale`.

### 9. Duplicate / archive / restore a note
- Hover `cats.md` in the sidebar, click the **dup** button (`apps/web/app/workspaces/[id]/page.tsx:675-683`).
- **Pass:** a new note `cats (copy).md` appears and is opened.
- Hover `cats (copy).md`, click **arch** (`apps/web/app/workspaces/[id]/page.tsx:684-693`).
- **Pass:** `cats (copy).md` disappears from the active note list.
- Scroll sidebar, check **Show archived**, then click **restore** on the archived note (`apps/web/app/workspaces/[id]/page.tsx:879-913`).
- **Pass:** `cats (copy).md` reappears in the active list.

### 10. OKF export and import (browser-assisted + curl)
- Copy the workspace UUID from the URL or sidebar.
- Run curl export:
  ```bash
  curl -s http://localhost:4000/workspaces/{ws}/okf/export | jq .
  ```
  **Pass:** returns JSON with `version`/`okfVersion` "0.2", `workspace` name, `id`, ISO `timestamp`, and `concepts` array containing exported notes with wikilink syntax (`apps/api/src/okf.ts:119-161`).
- Run curl import with a new concept:
  ```bash
  curl -s -X POST http://localhost:4000/workspaces/{ws}/okf/import \
    -H 'Content-Type: application/json' \
    -d '{"version":"0.2","concepts":[{"path":"birds.md","metadata":{"type":"Note","tags":["birds"]},"document":{"body":"# Birds\n\nBirds are [[animals]]."}}]}'
  ```
  **Pass:** response `imported` ≥ 1.
- Reload `/workspaces/{ws}` in the browser.
- **Pass:** `birds.md` appears and its body is stored as standard Markdown `[Birds are animals](animals.md)` while the export round-trips back to `[[animals]]` (`apps/api/src/okf.ts:47-91`; `wikiToStandard`/`standardToWiki` in `packages/markdown/src/links.ts:92-161`).

### 11. Upload and view an attachment
- Create a small test file on disk: `/home/ubuntu/test-attach.txt` containing `PKM attachment test`.
- Click the header **Attachments** link (`apps/web/app/workspaces/[id]/page.tsx:966-972`).
- On `/workspaces/{id}/attachments`, click **choose a file**, select `/home/ubuntu/test-attach.txt` (`apps/web/components/AttachmentUpload.tsx:83-89`).
- **Pass:** file appears in the attachments list with content type, size, and a **Download** button (`apps/web/app/workspaces/[id]/attachments/page.tsx:101-125`).
- Click **Download**.
- **Pass:** browser opens/downloads the file and content matches `PKM attachment test` (`apps/api/src/attachments.ts:349-373`).

### 12. Log out and re-login
- Click **Logout** in the top-right header (`apps/web/components/UserNav.tsx:32-37`).
- **Pass:** redirected to `/login`.
- Enter the same credentials and click **Sign in** (`apps/web/app/login/page.tsx:66-72`).
- **Pass:** redirected back to `/` and the **"Golden Path WS"** workspace is still listed.

## cURL / API Verification

Run from `/home/ubuntu/repos/PKM-Server` (or any shell with the stack reachable). Use a cookie jar for authenticated endpoints.

1. **Health**
   ```bash
   curl -s http://localhost:8000/health
   curl -s http://localhost:4000/health
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
   ```
   Expect `{status:"ok"...}` for 8000/4000; `200` for 3000.

2. **Auth**
   ```bash
   curl -s -c jar.txt -b jar.txt -X POST http://localhost:4000/auth/register \
     -H 'Content-Type: application/json' -d '{"email":"curl-<ts>@test.local","password":"CurlPass1!"}'
   curl -s -b jar.txt http://localhost:4000/auth/me
   ```
   Expect 201 and user object; `/auth/me` returns the same user.

3. **Workspace creation**
   ```bash
   WS=$(curl -s -b jar.txt -X POST http://localhost:4000/workspaces -H 'Content-Type: application/json' -d '{"name":"Curl WS"}' | jq -r '.id')
   ```
   Expect UUID and 201.

4. **Note CRUD**
   ```bash
   DOC=$(curl -s -b jar.txt -X POST "http://localhost:4000/workspaces/$WS/documents" -H 'Content-Type: application/json' -d '{"path":"api-note.md","content":"---\ntype: Note\n---\n\n# Hello\n"}' | jq -r '.id')
   curl -s -b jar.txt "http://localhost:4000/workspaces/$WS/documents"
   curl -s -b jar.txt -X PUT "http://localhost:4000/workspaces/$WS/documents/$DOC" -H 'Content-Type: application/json' -d '{"content":"---\ntype: Note\n---\n\n# Hello\n\nUpdated."}'
   curl -s -b jar.txt "http://localhost:4000/workspaces/$WS/documents/$DOC/backlinks"
   curl -s -b jar.txt -X DELETE "http://localhost:4000/workspaces/$WS/documents/$DOC"
   ```
   Expect create/update list operations to succeed and count drops after delete.

5. **Search**
   ```bash
   curl -s -b jar.txt "http://localhost:4000/workspaces/$WS/search?q=cat&limit=10"
   curl -s -b jar.txt "http://localhost:4000/workspaces/$WS/search?q=animals&limit=10"
   ```
   Expect JSON array; query `animals` returns the note containing the word; `cat` returns conceptually related notes if semantic indexing is working.

6. **OKF export/import**
   ```bash
   curl -s -b jar.txt "http://localhost:4000/workspaces/$WS/okf/export" | jq '.version, .workspace, (.concepts | length)'
   curl -s -b jar.txt -X POST "http://localhost:4000/workspaces/$WS/okf/import" -H 'Content-Type: application/json' -d '{"version":"0.2","concepts":[{"path":"okf-test.md","metadata":{"type":"Note"},"document":{"body":"Link to [[api-note|API note]]."}}]}'
   ```
   Expect `version` "0.2", workspace name, imported count 1.

7. **Attachment upload/download**
   ```bash
   echo 'curl attachment test' > /tmp/curl-attach.txt
   ATTACH=$(curl -s -b jar.txt -X POST "http://localhost:4000/workspaces/$WS/attachments" -F "file=@/tmp/curl-attach.txt" | jq -r '.id')
   curl -s -b jar.txt -o /tmp/curl-attach-down.txt "http://localhost:4000/attachments/$ATTACH?workspaceId=$WS"
   diff /tmp/curl-attach.txt /tmp/curl-attach-down.txt
   ```
   Expect uploaded attachment object, download success, and files identical.

## Success Criteria

- Every browser step produces the described UI state (visible in screenshots/recording).
- No error banners or console exceptions during the golden path.
- All curl health and API endpoints return expected HTTP codes and payloads.
- Semantic search returns results for both `cat` and `animals`.
- OKF import/export round-trips wikilinks without semantic loss.
- Workspace isolation is implicit: all created content is scoped to the new workspace.

## Evidence to Capture

- Screen recording of the entire browser session (saved under `/home/ubuntu` or repo).
- Screenshots:
  1. `/login` registration form.
  2. Home page after registration with workspace list.
  3. Workspace editor with `cats.md` open, wikilink autocomplete visible.
  4. Right sidebar showing Backlinks, Unlinked mentions, Tags, Outline, Index status.
  5. Graph view page.
  6. Search palette with `animals` query.
  7. Attachments page after upload.
  8. Login page after logout.
- Curl terminal output saved to `/home/ubuntu/pkm-curl-results.txt`.
