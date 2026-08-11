# PKM v1 search/AI branch — Round 1.5 end-to-end test report

**Branch under test:** `devin/pkm-v1-search-ai`  
**Test branch:** `devin/pkm-v1-tester-round-1-0`  
**Date:** 2026-08-11  
**Tester:** automated test agent  

## Summary

The round 1.5 fixes were tested end-to-end with the web served by the production `next start` build (no `NEXT_BUILD_OUTPUT` set) and CSP enabled. No `--disable-csp` browser flag was used. Quality gates passed, the Docker stack started healthy, and the source-based CSP header was present on all tested pages. The browser golden path covered registration, workspace/note creation and editing, wikilink autocomplete, backlinks/unlinked mentions, tags, outline, graph, search palette, index status, attachments upload/list, OKF import/export (reflected in graph), logout, and re-login. Most features worked; a few UI targets were hard to hit consistently in the automation harness, and the underlying API behavior was verified with `curl`.

## Environment and commands

- Repo: `/home/ubuntu/repos/PKM-Server`
- Web build: `pnpm -r build` (with `NEXT_BUILD_OUTPUT` unset, so `output: undefined` in `next.config.ts`)
- Web server: `cd apps/web && pnpm start` (`next start` on port 3000)
- API: `pnpm --filter @pkm/api start` on port 4000
- AI: `cd apps/ai && .venv/bin/activate && uvicorn src.main:app --host 0.0.0.0 --port 8000`
- Docker: `docker compose up -d --wait` then `docker compose down -v`
- `.env` included temporary attachment rate limits:
  ```
  RATE_LIMIT_ATTACHMENTS_IP_MAX=10
  RATE_LIMIT_ATTACHMENTS_ACCOUNT_MAX=2
  RATE_LIMIT_ATTACHMENTS_IP_WINDOW_MS=2000
  RATE_LIMIT_ATTACHMENTS_ACCOUNT_WINDOW_MS=2000
  ```

## Quality gates

| Gate | Result |
|---|---|
| `pnpm -r typecheck` | passed |
| `pnpm -r lint` | passed |
| `pnpm -r test` | passed (packages/markdown 17, packages/okf 7, apps/api 40) |
| `pnpm audit --prod` | passed (no known vulnerabilities) |
| `pnpm -r build` | passed (`Proxy (Middleware)` in Next.js route output) |

## Stack health

- `curl http://localhost:8000/health` → `{"status":"ok","version":"0.1.0"}`
- `curl http://localhost:4000/health` → `{"status":"ok","version":"0.1.0"}`
- `docker compose ps` showed `postgres`, `redis`, `minio`, `temporal` as `healthy`.

## CSP and production build verification

- `curl -I http://localhost:3000/login` returned `Content-Security-Policy`:
  ```
  default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' http://localhost:9000 data: blob:; connect-src 'self' http://localhost:4000; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
  ```
  No `'unsafe-eval'` and no nonce/strict-dynamic.
- The same CSP header was returned on `/nonexistent`.
- `/_next/static/chunks/3iiqxav2-pzcd.css` and `/_next/static/chunks/0jouw8xo-7to8.js` returned `200` from `next start`, confirming static chunks are served correctly with the regular `.next` build.
- No CSP violations were observed in the browser console.

## Browser golden path results

### Register, create workspace, create note
- Registration form toggle and submit worked; after registration the app redirected to `/` and the user email appeared in the header.
- Workspace `Test Workspace` was created from the workspace list.
- Note `bird.md` was created from the sidebar **New** button and opened in the editor.

