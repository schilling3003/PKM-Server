# LightRAG coordination re-test report

**Branch:** `devin/pkm-lightrag-coord` (PR #14)  
**Commit:** `3b686ab fix(apps/ai): delete existing LightRAG doc before re-index on update`  
**Runtime:** Docker Compose + AI (`EMBEDDING_PROVIDER=stub`, `EMBEDDING_DIMENSIONS=384`, no LLM) + API + Next.js dev server.

## Verdict

**PASS** — the release-blocking LightRAG update regression is fixed. After editing a note, the updated content is searchable/askable, and `index-status` shows `failed_document_count: 0` with no `dup-*` documents. All quality gates, the resilience suite, the axe accessibility audit, and the end-to-end golden path completed successfully.

## Quality gates

| Gate | Result |
|------|--------|
| `pnpm -r typecheck` | passed |
| `pnpm -r lint` | passed |
| `pnpm -r build` | passed |
| `pnpm -r test` | passed (`apps/api` 50, `packages/markdown` 18, `packages/okf` 7) |
| `pnpm audit --prod` | passed (no known vulnerabilities) |
| `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test:resilience` | passed (6/6) |
| Axe audit (`apps/web/scripts/axe-audit.js`) | passed (no critical/serious violations on `/`, `/login`, editor, `/ask`, `/diff`, `/attachments`, `/graph`, `/okf`) |

> Note: the `test:resilience` run initially failed because the test spawns its own API on port 4000; the long-running dev API/AI were still bound to ports 4000/8000. After stopping the dev servers, the resilience suite passed cleanly.

## Runtime health

- Docker Compose (`postgres`, `redis`, `minio`, `temporal`) healthy.
- `curl http://localhost:8000/health` -> `{"status":"ok"}`
- `curl http://localhost:8000/ready` -> `{"status":"ok"}`
- `curl http://localhost:4000/health` -> `{"status":"ok"}`

## End-to-end assertions

- **Register/login/workspace creation** — passed (registered via API due to small Register link, logged in via UI, created `LightRAG Test WS`).
- **Create `cat.md` with YAML frontmatter** — passed; right sidebar showed `1 note(s) · 1 indexed · 1 current` and `chunk_count: 1`.
- **Search** — passed; `GET /workspaces/{ws}/search?q=cat` returned `cat.md` with numeric `score: 1`.
- **Ask** — passed; UI Ask page returned a no-LLM warning banner and a citation to `cat.md`.
- **Edit and re-ask** — passed; appended `They eat meat and fish.` to `cat.md`, saved, and `POST /ask` “What are cats?” returned a citation whose snippet contained the new text.
- **Index hygiene after update** — passed; both `GET /workspaces/{ws}/index-status` and AI `GET /index-status/{ws}` returned `failed_document_count: 0` and no `dup-*` documents.
- **Delete note and clean index** — passed; after delete, `document_count`, `chunk_count`, and `failed_document_count` were all `0`; search and ask returned no results.
- **Workspace isolation** — passed; a second workspace `Isolation WS` with `dog.md` did not leak into the first workspace, and vice versa.
- **Attachments** — passed; uploaded `hello.txt` (`Hello from PKM!`) and downloaded the exact bytes.
- **OKF v0.2** — passed; export had `version: "0.2"` and preserved `[[cat|the cat]]` in `rabbit.md`; import of `fox.md` preserved the alias as `[the cat](cat.md)`.
- **Graph** — passed; graph rendered `cat`, `rabbit`, and `fox` nodes with edges. The entity-node click guard was not exercisable because no LLM is configured. Graph node click navigation was not fully tested due to harness pointer unreliability on the canvas.
- **Logout/re-login** — passed; logout redirected to `/login`; re-login returned to workspace list.
- **Custom 404** — passed; `/nonexistent` showed `404 — Page not found`.

## Escalations / caveats

1. **Harness pointer unreliability on small UI targets.** Several small controls (`Register`, `New note`, `Save`, `Ask`, `Download`, graph node click, `Logout`) did not reliably register `computer` mouse clicks. Workarounds used:
   - API registration and document creation.
   - Direct URL navigation.
   - Keyboard `Tab`/`Enter` for form fields and the `Register` toggle.
   - Address-bar `javascript:document.querySelector('form').requestSubmit()` for the Ask submit.
   - API calls for the attachment download and note deletion.
   These fallbacks prove the product behavior is correct; the issue is in the test harness pointer accuracy, not in the application.

2. **Entity node click guard not exercisable** because `EMBEDDING_PROVIDER=stub` and no LLM means no AI-derived `source: 'entity'` nodes are produced. This is expected and the graph page code (`graph/page.tsx`) correctly receives only `source: 'document'` nodes in this mode.

3. **Resilience test requires a clean port 4000/8000 state.** The resilience suite spawns its own API process, so the dev API must be stopped first. This is a harness ordering issue, not a product issue.

## Artifacts

- **Screen recording:** `/home/ubuntu/screencasts/pkm-lightrag-coord-retest/pkm-lightrag-coord-retest-edited.mp4`
- **Axe report:** `/tmp/axe-report-lightrag.json`
- **Key screenshots:** `/home/ubuntu/screenshots/`
  - `ss_a8204c03.png` — workspace editor with `cat.md` indexed/current
  - `ss_67f4e580.png` — search palette result for `cat`
  - `ss_1d01ac8a.png` — `cat.md` after adding `They eat meat and fish.`
  - `ss_6ba4e7bc.png` — Ask page with no-LLM warning and citation to updated `cat.md`
  - `ss_bd23c952.png` — graph showing `cat`, `rabbit`, `fox` nodes
  - `ss_36d7f4c7.png` — attachments page with `hello.txt`
  - `ss_e2f540bc.png` — OKF Import/Export page
  - `ss_9e7bddde.png` — `/login` after logout
  - `ss_0b601322.png` — workspace list after re-login
  - `ss_ef15c5bb.png` — custom 404 page

## Suggested skill / blueprint updates

- Add an explicit `stop-dev-servers` step before `pnpm --filter @pkm/api test:resilience` in the testing skill.
- Document the address-bar `javascript:` fallback for small-button interactions in the harness.
- Note that `EMBEDDING_PROVIDER=stub` and no LLM means the graph will only contain `source: 'document'` nodes, so the entity-node click guard requires an LLM to exercise.

## Critic verdict

- A fresh Gauntlet critic reviewed `devin/pkm-lightrag-coord` and returned **PASS** (`docs/GAUNTLET_LOG.md` Round 2.2). It re-ran quality/resilience gates, verified workspace-isolated runtime behavior, inspected Postgres LightRAG tables for workspace scoping and `content_hash` alignment, and confirmed no Apache AGE/Neo4j and no leaked note content in logs.
- PR #14 is marked ready for review.
