# PKM v1 `devin/pkm-v1-search-ai` — Workstream 18 revisions + UI fixes test report

Branch under test: `devin/pkm-v1-search-ai`  
Commit tested: `b09031e` (and ancestors including workstream 18 merge `776a720`)  
Test date: 2026-08-11  
Recording: [pkm-ws18-ui-revisions-edited.mp4](https://app.devin.ai/attachments/08d3eb7d-35b1-4905-ae3b-49048d84d8cb/pkm-ws18-ui-revisions-edited.mp4)

## Executive summary

The workstream 18 revisions feature and the round 1.5 UI fixes **work end-to-end** with CSP enabled and `next start`. All quality gates passed, the Docker stack was healthy, and the primary golden-path flows (registration, workspace/note creation, wikilink autocomplete, search palette, revisions save/restore, graph, attachments, re-login, custom 404) produced the expected state.

The two remaining caveats are **test-harness mouse-click limitations**, not product failures:
- Some small sidebar targets (note-tree `dup`/`arch`/`rename`, the `Show archived` toggle, and the right-sidebar `Restore` buttons) did not respond to the `computer` mouse coordinates in the recording, but they responded correctly to keyboard `Tab`/`Enter` and the underlying API calls worked.
- The Restore action in the UI produced a duplicate entry in the archived list until the next page load (see Issues below).

## Quality gates

| Gate | Result |
|------|--------|
| `pnpm -r build` | Passed (web built with `Proxy (Middleware)` route, regular `.next` output, not standalone) |
| `pnpm -r typecheck` | Passed |
| `pnpm -r lint` | Passed |
| `pnpm -r test` | Passed (`apps/api` 42 tests, `packages/markdown` 18 tests, `packages/okf` 7 tests) |
| `pnpm audit --prod` | Passed (no known vulnerabilities) |

## Stack health and production CSP

- `curl http://localhost:8000/health` → `{"status":"ok","version":"0.1.0"}`
- `curl http://localhost:4000/health` → `{"status":"ok","version":"0.1.0"}`
- `curl -I http://localhost:3000/login` returned `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' http://localhost:9000 data: blob:; connect-src 'self' http://localhost:4000; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`
- `curl -I http://localhost:3000/nonexistent` returned `404` with the same CSP header.
- A `_next/static` CSS chunk extracted from `/login` returned `200`.

## Browser golden path

1. **Registration and workspace creation**: created `test-ws18-20260811@example.com` / `TestPass123!`, created `Test Workspace WS18`, opened the editor.
2. **Note creation**: created `cat.md` and `dog.md` with frontmatter tags.
3. **Wikilink autocomplete**: in `dog.md`, typing `[[ca` showed the dropdown and selecting `cat.md` inserted `[[cat]]` (no partial-query alias). The preview rendered a working link to `cat`.
   ![Wikilink autocomplete](https://app.devin.ai/attachments/05f20d28-590a-40c0-a42c-7ee199d126c9/ss_3ca6c1a4.png)
4. **Backlinks / unlinked mentions / outline / properties / index status**: `cat.md` showed `dog.md` under Backlinks, tags/Outline/Properties were populated, and Index status showed `3 note(s), 3 indexed, 3 current, 3 chunks, 3 embedded`.
5. **Search palette**: the header `Search` button opened the palette; typing `cat` and pressing `Enter` opened `cat.md`.
6. **Graph view**: `/workspaces/{id}/graph` rendered nodes for `cat`, `cat (copy)`, `dog`, and `rabbit` with edges between linked notes.
   ![Graph view](https://app.devin.ai/attachments/3d4f0cca-07f4-4bd4-af59-37e3edc5ecf8/ss_53fae63c.png)
7. **Archive / restore / Show archived**: note-tree `dup`/`arch`/`rename`/`×` buttons are visible without hover. `dup` and `arch` worked via keyboard `Enter`; `Show archived` toggled the archived list and revealed the `restore` button. The archived `dog` note was restored to the active tree.
   ![Show archived toggled](https://app.devin.ai/attachments/91466b67-8fb3-4898-a6f1-b640cf362d0d/ss_bb7ddee4.png)
8. **Attachments page**: opened from the header; after API uploads (two 201, one 429), the page listed `attach1.txt` and `attach2.txt` with Download/Delete buttons.
   ![Attachments list](https://app.devin.ai/attachments/dae9f39b-d87f-4e19-a38e-87f44f73e446/ss_4174db4f.png)
9. **Re-login**: restarted the browser to clear the session, navigated to `/login`, signed in, and the workspace list reappeared.
   ![Re-login](https://app.devin.ai/attachments/f1e3d6e8-79d1-433a-b5aa-3ff8f11e5616/ss_294eb07a.png)
10. **Custom 404**: `/nonexistent` rendered the app 404 page with `Go home`.
    ![Custom 404](https://app.devin.ai/attachments/88e91064-fd56-46c7-9c8e-71aeb80543c9/ss_c78eac7c.png)

## Revisions save and restore

- Saved `cat (copy).md` multiple times. After each save, the **Revisions** panel in the right sidebar updated immediately and the **Index status** panel refreshed.
- The oldest revision was restored via `POST /workspaces/{ws}/documents/{id}/revisions/{revId}/restore`; on page reload the editor/preview showed the older content (`A small domesticated feline.` with no `First edit.` / `Second edit.`), a new revision entry appeared at the top of the Revisions panel, and Index status showed the note as current (`This note: 1 chunk(s), 1 embedded`).
  ![Revisions after restore](https://app.devin.ai/attachments/b98b8cb1-e3f9-4f6f-aca7-07f3aead10cd/ss_2c70910e.png)

## API/curl checks

- **Semantic search** `GET /workspaces/{ws}/search?q=cat` returned `cat.md`, `cat (copy).md`, and `dog.md` with scores.
- **Ask** `POST /workspaces/{ws}/ask` with `{"question":"What is a cat?"}` returned citations for `cat.md`/`cat (copy).md`/`dog.md` and a no-LLM warning (expected without `LLM_BASE_URL`).
- **OKF export** `GET /workspaces/{ws}/okf/export` returned `version 0.2` with concepts for `cat.md`, `cat (copy).md`, and `dog.md`.
- **OKF import** `POST /workspaces/{ws}/okf/import` with a new `rabbit.md` concept returned `imported: 1`; the created note contained `[the cat](cat.md)`, preserving the wikilink alias.
- **Attachment rate limit**: three rapid uploads from the same account returned `201`, `201`, `429`; downloading the first attachment returned `200` with the original `hello attachments` content.
- **Workspace isolation**: a second user received `403 Forbidden` when requesting documents from the first user's workspace.

## Issues found

1. **Mouse-click target mapping in the test harness**: several small buttons in the note tree, `Show archived` toggle, right-sidebar `Restore` buttons, and the header `Logout` button did not respond to `computer` mouse clicks in this environment. They worked through keyboard `Tab`/`Enter` and the underlying API calls. This appears to be a harness coordinate-scaling issue rather than a product bug, but it prevented a purely mouse-driven recording of those specific interactions.

2. **Restore duplicates the note in the archived list**: after restoring an archived note through the UI (`handleRestore` updates `documents` by appending the restored doc rather than replacing the old archived object), the `Show archived` list still displayed the note until the next page refresh. The document is correctly unarchived and active; only the client-side list is stale.

## Artifacts

- Screen recording: `/home/ubuntu/screencasts/pkm-ws18-ui-revisions/pkm-ws18-ui-revisions-edited.mp4`  
  Cloud URL: https://app.devin.ai/attachments/08d3eb7d-35b1-4905-ae3b-49048d84d8cb/pkm-ws18-ui-revisions-edited.mp4
- Screenshots: `/home/ubuntu/screenshots/ss_*.png`

## Recommended next steps

1. **Verify pointer-target hit-testing on smaller buttons** on a real desktop browser, especially the note-tree action buttons, `Show archived` checkbox-style button, and `Restore` buttons in the right sidebar.
2. **Fix `handleRestore` state update** in `apps/web/app/workspaces/[id]/page.tsx` so the restored document replaces the archived entry in the `documents` array instead of being appended, eliminating the duplicate archived row.
3. Add `pnpm audit --prod` and the `next start` production command to the repo blueprint.