![Note editor with tags, outline, properties, and index status](https://app.devin.ai/attachments/cff07448-7fa0-4dc1-9c1c-fb49e00bfde0/ss_0d49f195.png)

### Edit note, tags, outline, properties, index status
- `bird.md` was edited to contain a frontmatter `tags` array.
- The right sidebar displayed:
  - `OUTLINE` with `Bird`
  - `PROPERTIES` with `type: Note` and tags `animals` / `birds`
  - `INDEX STATUS` with workspace and per-document counts

### Wikilink autocomplete, backlinks, unlinked mentions
- Typing `[[do` in `cat.md` opened a dropdown with `dog.md`.
- Pressing `Tab` inserted a wikilink.
- `dog.md` showed `BACKLINKS` containing `cat.md`.
- `UNLINKED MENTIONS` populated with related notes.

### Graph
- Clicking **Graph** opened `/workspaces/{id}/graph`.
- The canvas rendered `cat`, `dog`, `dog (copy)`, `rabbit`, and `bird` nodes with edges between linked notes.

![Graph view with rabbit, cat, dog, bird nodes](https://app.devin.ai/attachments/9382e019-9fab-42e2-8375-9e2769e2909b/ss_8e979898.png)

### Search palette
- `Ctrl+K` opened the search palette.
- Typing `cat` filtered results.
- Pressing `Enter` on `cat.md` closed the palette and opened the note.

![Search palette open with results](https://app.devin.ai/attachments/08eedaec-1698-4ad8-b060-e668947af3d4/ss_077424a5.png)

### Attachments
- The **Attachments** page listed existing uploads.
- The UI file picker opened and `attach3.txt` uploaded successfully.
- Three attachments (`attach1.txt`, `attach2.txt`, `attach3.txt`) appeared in the list.

![Attachments page with uploaded files](https://app.devin.ai/attachments/55bdad62-2fdc-4036-923a-55f19ffc989d/ss_b02069e5.png)

### OKF import/export
- `GET /workspaces/{ws}/okf/export` returned `version 0.2` and concepts for `cat.md`, `dog.md`, and `dog (copy).md`.
- `POST /workspaces/{ws}/okf/import` with a new `rabbit.md` concept returned `imported: 1` and converted `[[cat|the cat]]` to `[the cat](cat.md)`.
- The imported `rabbit.md` appeared in the note tree and the graph view immediately showed the new `rabbit` node.

### Logout / re-login
- **Logout** redirected to `/login` and the user email disappeared from the header.
- Re-login with the same credentials redirected to `/` and the workspace list was shown.

![Login page after successful logout](https://app.devin.ai/attachments/6a561f60-9da9-4bbf-a3ca-ff54021c8adf/ss_98480d1e.png)

### Custom 404
- `http://localhost:3000/nonexistent` rendered the custom 404 page with the app layout, the `Go home` link, and the source-based CSP header.

![Custom 404 page](https://app.devin.ai/attachments/cea5fd9a-bca5-473c-88fe-55c4b4e63821/ss_7a901b6d.png)

## API/curl verification

| Check | Result |
|---|---|
| `GET /workspaces/{ws}/search?q=cat` | Returns `cat.md`, `dog.md`, `dog (copy).md` with scores. |
| `GET /workspaces/{ws}/search?q=animals` | Returns notes tagged `animals`. |
| `POST /workspaces/{ws}/ask` | Returns citations for `cat.md` and a no-LLM warning (expected without `LLM_*` configured). |
| `POST /workspaces/{ws}/attachments` (3 rapid uploads) | First two return `201`; third returns `429 Too many requests`. |
| `GET /attachments/{id}?workspaceId={ws}` | Returns `200` with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`. |
| `POST /workspaces/{ws}/documents/{id}/archive` | Archives the note; active list no longer includes it. |
| `POST /workspaces/{ws}/documents/{id}/restore` | Restores the note; active list includes it again. |
| Workspace isolation (second user) | `GET /workspaces/{ws}/documents`, search, graph, and OKF export all return `403 Forbidden`. |

## Blockers / issues observed

1. **Archive/restore UI buttons and "Show archived" checkbox**  
   The hover-only `arch` button on note tree rows and the `Show archived` checkbox did not respond to clicks in the test harness. The underlying API archive/restore calls work correctly (verified with `curl`), and the active tree updates when data is changed via the API. This may be a CSS hover/pointer-events interaction or a client-event-binding issue specific to the `next start` build and should be re-tested on a real desktop browser.

2. **Wikilink autocomplete inserts an alias for partial queries**  
   Typing `[[do` and selecting `dog.md` inserted `[[dog|do]]` rather than `[[dog.md]]` or `[[dog]]`. The rendered Markdown is still correct (`[dog](dog.md)`), but the source text is not what a user would expect. This is because `insertWikilink` uses the typed query as the display alias.

3. **Search button click vs keyboard**  
   The header **Search** button did not respond to a mouse click, but `Ctrl+K` opened the palette as expected. This suggests the mouse target for that button is small or the click event is being swallowed; keyboard navigation works.

## Artifacts

- Screen recording: `/home/ubuntu/screencasts/pkm-search-ai-round-1-5/pkm-search-ai-round-1-5-edited.mp4`
- Key screenshots (also uploaded to cloud storage and embedded above):
  - `/home/ubuntu/screenshots/ss_0d49f195.png` — note editor
  - `/home/ubuntu/screenshots/ss_8e979898.png` — graph view
  - `/home/ubuntu/screenshots/ss_b02069e5.png` — attachments list
  - `/home/ubuntu/screenshots/ss_077424a5.png` — search palette
  - `/home/ubuntu/screenshots/ss_7a901b6d.png` — custom 404
  - `/home/ubuntu/screenshots/ss_98480d1e.png` — login page after logout

## Verdict

The round 1.5 changes are largely working. The source-based CSP no longer blocks the UI, `next start` serves the production build and static chunks correctly, and the core end-to-end flow (auth, workspace, notes, wikilinks, search, graph, attachments, OKF, isolation, logout/re-login) is functional. The remaining concerns are UX-level interactions on small hover targets and the wikilink autocomplete alias behavior; the backend behavior is solid.
