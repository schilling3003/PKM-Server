# PKM v1 `devin/pkm-v1-search-ai` — Round 1.7 test report

Branch under test: `devin/pkm-v1-search-ai`  
Commit tested: `87f0a48` (`docs: round 1.7 log and workstream 19-21 ownership`)  
Test date: 2026-08-11  
Recording: `/home/ubuntu/screencasts/pkm-round-1-7-golden-path/pkm-round-1-7-golden-path-edited.mp4`

## Executive summary

All quality gates pass. The Docker stack starts cleanly, the source-based CSP header is present on both `/login` and `/nonexistent`, and `_next/static` chunks are served by `next start` with `NEXT_BUILD_OUTPUT` unset. The primary golden-path flows work: registration, workspace/note creation, wikilink autocomplete without a partial-query alias, search palette, duplicate/archive/restore, revisions save/restore, graph view with an edge, attachments list, and logout/re-login.

One issue was found: `handleArchive` in `apps/web/app/workspaces/[id]/page.tsx` removes the archived document from the local `documents` array instead of mapping it to the archived row returned by the API. As a result, the `Show archived` toggle does not appear immediately after a note is archived (it reappears after a page reload, because `listDocuments()` defaults to `includeArchived=true`). The `handleRestore` fix in the same file works: restoring an archived note returns it to the active tree without leaving a duplicate entry in the archived list.

## Quality gates

| Gate | Result |
|------|--------|
| `pnpm -r build` | Passed (web built with `Proxy (Middleware)`, regular `.next` output, not standalone) |
| `pnpm -r typecheck` | Passed |
| `pnpm -r lint` | Passed |
| `pnpm -r test` | Passed (`apps/api` 42 tests, `packages/markdown` 18 tests, `packages/okf` 7 tests) |
| `pnpm audit --prod` | Passed (no known vulnerabilities) |

## Stack health and production CSP

- `curl http://localhost:8000/health` → `{"status":"ok","version":"0.1.0"}`
- `curl http://localhost:4000/health` → `{"status":"ok","version":"0.1.0"}`
- `curl -I http://localhost:3000/login` returned `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' http://localhost:9000 data: blob:; connect-src 'self' http://localhost:4000; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`
- `curl -I http://localhost:3000/nonexistent` returned `404` with the same CSP header.
- A `_next/static` JS chunk extracted from `/login` returned `200`.

## Browser golden path

1. **Registration / workspace creation**: Created `test-r17-20260811@example.com` / `TestPass123!` and `Test Workspace R1.7`.
2. **Note creation**: Created `cat.md` and `dog.md` with frontmatter tags. The note editor populated Properties, Outline, and Index status.
3. **Wikilink autocomplete**: Typing `[[do` showed the dropdown; selecting `dog.md` inserted `[[dog]]` (no partial-query alias). The preview rendered a link to `dog.md` and the right sidebar showed `dog` under **Outgoing**.
4. **Search palette**: Opened with `Ctrl+K`; typing `cat` and pressing `Enter` opened `cat.md`.
5. **Duplicate / archive / restore**: `dup` on `dog.md` created `dog (copy).md`. `arch` on `dog (copy).md` removed it from the active tree. `Show archived` was then toggled via keyboard and the `restore` button returned `dog (copy).md` to the active tree without leaving a duplicate in the archived list.
6. **Revisions**: Multiple saves produced distinct revisions in the right sidebar. Restoring the oldest revision reverted `cat.md` to the original default content, added a new revision entry at the top, and updated the per-note Index status.
7. **Graph view**: `/workspaces/{id}/graph` rendered `cat`, `dog`, `dog (copy)`, and `rabbit` nodes with an edge between `cat` and `dog`.
8. **Attachments**: The attachments page listed uploaded files. The third rapid upload was rate-limited (`429`) via the API; downloading an attachment returned `200`.
9. **Logout / re-login**: Logout redirected to `/login`; signing in again returned to the workspace list.

## Key screenshots

| Re-login workspace list | Note with wikilink and outgoing link |
|---|---|
| ![re-login](https://app.devin.ai/attachments/9a454e9e-c4b6-4a7c-ba41-fefb2e0d1dd2/ss_cc49aca4.png) | ![wikilink](https://app.devin.ai/attachments/f2c85ada-44cd-48d9-9f01-00038e98ee27/ss_48fee795.png) |

| Revisions panel after multiple saves | Graph view with cat-dog edge |
|---|---|
| ![revisions](https://app.devin.ai/attachments/d1dc6f04-4b9d-4d16-8845-1e61c5bcaa44/ss_93e01c00.png) | ![graph](https://app.devin.ai/attachments/67001a50-54e4-4d43-a195-7924f411a050/ss_6c49bf05.png) |

| Attachments list | Login page after logout |
|---|---|
| ![attachments](https://app.devin.ai/attachments/5695cead-c66f-49f2-8da9-8d5b999f6210/ss_f043df57.png) | ![logout](https://app.devin.ai/attachments/f84944b0-7494-4c60-b44b-41f2e9865e2b/ss_6907bb93.png) |

| After archive: `Show archived` hidden (bug) | After restore: `dog (copy)` back in active tree |
|---|---|
| ![archive-bug](https://app.devin.ai/attachments/30e1a1c0-28b4-45aa-ab8c-e52515eb9ce3/ss_502299fb.png) | ![restore-ok](https://app.devin.ai/attachments/5812a444-caf1-48fc-bffb-9bbc58e93504/ss_b0b449c2.png) |

## API / curl checks

- **Semantic search** `GET /workspaces/{ws}/search?q=cat` returned `cat.md`, `dog.md`, and `dog (copy).md` with numeric `score`s.
- **Ask** `POST /workspaces/{ws}/ask` returned citations for `cat.md`/`dog.md` and the expected no-LLM warning.
- **OKF export** returned `version 0.2` with `concepts` for `cat.md`, `dog.md`, and `dog (copy).md`.
- **OKF import** of `rabbit.md` (with `[[cat|the cat]]`) returned `imported: 1`; the created note contains `[the cat](cat.md)`.
- **Attachment rate limiting**: three rapid uploads returned `201`, `201`, `429`; the first attachment downloaded with `200`.
- **Workspace isolation**: a second user received `403 Forbidden` when requesting documents from the first user's workspace.

## Issues found

1. **`handleArchive` removes the archived note from local state**, so the `Show archived` button does not appear immediately after archiving a note. After a page reload the button appears because `listDocuments()` fetches `includeArchived=true` by default. The fix is to map the archived row into `documents` instead of filtering it out:
   ```ts
   setDocuments((prev) =>
     prev
       .map((doc) => (doc.id === d.id ? d : doc))
       .sort((a, b) => a.path.localeCompare(b.path))
   );
   ```
   This would mirror the `handleRestore` fix.

2. **Small buttons are hard to hit in the test harness** (`dup`, `arch`, `Show archived`, right-sidebar `Restore`). They worked via keyboard `Tab`/`Enter` and the underlying API calls, so this appears to be a harness coordinate-scaling issue rather than a product bug. Mouse clicks on the `Search` header button and `Attachments` header link were also unreliable in some runs.

## Shutdown

- Stopped web, API, and AI processes.
- `docker compose down -v` removed all containers, volumes, and the default network.
- Ports 3000, 4000, and 8000 were confirmed free.
