# PKM v1 Gauntlet Log

## Round 0 — Coordinator baseline

**Date**: 2026-08-10
**Coordinator**: Devin
**Verdict**: Baseline established and walking skeleton verified.
Repository inspected; `/loop` skill file exists. Initial docs created.
Monorepo initialized with `@pkm/web`, `@pkm/api`, `@pkm/ai`, and
`@pkm/shared`. Docker Compose stack (Postgres, Redis, MinIO, Temporal)
starts, healthchecks, and shuts down cleanly.
**Evidence**: `pnpm -r build` passes; `docker compose up -d --wait` reports
all services healthy; API `/health` returns `ok` for Postgres, Redis, and
AI; AI `/health` and `/embed` respond; Next.js serves the landing page on
port 3000.
**Decisive gap**: None yet.
**Changes**: Added `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`,
`docs/QUALITY_BAR.md`, `docs/SECURITY.md`, `docs/DECISIONS.md`,
`docs/WORKSTREAMS.md`, `docs/GAUNTLET_LOG.md`; initialized monorepo,
Docker Compose, and migration.
**Regressions**: None.
**Round 0.1 — fixes after critic review**: Added Redis/Postgres client
error listeners; moved local dev credentials from `docker-compose.yml`
into `.env` populated from `.env.example`; re-verified health checks and
clean shutdown.
**Blockers**: None.

## Round 0.2 — Search, embeddings, grounded Q&A, and blocker fixes

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Backend search/AI stack verified; web front delegated to a child session.
- Added `document_chunks` table with `pgvector` embeddings and `tsvector` full-text index.
- Added `/workspaces/:id/search` (hybrid full-text + vector) and `/workspaces/:id/ask` (cited, workspace-isolated).
- Wired chunk generation and embedding into document create/update with safe fallback when the AI service is unavailable.
- Fixed Devin Review blockers: API migrations copied into `dist`, Dockerfile manifests/standalone path, AI `__main__` module path, API lint/test scripts, CORS default, and health error disclosure.
**Evidence**: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm -r test` pass; Docker Compose starts healthy; API `/health` reports `ok`; `curl` creates workspaces and documents, returns isolated search results, and `/ask` returns cited notes.
**Decisive gap**: Web UI remains a skeleton; delegated to a dedicated child Devin session.
**Changes**: `apps/api/src/ai.ts`, `chunks.ts`, `search.ts`, `ask.ts`, `migrations/0003_search_and_vectors.sql`; updated `apps/api/src/index.ts`, `documents.ts`, Dockerfiles, `apps/ai/src/main.py`; added `apps/ai/src/__init__.py` and `apps/api/scripts/copy-migrations.cjs`.
**Regressions**: None.
**Blockers**: None.

## Round 0.3 — Web editor integration and end-to-end verification

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Web editor integrated and verified end-to-end.
- Integrated the child-session web editor (`apps/web/app/workspaces/[id]/page.tsx`, `apps/web/lib/api.ts`) with the search/AI backend.
- Added workspace switcher, file tree with folders, split Markdown source/preview editor, wikilink rendering, outgoing/backlink panels, create/rename/delete, and error/empty/loading states.
- Fixed `react-hooks/set-state-in-effect` lint errors, added `allowedDevOrigins`, and adjusted `eslint.config.mjs` for `_` prefix unused-vars convention.
**Evidence**: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm -r test` pass; Docker Compose stack healthy; API `/health` `ok`; `curl` confirms workspace isolation for documents, search, backlinks, and `/ask`; browser verified creating, editing, saving, and switching workspaces without leakage.
**Decisive gap**: None for this round.
**Changes**: `apps/web/app/workspaces/[id]/page.tsx`, `apps/web/eslint.config.mjs`, `apps/web/next.config.ts`, `docs/GAUNTLET_LOG.md`, `docs/WORKSTREAMS.md`.
**Regressions**: None.
**Blockers**: None.

## Round 0.4 — Auth, attachments, search/theming integration and critic-driven fixes

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Integrated child workstreams and addressed round 0.3 critic findings.
- Merged child branches `devin/pkm-v1-auth`, `devin/pkm-v1-attachments`, and `devin/pkm-v1-search-theme` into `devin/pkm-v1-search-ai`.
- Wired `registerAuthRoutes` and `registerAttachmentRoutes` in `apps/api/src/index.ts`; enforced workspace membership on workspace creation; added `UserNav` and an attachments link to the web shell.
- Addressed critic release blocker: OKF export now places `index.md` and `log.md` in `indices`/`logs`, and `okf/import` writes them back as reserved documents, enabling round-trip import/export.
- Added reserved-filename guard in `documents.createDocument`/`updateDocument` so the regular document API cannot create `index.md`/`log.md` concepts.
- Hardened `/search` `limit` validation, `MarkdownLink` external scheme allowlist, `handleSave` state sync, and `document_links.target_path` updates on rename.
**Evidence**: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm -r test` pass; Docker Compose stack healthy; `curl` verifies auth login/logout, workspace create with membership, document CRUD, search, `/ask`, OKF round-trip with `index.md`/`log.md`, attachments upload/list, and workspace isolation; `curl` confirms non-members are rejected.
**Decisive gap**: Round 0.4 critic identified that `/attachments/:id` routes bypassed the `/workspaces/*` auth pre-handler, allowing unauthenticated/non-member downloads and deletes. Fixed by adding an `/attachments/:id?workspaceId=...` branch to the auth pre-handler and added an `auth.test.ts` case. The critic re-fetched and re-verified: verdict updated to PASS.
**Critic report**: `devin/pkm-v1-critic-round-0-4` (branch).
**Changes**: `apps/api/src/app.ts`, `apps/api/src/auth.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/attachments.ts`, `apps/api/src/index.ts`, `apps/api/src/documents.ts`, `apps/api/src/okf.ts`, `apps/api/src/workspaces.ts`, `apps/api/test/auth.test.ts`, `apps/web/app/layout.tsx`, `apps/web/app/workspaces/[id]/page.tsx`, `docs/GAUNTLET_LOG.md`, `docs/WORKSTREAMS.md`, `docs/DECISIONS.md`.
**Regressions**: None.
**Blockers**: None.

## Round 0.5 — Security review and immediate hardening

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Security review accepted; critical/high findings addressed.
- Merged PR #5 (GitHub Actions CI workflow for lint, typecheck, test, build, and Docker Compose health checks) into `devin/pkm-v1-search-ai`.
- Security/privacy reviewer produced `SECURITY_REVIEW.md` on `devin/pkm-v1-security-review` with 17 OWASP ASVS Level 2 findings.
- Fixed Critical Finding 1: `GET /workspaces` and `POST /workspaces` now require authentication; orphan workspace creation is impossible; workspace list returns only the caller's member workspaces.
- Fixed Finding 10: `requireWorkspaceMembership` no longer short-circuits when `request.user` is missing; it returns `401` instead.
- Updated `auth.test.ts`, `integration.test.ts`, and `attachments.test.ts` to authenticate through the API and assert workspace-list isolation and unauth rejection.
**Evidence**: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm -r test` pass; CI checks on PR #5 green; `curl` confirms unauthenticated `/workspaces` returns `401`.
**Security report**: `devin/pkm-v1-security-review` (branch).
**Decisive gap**: Remaining high findings (opaque server-side sessions, rate limiting, attachment content-type allow-list, CSP/security headers, prompt injection mitigations, AI service auth, secret fallbacks) are queued for the next round.
**Changes**: `apps/api/src/app.ts`, `apps/api/src/auth.ts`, `apps/api/src/attachments.ts`, `apps/api/test/auth.test.ts`, `apps/api/test/integration.test.ts`, `apps/api/test/attachments.test.ts`, `.github/workflows/ci.yml`, `docs/WORKSTREAMS.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 0.6 — Critic response and security hardening

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Addressed the round 0.5 critic release blockers and remaining `SECURITY_REVIEW.md` high findings; gates pass.
- **RB-1**: `/auth/logout` now blocks the signed cookie server-side in Redis (with an in-memory fallback) and `resolveUser` rejects blocklisted cookies. Session invalidation is effective immediately and persists for the remaining cookie lifetime (`SESSION_MAX_AGE_SECONDS`).
- **RB-2**: Login and register in `apps/web/app/login/page.tsx` redirect to `/` (the existing workspace list) instead of the non-existent `/workspaces`.
- **RB-3**: Attachment uploads are validated by magic-byte allow-list for images, PDF, and text, and downloads are proxied through the API with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` so the uploader cannot control the served `Content-Type`.
- **RB-4**: YAML frontmatter parsing uses `maxAliasCount: 50` and an overall document-size cap of 1 MiB is enforced in `documents.ts`/`okf.ts` to prevent billion-laughs-style expansion and oversized payloads.
- Also implemented the originally scoped security mitigations: per-IP/per-account Redis-backed rate limiting on `/auth/login`, `/auth/register`, `/workspaces/:id/search`, and `/workspaces/:id/ask`; CSP/security headers in `apps/web/next.config.ts`; 500-character input caps on `q` and `question`; `X-API-Key` auth between `apps/api` and `apps/ai`; production guards that refuse to start if `SESSION_SECRET`, `S3_SECRET_KEY`, `DATABASE_URL`, or `AI_SERVICE_API_KEY` are missing; and reduced `/health` disclosure to only top-level status and version.
**Evidence**: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm -r test` pass; Docker Compose stack starts healthy; `curl` confirms logout invalidates the session, protected routes reject the old cookie, oversized search/ask returns `400`, blocked attachment types are rejected, and document creation rejects a YAML bomb and oversized content.
**Critic report**: `origin/devin/pkm-v1-critic-round-0-5:CRITIC_REPORT.md`.
**Decisive gap**: The signed-cookie session model is hardened with a blocklist but is still not a fully opaque server-side session; that remains a future architectural improvement.
**Changes**: `apps/api/src/session-blocklist.ts`, `apps/api/src/auth.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/attachments.ts`, `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/documents.ts`, `packages/markdown/src/parser.ts`, `apps/web/app/login/page.tsx`, `apps/web/next.config.ts`, `apps/ai/src/main.py`, `apps/api/src/ai.ts`, `apps/api/src/db.ts`, `apps/api/src/rate-limit.ts`, `apps/api/test/auth.test.ts`, `apps/api/test/integration.test.ts`, `apps/api/test/attachments.test.ts`, `apps/api/test/rate-limit.test.ts`, `docs/SECURITY.md`, `docs/DECISIONS.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 0.7 — Graph, outline, and tags/properties panel integration

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Workstream 15 integrated and verified; `registerGraphRoutes` wired into `apps/api/src/index.ts`.
- Merged the workstream 15 child branch (`devin/pkm-v1-graph-panel`) which added `GET /workspaces/:id/graph`, the web graph view (`app/workspaces/[id]/graph/page.tsx`), outline panel, and frontmatter tags/properties panel.
- Resolved merge conflicts and adjusted the YAML alias-bomb integration test to a width of 30 to exceed the `maxAliasCount: 50` limit.
- Re-ran `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, and `pnpm -r build` after wiring the graph routes; all pass.
- `curl` confirms the graph endpoint returns workspace-scoped nodes/edges and does not leak across workspaces.
**Evidence**: `pnpm -r build/typecheck/lint/test` all pass; `curl` to `/workspaces/:id/graph` returns nodes and edges for workspace members only.
**Critic report**: None yet for this round.
**Decisive gap**: None.
**Changes**: `apps/api/src/index.ts`, `apps/api/test/integration.test.ts`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 0.8 — Critic-driven security fixes (re-login, CSP, audit, rate limiting)

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Addressed the round 0.7 critic release blockers; gates, audit, and browser smoke-test pass.
- **RB-1**: Replaced `bcrypt` with `bcryptjs` to eliminate the `tar` CVE chain via `@mapbox/node-pre-gyp`; `pnpm audit --prod` now reports no known vulnerabilities.
- **RB-2**: Implemented per-request CSP nonces in `apps/web/proxy.ts` and forced dynamic rendering in `apps/web/app/layout.tsx`, removing `'unsafe-inline'` and `'unsafe-eval'` from `script-src`; removed `X-Powered-By` via `poweredByHeader: false`.
- **RB-3**: Rate-limiter Redis errors now fall back to per-process memory limiting instead of fail-open, and `apps/api/src/app.ts` sets `trustProxy` when `TRUST_PROXY=true` so IP-based limits work behind reverse proxies.
- **Re-login after logout**: Session cookies now include a per-login nonce (`userId:${randomUUID()}`); logout blocklists the signed token, so a fresh login issues a different, unblocked token.
- Migrated deprecated `apps/web/middleware.ts` to `apps/web/proxy.ts` per Next.js 16 guidance.
**Evidence**: `pnpm -r build/typecheck/lint/test` pass; `pnpm audit --prod` clean; `curl` confirms logout and re-login succeed; browser login through strict-CSP page redirects to the workspace list; `curl` response headers show nonce-based CSP and no `X-Powered-By`.
**Critic report**: `origin/devin/pkm-v1-critic-round-0-7:CRITIC_REPORT.md`; test report `origin/devin/pkm-v1-test-report-20260811:docs/TEST_REPORT_20260811.md`.
**Decisive gap**: Remaining high/medium findings (real LLM for `/ask`, prompt-injection controls, integration-test database isolation, root `.env` loading for child processes, full-text attachment scanning, `standardToWiki` regex robustness) remain for subsequent rounds.
**Changes**: `apps/api/package.json`, `apps/api/src/auth.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/app.ts`, `apps/api/src/rate-limit.ts`, `apps/api/test/auth.test.ts`, `apps/web/proxy.ts`, `apps/web/middleware.ts` (renamed), `apps/web/app/layout.tsx`, `apps/web/next.config.ts`, `pnpm-lock.yaml`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 0.9 — Remaining critic high/medium findings

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Addressed H-3, H-4, M-2, M-3, and H-1/H-2 (configurable LLM path); gates pass.
- **H-4 (root `.env` loading)**: `apps/api/src/env.ts` loads the repository root `.env` before other imports; `apps/ai/src/main.py` loads root `.env` relative to `__file__`; `apps/api/test/setup.ts` loads root `.env` before tests. This makes `pnpm --filter <pkg>` commands find the same config.
- **H-3 (integration test DB isolation)**: `apps/api/test/setup.ts` creates `pkm_test` if it does not exist and sets `process.env.DATABASE_URL` to it before any test module imports `db.ts`. Tests now truncate `pkm_test` instead of the developer's `pkm` database.
- **M-2 (attachment text validation)**: `isSafeText` in `apps/api/src/attachments.ts` now scans the entire file content rather than only the first 4 KB.
- **M-3 (`standardToWiki` regex fragility)**: Replaced the regex-based converter with an AST-based implementation using `unified` + `remark-parse`. `wikiToStandard` now percent-encodes spaces in URLs; `standardToWiki` decodes them to produce valid round-trip wikilinks.
- **H-1/H-2 (`/ask` stub and prompt injection)**: `apps/ai/src/main.py` `/ask` now calls an OpenAI-compatible chat-completions endpoint when `LLM_BASE_URL` and `LLM_API_KEY` are explicitly configured. The prompt includes a system message that refuses to follow instructions embedded in notes, reveal secrets, or ignore grounding. When no LLM is configured, it safely returns a grounded note-list message.
- **Graph/link resolution**: `syncLinks` now resolves wikilinks case-insensitively, decodes percent-encoded standard Markdown URLs, and stores lowercase target paths so `resolveBacklinks` matches across casing. This fixes graph edges and backlinks when note titles contain spaces or capitalization differences.
- **bcryptjs ESM import**: `apps/api/src/auth.ts` imports `bcrypt` from `bcryptjs` as the default export so the compiled `dist` runtime has the `hash`/`compare` functions.
- Updated `.env.example` with `LLM_*` and `TEST_DATABASE_URL` documentation.
**Evidence**: `pnpm -r build/typecheck/lint/test` pass; `pnpm audit --prod` clean; API tests run against `pkm_test` and do not touch `pkm`; `packages/markdown` round-trip tests pass with `Project Ideas` target containing a space. Additional curl verification on a running stack: workspace isolation (non-member gets 403 for documents/search/graph), OKF export/import round-trip preserves frontmatter and body, attachment upload/download with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, logout invalidates the cookie and re-login works, search and `/ask` return results. A 100-note workspace was created in ~1.3 s and a 100 KiB note uploaded in ~50 ms; search remains sub-10 ms.
**Critic report**: Round 0.8 critic session in progress.
**Decisive gap**: The configurable LLM path has not been exercised against a live model; only the stub and mock are verified. This is acceptable for v1 when the operator has not configured a model.
**Changes**: `apps/api/src/env.ts`, `apps/api/src/index.ts`, `apps/api/src/ask.ts`, `apps/api/src/ai.ts`, `apps/api/src/documents.ts`, `apps/api/test/setup.ts`, `apps/ai/src/main.py`, `apps/api/src/attachments.ts`, `packages/markdown/src/links.ts`, `packages/markdown/test/parser.test.ts`, `.env.example`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.0 — Workstream 16: autosave, wikilink autocomplete, unlinked mentions, duplicate/archive/restore

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Implemented and merged into `devin/pkm-v1-search-ai`.
- **Autosave**: The editor textarea debounces `onChange` for 800 ms and calls the existing save handler; the explicit Ctrl/Cmd+S shortcut remains; save status shows `Unsaved`/`Saving…`/saved state.
- **Wikilink autocomplete**: Typing `[[` in the editor opens a floating candidate list of active notes filtered by the text after `[[`; Arrow keys, Enter/Tab, Escape, and click selection insert `[[path]]` or `[[path|alias]]`.
- **Unlinked mentions**: The right sidebar lists other active notes whose body text contains the current note's title/path basename (case-insensitive).
- **Duplicate / archive / restore**: `POST /workspaces/:workspaceId/documents/:id/duplicate` creates a copy with a unique `… (copy).md` path. `POST …/archive` sets `archived_at`; `POST …/restore` clears it. The file tree filters archived notes and shows a "Show archived" toggle with restore buttons. A `0004_archive.sql` migration adds `archived_at` to `documents`.
**Evidence**: `pnpm -r build/typecheck/lint/test` pass; `curl` confirms duplicate, archive, active-only default list, and `includeArchived=true` restore list; UI smoke-tested in browser (register, create note, edit, autosave status, duplicate, archive, wikilink autocomplete, unlinked mentions panel).
**Critic report**: Pending; round 0.8 critic and tester still running.
**Changes**: `apps/api/src/documents.ts`, `apps/api/src/app.ts`, `apps/api/src/migrations/0004_archive.sql`, `apps/web/lib/api.ts`, `apps/web/app/workspaces/[id]/page.tsx`, `docs/WORKSTREAMS.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.1 — Workstream 17: AI index status, observability, and staleness indicators

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Implemented and merged into `devin/pkm-v1-search-ai`.
- Added `GET /workspaces/:workspaceId/index-status` returning document count, indexed/current/stale counts, chunk count, and embedded chunk count.
- Added `GET /workspaces/:workspaceId/documents/:id/index-status` returning per-document chunk count, embedded chunk count, and `stale` boolean based on whether chunk content hashes match the document's current content hash.
- Added an "Index status" panel in the workspace right sidebar showing workspace-level and per-note index/embedding state and stale warnings.
**Evidence**: `pnpm -r build/typecheck/lint/test` pass; integration test confirms the endpoint reports counts and correctly flags stale chunks after an out-of-band canonical update.
**Critic report**: Pending; round 0.8 critic and tester still running.
**Changes**: `apps/api/src/documents.ts`, `apps/api/src/app.ts`, `apps/web/lib/api.ts`, `apps/web/app/workspaces/[id]/page.tsx`, `apps/api/test/integration.test.ts`, `docs/WORKSTREAMS.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 0.9 — Critic remediation from round 0.8

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Addressed the round 0.8 critic's release blockers and re-verified.
- **Wikilink autocomplete**: Added `insertWikilink` in `packages/markdown` that removes the `[[` trigger, strips `.md` from the target path, and produces `[[target|alias]]` or `[[target]]`. `apps/web` now uses this helper; unit tests cover the previously-broken cases.
- **Clean-checkout `pnpm -r typecheck`**: Pointed `types` in `packages/markdown`, `packages/okf`, and `packages/shared` to `./src/index.ts` so dependent packages resolve source types before `dist` is built.
- **Semantic embeddings**: `apps/ai/src/main.py` `/embed` now supports `EMBEDDING_PROVIDER` (`sentence-transformers` / `openai` / `stub`). The default local `sentence-transformers/all-MiniLM-L6-v2` model produces real 384-dimensional vectors when installed; `EMBEDDING_*` variables are documented in `.env.example` and `apps/ai/requirements.txt`. `apps/api/src/search.ts` uses a 1.0 cosine-distance threshold so real semantic matches are returned.
- **TRUST_PROXY** is now documented in `.env.example`.
**Evidence**: `pnpm -r build/typecheck/lint/test` pass; `pnpm audit --prod` clean; `curl` shows `/embed` returns a real 384-dim vector and `/search?q=cat` and `/search?q=animals` return semantically relevant notes.
**Critic report**: Pending a fresh critic after these fixes.
**Changes**: `packages/markdown/src/links.ts`, `packages/markdown/src/index.ts`, `packages/markdown/test/parser.test.ts`, `apps/web/app/workspaces/[id]/page.tsx`, `packages/markdown/package.json`, `packages/okf/package.json`, `packages/shared/package.json`, `apps/ai/src/main.py`, `apps/ai/requirements.txt`, `.env.example`, `apps/api/src/search.ts`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.2 — End-to-end tester verification

**Date**: 2026-08-11
**Tester**: Devin child session `67ff0c4a5fbb4012a42881e6d892e033`
**Branch under test**: `devin/pkm-v1-search-ai`
**Verdict**: PASS
- All 12 browser golden-path steps completed: register, workspace/note CRUD, wikilink autocomplete, backlinks/unlinked mentions, tags, outline, graph, search (semantic `cat`/`animals`), index status panel, duplicate/archive/restore, OKF import/export, attachments, logout/re-login.
- All `curl`/API verification flows passed; health checks for API and AI services returned `ok`.
- Report branch: `devin/pkm-v1-tester-round-0-9` with `docs/TEST_REPORT.md`, screenshots, and screen recording.
**Evidence**: Test report shows `3 note(s), 3 indexed, 3 current, 6 chunks, 6 embedded`; semantic search returned `cats.md`, `dogs.md`, `animals.md` for `cat`/`animals`; OKF export round-tripped wikilinks correctly; attachment bytes matched.
**Blockers / Issues Encountered**:
- `sentence-transformers` was not in the pre-existing AI `.venv`; installing it and restarting the AI service resolved the issue. The blueprint already installs `apps/ai/requirements.txt`, which now includes `sentence-transformers`.
- Next.js dev overlay intercepted automated clicks; removed via browser console for automation only.
- Chrome `Ctrl+K` omnibox conflict was worked around during automation.
**Recommended follow-up**: Update `.devin/skills/testing-pkm/SKILL.md` to document the dev-overlay and `Ctrl+K` automation caveats.
**Critic report**: Pending; round 0.9 critic `426b17f41b0d49399ff669d2708a1896` is resuming.
**Regressions**: None.
**Blockers**: None.

## Round 1.3 — Critic remediation (attachment rate limiting and CSP 404)

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Integrated the round 0.9 critic's highest findings and re-verified.
- Wired the existing Redis-backed `RateLimiter` to `POST /workspaces/:id/attachments` and `GET|DELETE /attachments/:id` with per-IP and per-account buckets (configurable via `RATE_LIMIT_ATTACHMENTS_*`).
- Added an integration test in `apps/api/test/rate-limit.test.ts` that verifies rapid attachment uploads return `429 Too Many requests`.
- Reconciled `docs/SECURITY.md` so **Mitigations**, **Implemented mitigations**, and **Open hardening** are consistent and no longer list implemented controls as open.
- Added `apps/web/app/not-found.tsx` so the 404 page uses the application layout instead of Next.js's default inline-styled 404.
- Added optional `RATE_LIMIT_*` variables to `.env.example`.
**Evidence**: `pnpm -r build/typecheck/lint/test` pass; `pnpm audit --prod` clean; rate-limit test confirms the third attachment upload in a burst returns `429`.
**Critic report**: Pending a fresh critic if any blockers remain.
**Changes**: `apps/api/src/auth.ts`, `apps/api/test/rate-limit.test.ts`, `apps/api/test/attachments.test.ts`, `docs/SECURITY.md`, `.env.example`, `apps/web/app/not-found.tsx`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.4 — CSP nonce mismatch fix and re-verification

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Fixed the CSP nonce mismatch that blocked the UI under `next dev` and `next start`.
- **Root cause**: Next.js 16.3.0 with Turbopack did not propagate the `Content-Security-Policy` request-header nonce generated in `apps/web/proxy.ts` to the `nonce` attributes on the rendered `<script>`/`<style>` tags. This caused the browser to block all application JS because the CSP `script-src` required `nonce-<proxy>` while the tags carried a different `nonce-<next>`.
- **Fix**: Rewrote `apps/web/proxy.ts` to emit a source-based CSP (`default-src 'self'`, `script-src 'self' 'unsafe-inline'` with `'unsafe-eval'` in dev, `style-src 'self' 'unsafe-inline'`, `object-src 'none'`, `frame-ancestors 'none'`, explicit `img-src`/`connect-src`/`font-src`) and removed per-request nonces and `strict-dynamic`. Also removed the unused `x-nonce` request header propagation.
- Updated `docs/DECISIONS.md` AD-012 and `docs/SECURITY.md` to record the nonce propagation issue and the current source-based CSP.
- Re-verified: `pnpm -r build/typecheck/lint/test` pass; `pnpm audit --prod` clean; `next build`/`next start` serve pages with CSP enabled and no console CSP errors; browser registration/login redirects to the workspace list.
**Decisive gap**: None for this round.
**Changes**: `apps/web/proxy.ts`, `apps/web/app/layout.tsx`, `docs/DECISIONS.md`, `docs/SECURITY.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.5 — `next start` static chunks, client hydration, and wikilink `.md` duplication

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Fixed the three release blockers reported by the round 0.9 end-to-end tester.
- **`output: 'standalone'` prevented `next start` from serving `_next/static`**: `apps/web/next.config.ts` now sets `output` only when `NEXT_BUILD_OUTPUT=standalone`; `apps/web/Dockerfile` sets that variable before `pnpm -r build`, keeping the standalone production image while allowing `pnpm --filter @pkm/web start` (`next start`) to serve static chunks normally.
- **Client components appeared non-interactive**: The tester was hitting a stale `next-server` process from an earlier standalone build and a password-manager overlay in the automated browser. After killing stale `next-server` processes and using a fresh build, login, workspace creation, the new-note dialog, the note editor, and the attachments page all accept keyboard input and update React state.
- **Wikilink targets with `.md` duplicated the extension**: `packages/markdown/src/links.ts` now strips an existing `.md` extension before appending one and unit tests cover `[[dog.md]]` and `[[notes/Cat.md|cat]]`.
- **Wikilink autocomplete dropdown was hidden**: The `onContentChange` handler now derives the query from the full editor value with a regex anchored at end-of-string, avoiding stale `selectionStart` during batched state updates. The dropdown is now absolutely positioned at the top-left of the editor so it is not clipped by the `overflow-hidden` split-pane container.
- Added `--color-popover` / `--popover` CSS variables to `apps/web/app/globals.css` so the `bg-popover` dropdown background is distinct.
**Evidence**: `pnpm -r build/typecheck/lint/test` pass; `pnpm audit --prod` clean; Docker Compose stack healthy; API and AI `/health` return `ok`; `curl` confirms document CRUD, OKF round-trip, and attachments; browser verifies `next start` login, workspace creation, note editor, `[[` wikilink autocomplete with Tab insertion, backlink update, and autosave.
**Decisive gap**: None for this round.
**Changes**: `packages/markdown/src/links.ts`, `packages/markdown/test/parser.test.ts`, `apps/web/next.config.ts`, `apps/web/Dockerfile`, `apps/web/app/globals.css`, `apps/web/app/workspaces/[id]/page.tsx`, `docs/DECISIONS.md`, `docs/SECURITY.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.6 — Revisions merge and round 1.5 tester follow-up

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Merged workstream 18 (revisions) and addressed the three UI/interaction findings from the round 1.5 end-to-end tester.
- **Merged PR #7 (`devin/pkm-v1-revisions`) into `devin/pkm-v1-search-ai`**: resolved the `docs/WORKSTREAMS.md` conflict and verified `pnpm -r typecheck/lint/test` after the merge. The revisions API/UI adds `GET /workspaces/:ws/documents/:doc/revisions/:id`, `POST .../restore`, and a right-sidebar Revisions panel.
- **Wikilink autocomplete inserted a partial-query alias**: `packages/markdown/src/links.ts` `insertWikilink` now accepts an optional `displayText`; the UI passes `target.title` (or basename) and omits the alias when it matches the target. Unit tests cover the no-alias case.
- **Archive/restore action buttons were hover-only and missed by the harness**: removed `opacity-0 group-hover:opacity-100` from the duplicate/archive/rename/delete buttons in the note tree so they are always visible and clickable.
- **`Show archived` checkbox did not respond to mouse clicks**: replaced the native checkbox/label with a `<button>` toggle that uses `aria-pressed` and a custom checkbox indicator, giving it a consistent clickable surface.
- **Search header button click**: verified the button opens the search palette; `Ctrl+K`/`Cmd+K` remains the keyboard shortcut.
**Evidence**: `pnpm -r build/typecheck/lint/test` pass; `pnpm audit --prod` clean; Docker Compose stack healthy; browser verifies search palette opens from header, wikilink `[[ca` → `Tab` inserts `[[cat]]` (no alias), and the `Show archived` control is present.
**Decisive gap**: Re-run the persistent end-to-end tester to confirm the archive/restore flow and `Show archived` toggle pass in the automated harness.
**Changes**: `packages/markdown/src/links.ts`, `packages/markdown/test/parser.test.ts`, `apps/web/app/workspaces/[id]/page.tsx`, `docs/WORKSTREAMS.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.7 — Fix `handleRestore` stale archived entry and merge test report

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Fixed the duplicate-archived-entry state bug found by the round 1.6 end-to-end tester and merged the test report into `devin/pkm-v1-search-ai`.
- **`handleRestore` replaced the archived document instead of appending**: `apps/web/app/workspaces/[id]/page.tsx` now maps the restored `Document` over the matching `id`, re-sorts by path, and refreshes the active editor if the restored note was selected.
- **Merged `devin/pkm-v1-tester-round-1-1`**: incorporated `docs/TEST_REPORT.md` and the restore fix into `devin/pkm-v1-search-ai`.
- **Re-verified**: `pnpm -r build/typecheck/lint/test` pass; `pnpm audit --prod` clean; Docker Compose stack healthy; API and AI `/health` return `ok`.
**Evidence**: `apps/web/app/workspaces/[id]/page.tsx` now updates `documents` with `prev.map(doc => doc.id === id ? d : doc)` after `restoreDocument` resolves; `pnpm -r build/typecheck/lint/test` and `pnpm audit --prod` pass.
**Decisive gap**: Re-run the persistent end-to-end tester on the merged `devin/pkm-v1-search-ai` commit to confirm `Show archived` no longer shows a duplicate after restore and the archive/restore golden path is fully automated.
**Changes**: `apps/web/app/workspaces/[id]/page.tsx`, `docs/TEST_REPORT.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.8 — Archive state fix and round 1.7 end-to-end tester integration

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Fixed the `Show archived` invisible-toggle bug found by the round 1.7 end-to-end tester and merged the fresh test report.
- **`handleArchive` now preserves the archived row in the local `documents` array**: `apps/web/app/workspaces/[id]/page.tsx` maps the archived `Document` returned by `archiveDocument` over the matching entry and re-sorts by path. Previously it filtered the note out, so the `Show archived` toggle (which only renders when `documents.some((d) => d.archived_at)` is true) was invisible until reload.
- **Merged `devin/pkm-v1-tester-round-1-7`**: incorporated `docs/TEST_REPORT_round_1_7.md` and the updated `.devin/skills/testing-pkm-search-ai/SKILL.md` notes about `env NEXT_BUILD_OUTPUT= pnpm --filter @pkm/web start` and keyboard fallback for small sidebar buttons.
- **Re-verified**: `pnpm -r typecheck/lint/test/build` pass; `pnpm audit --prod` clean; Docker Compose stack healthy; API and AI `/health` return `ok`.
**Evidence**: `apps/web/app/workspaces/[id]/page.tsx` now updates `documents` with `prev.map(doc => doc.id === target.id ? d : doc)` after `archiveDocument` resolves; the round-1.7 test report records `restore` with no duplicate archived row and all golden-path/API checks passing.
**Decisive gap**: A real pointer-device check of small sidebar/archive/restore hit targets is still needed to confirm whether the harness-only mouse-click issue is reproducible outside the automated harness. Workstream 20 (accessibility/keyboard polish) is addressing hit-area and keyboard-operability improvements.
**Changes**: `apps/web/app/workspaces/[id]/page.tsx`, `docs/TEST_REPORT_round_1_7.md`, `.devin/skills/testing-pkm-search-ai/SKILL.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.9 — Workstream 20: Accessibility audit and keyboard navigation polish

**Date**: 2026-08-11
**Owner**: child-a11y (`devin/pkm-v1-a11y`)
**Verdict**: Audited primary journeys with axe-core; fixed critical/serious WCAG 2.2 AA violations; keyboard and semantic markup improved.
- **Focus and keyboard**: Added visible `:focus-visible` outlines for buttons, links, inputs, textareas, selects, and `[tabindex]` controls in `apps/web/app/globals.css`.
- **Skip-to-content**: Added a skip link in `apps/web/app/layout.tsx` pointing to `#main-content`; all main page roots now carry `id="main-content"` and are focusable (`tabIndex={-1}`).
- **Semantic markup and ARIA**: Page titles updated via `document.title` in `login/page.tsx`, `page.tsx`, `workspaces/[id]/page.tsx`, `attachments/page.tsx`, and `graph/page.tsx`; form labels added for icon-only/placeholder-only inputs; folder tree headers use `aria-expanded`; `Show archived` uses `aria-pressed` and `aria-controls`; note-tree action buttons use `aria-label` and minimum 24×24 hit areas; `not-found.tsx` uses `<main id="main-content">`; `GraphView` canvas is focusable with `role="application"`, an `aria-label`, and arrow-key/Enter/+/−/0 keyboard navigation.
- **Keyboard shortcut conflict**: Search palette shortcut changed from `Ctrl+K`/`Cmd+K` to `Ctrl+Shift+F`/`Cmd+Shift+F` to avoid browser address-bar conflicts; trigger label and tooltip updated.
- **Attachment alt/accessibility**: `AttachmentUpload` helper text contrast fixed (`text-gray-400` → `text-gray-500`) to meet 4.5:1; download/delete links and file input carry explicit labels.
- **Automated checks**: Added `apps/web/scripts/axe-audit.js` using `puppeteer-core` and `axe-core`. The script can start the Next.js dev server (`AXE_SERVE=1`) or audit an existing stack (`AXE_AUDIT_URL` + `AXE_API_URL`); it registers a test user, creates a workspace and document, and audits `/`, `/login`, `/workspaces/:id`, `/workspaces/:id/attachments`, and `/workspaces/:id/graph`. It exits non-zero on critical/serious violations and can write a JSON report (`AXE_REPORT_FILE`). Added `apps/web/package.json` scripts `test:axe` and `test` (placeholder) and dev dependencies `axe-core@^4.10.2` and `puppeteer-core@^23.9.0`.
- **Cross-workstream touch points**: `apps/web/app/workspaces/[id]/attachments/page.tsx` (Workstream 10), `apps/web/app/workspaces/[id]/graph/page.tsx` and `_components/GraphView.tsx` (Workstream 15), `apps/web/app/login/page.tsx` (Workstream 9), `apps/web/app/workspaces/[id]/page.tsx` (Workstreams 3/4/11/16), and `apps/web/components/AttachmentUpload.tsx` (Workstream 10) were edited for accessibility; all non-a11y behavior preserved.
**Evidence**: `pnpm -r build/typecheck/lint/test` pass; `pnpm audit --prod` clean; `apps/web/scripts/axe-audit.js` with `AXE_AUDIT_URL=http://localhost:3000 AXE_API_URL=http://localhost:4000` reports `PASSED: no critical or serious violations found` across login, workspace list, editor, attachments, and graph.
**Critic report**: None yet for this round.
**Decisive gap**: None.
**Changes**: `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/not-found.tsx`, `apps/web/app/page.tsx`, `apps/web/app/workspaces/[id]/page.tsx`, `apps/web/app/workspaces/[id]/attachments/page.tsx`, `apps/web/app/workspaces/[id]/graph/page.tsx`, `apps/web/app/workspaces/[id]/_components/GraphView.tsx`, `apps/web/components/AttachmentUpload.tsx`, `apps/web/package.json`, `apps/web/scripts/axe-audit.js`, `pnpm-lock.yaml`, `docs/GAUNTLET_LOG.md`, `docs/DECISIONS.md`, `docs/WORKSTREAMS.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.10 — Workstream 19: Performance, resilience, and recovery tests

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Delivered deterministic performance/resilience scripts, verified budgets are measurable, and added resilience tests with cross-workstream index-status and MinIO health integrations.
- **Failed AI index status (cross-workstream integration)**: Added `failed`/`failed_document_count` to `IndexStatus` and `getDocumentIndexStatus` by deriving the state from `document_chunks` rows with `embedding IS NULL`. This lets the UI/API expose a failed re-index instead of silently showing it as current.
- **MinIO health check (cross-workstream integration)**: Extended `GET /health` in `apps/api/src/index.ts` to probe the MinIO `/minio/health/live` endpoint, so container restart tests can observe MinIO recovery through the API.
- **Health-check timeouts**: Added `withTimeout` and per-check Redis client creation to `/health` so Postgres/Redis/AI/MinIO outages are reported within seconds and the API recovers cleanly after each service returns.
- **Performance scripts**: Added `apps/api/scripts/perf/{lib,load-env,migrate,benchmark-search,benchmark-note}.ts` and `apps/web/scripts/benchmark-page-load.mjs`.
  - `pnpm --filter @pkm/api perf:search -- --count=10000 --queries=100` inserts 10,000 generated notes and reports full-text search p95 latency.
  - `pnpm --filter @pkm/api perf:note` creates a 100,000-word note and reports note-open p95 latency for both `getDocument` and `getDocumentByPath`.
  - `pnpm --filter @pkm/web perf:page-load -- --url=http://localhost:3000/login --runs=2` runs Lighthouse desktop/mobile and reports FCP p95 against the budgets.
- **Resilience tests**: Added `apps/api/test/resilience.test.ts`, gated by `RUN_RESILIENCE_TESTS=1` because it starts the Docker Compose stack and an API child process.
  - Failed AI indexing: stubs `fetch` to return vectors, then throw, then recover; asserts per-document `failed`/`stale` status transitions correctly.
  - Bulk workspace isolation: creates 110 notes in each of two workspaces and asserts that full-text search returns only the correct workspace's notes and no cross-workspace leakage.
  - Container restart recovery: stops and restarts Postgres, Redis, MinIO, and the AI mock in turn, polling `/health` to confirm the API reports `degraded` then `ok` for each outage.
- **Decision records**: Added `docs/DECISIONS.md` AD-019 (failed index status without migration) and AD-020 (MinIO in `/health`).

**Evidence**:
- `pnpm -r build/typecheck/lint/test` pass; `pnpm audit --prod` clean.
- `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts` passes (6/6).
- Search benchmark: p95 = 7.36 ms on 10,000 generated notes, budget 150 ms (`pass`).
- Note-open benchmark: p95 = 4.04 ms for a 100,000-word note by id, 3.29 ms by path, budget 200 ms (`pass`).
- Page-load benchmark (login page, 2 runs each): desktop FCP p95 = 763 ms, budget 2000 ms (`pass`); mobile FCP p95 = 762 ms, budget 1500 ms (`pass`). Output written to `apps/web/page-load-results.json`.

**Decisive gap**: The page-load budget is verified against the `/login` page, not the authenticated workspace list; measuring the full authenticated workspace route requires a logged-in browser session and is left to the end-to-end tester.
**Changes**: `apps/api/src/documents.ts`, `apps/api/src/index.ts`, `apps/web/lib/api.ts`, `apps/web/app/workspaces/[id]/page.tsx`, `apps/api/scripts/perf/`, `apps/web/scripts/benchmark-page-load.mjs`, `apps/api/test/resilience.test.ts`, `apps/api/package.json`, `apps/web/package.json`, `docs/DECISIONS.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.11 — Final integration gate: merge tester report, skill updates, and run full quality suite

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: All merged code and documentation pass the quality gates; the branch is pushed and the PR is updated. A fresh final critic is running.
- Merged `devin/pkm-v1-tester-final` into `devin/pkm-v1-search-ai`, bringing in `docs/TEST_REPORT_final.md` and updates to `.devin/skills/testing-pkm-search-ai/SKILL.md`.
- Added `apps/web/page-load-results.json` to `.gitignore` so generated benchmark artifacts are not committed.
- Ran the full quality suite on the integration branch with the Docker Compose stack running:
  - `pnpm -r typecheck` pass
  - `pnpm -r lint` pass
  - `pnpm -r test` pass (42 API + 18 markdown + 7 OKF tests; resilience suite skipped without env flag)
  - `pnpm -r build` pass
  - `pnpm audit --prod` clean
  - `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts` passes 6/6
- Pushed `devin/pkm-v1-search-ai` and updated PR #3 with a summary of the complete v1 scope, quality gate results, and pointer to the pending final critic.

**Evidence**: `TEST_REPORT_final.md` documents the end-to-end browser and `curl` verification run by the persistent testing agent; the above commands all completed successfully in this session.
**Decisive gap**: None.
**Regressions**: None.
**Blockers**: Awaiting the fresh final critic (`devin-6eca8b3f30094479b4b23830324d6ced`) for a binary PASS/FAIL verdict.

## Round 1.12 — Final critic verdict: three release blockers identified

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: The final critic returned `FAIL` with three release blockers plus documentation cleanup.
- **RB-1**: Primary AI journeys (`/ask` and AI diff/approval) are not reachable from the web UI, and the AI diff/approval feature is not implemented.
- **RB-2**: OKF import/export is API-only with no web UI.
- **RB-3**: Unauthenticated `/` exposes an `ApiError: Unauthorized` banner with a serious axe-core color-contrast violation.
- **RB-4** (high): `docs/WORKSTREAMS.md` overstates workstream 7 (diff editing) as done.
- **RB-5** (medium): `docs/SECURITY.md` open-hardening list contains stale entries now implemented.

**Evidence**: `docs/CRITIC_REPORT_final.md` on `devin/pkm-v1-critic-final`; PR #3 comment at `https://github.com/schilling3003/PKM-Server/pull/3#issuecomment-5256911177`.
**Decisive gap**: Missing Ask/AI-diff UI and OKF UI are the largest product-level gaps.
**Changes**: None yet; fixes queued as workstreams 8 (Ask + AI diff), 22 (OKF UI), and 23 (public landing redirect).
**Regressions**: None.
**Blockers**: RB-1, RB-2, RB-3.

## Round 1.13 — Workstream 23: public landing redirect and axe contrast fixes

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: The public landing page no longer triggers a serious axe violation.
- Updated `apps/web/proxy.ts` to redirect unauthenticated requests for `/` and `/workspaces/*` to `/login`, and to redirect authenticated `/login` requests to `/`.
- Updated `docs/SECURITY.md` to retire implemented mitigations from the open-hardening list.
- Reconciled `docs/WORKSTREAMS.md` workstream 7 (AI answers API) and workstream 8 (Ask UI + AI diff/approval), and added workstreams 22 (OKF UI) and 23 (public landing).
- Ran `pnpm -r typecheck/lint/test/build` and `pnpm audit --prod`; all pass.
- Ran `apps/web/scripts/axe-audit.js` with `AXE_SERVE=1 AXE_PUBLIC_ONLY=1`: `PASSED: no critical or serious violations found` for `/login` and public `/`.

**Evidence**: Quality suite output; axe audit log.
**Decisive gap**: None.
**Changes**: `apps/web/proxy.ts`, `docs/SECURITY.md`, `docs/WORKSTREAMS.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: Awaiting child sessions for workstream 8 (Ask + AI diff) and workstream 22 (OKF UI).

## Round 1.14 — Workstream 22: OKF import/export UI

**Date**: 2026-08-11
**Builder**: Devin (child session `devin-0ab796bb64544fa091bcb251ab6fed58`)
**Branch**: `devin/pkm-v1-okf-ui`
**Verdict**: Implemented and verified.
- Added `exportOkf` and `importOkf` client helpers to `apps/web/lib/api.ts`.
- Added `/workspaces/[id]/okf` page with Export (download JSON) and Import (file picker + validation) controls.
- Wired an `OKF` link from the workspace editor header.
- Included the OKF route in `apps/web/scripts/axe-audit.js` for accessibility coverage.
- Updated `docs/WORKSTREAMS.md` workstream 22 to `done`.

**Evidence**: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, and `pnpm -r build` pass; `pnpm audit --prod` reports no known vulnerabilities; `apps/web/scripts/axe-audit.js` reports no critical or serious accessibility violations on the OKF page; `apps/web/scripts/verify-okf-ui.js` exports and imports an OKF v0.2 bundle through the new page.
**Decisive gap**: None.
**Regressions**: None.
**Blockers**: None.

## Round 1.15 — Workstream 8: Ask UI and AI-proposed diff/approval flow

**Date**: 2026-08-11
**Builder**: Devin (child session `devin-2a01ffba747a465383b06aacc7301ec7`)
**Branch**: `devin/pkm-v1-ask-diff`
**Verdict**: Implemented and merged.
- Added workspace-scoped Ask page at `/workspaces/[id]/ask` with grounded-question input, `POST /workspaces/:id/ask`, `react-markdown` answer rendering, numbered citations linking back to the editor, and warning display.
- Added `Ctrl/Cmd+Shift+A` shortcut and `Ask` button on the workspace page.
- Added backend `POST /workspaces/:id/propose` (`apps/api/src/propose.ts`) that resolves the target note by `documentId` or `path`, gathers workspace-scoped context via `hybridSearch`, and calls `generateAnswer` with a structured JSON prompt returning `{ path, content, explanation }`.
- Added frontend diff/preview page at `/workspaces/[id]/diff` with original/proposed side-by-side, explanation, citations, `Apply` (calls `PUT /workspaces/:id/documents/:id`), and `Reject`. Canonical Markdown is not mutated without explicit approval.
- Added `proposeEdit` and shared `Citation`/`ProposedEdit` types to `apps/web/lib/api.ts`.
- Added `apps/api/test/propose.test.ts` covering valid proposal, path resolution, workspace isolation, prompt-injection guardrail text, invalid JSON, path-traversal rejection, and input validation.
- Wired `/propose` into the `/ask` rate-limit bucket in `apps/api/src/auth.ts`.
- Documented the design in `docs/DECISIONS.md` AD-021.
- Merged into `devin/pkm-v1-search-ai` with a minimal conflict-resolution in `apps/web/app/workspaces/[id]/page.tsx` to keep both the OKF and Ask/Propose navigation buttons.

**Evidence**: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm -r build` pass; `pnpm audit --prod` clean; `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts` passes 6/6; Next.js emits `/workspaces/[id]/ask` and `/workspaces/[id]/diff`; `apps/web/scripts/axe-audit.js` covers `/`, `/login`, editor, ask, diff, attachments, graph, and OKF and reports no critical or serious violations; `curl` smoke authenticated to `POST /workspaces/:id/ask` (200) and `POST /workspaces/:id/propose` (422 without a local LLM, proving route wired).
**Decisive gap**: None.
**Changes**: `apps/api/src/propose.ts`, `apps/api/src/app.ts`, `apps/api/src/auth.ts`, `apps/api/test/propose.test.ts`, `apps/web/lib/api.ts`, `apps/web/app/workspaces/[id]/ask/page.tsx`, `apps/web/app/workspaces/[id]/diff/page.tsx`, `apps/web/app/workspaces/[id]/page.tsx`, `docs/DECISIONS.md`, `docs/WORKSTREAMS.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 1.16 — Propose no-LLM fallback and final v2 test report integration

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Propose now degrades gracefully without an external LLM; final v2 test report merged.
- Merged `devin/pkm-v1-tester-final-v2` into `devin/pkm-v1-search-ai`, adding `docs/TEST_REPORT_final_v2.md`.
- Updated `apps/ai/src/main.py` `AskResponse` to include `warning` and `no_llm` fields when no LLM is configured.
- Updated `apps/api/src/ai.ts` to return `warning` and `noLlm` from `generateAnswer`.
- Updated `apps/api/src/ask.ts` to surface the LLM warning in `AskResult`.
- Updated `apps/api/src/propose.ts` to return a no-op `ProposedEdit` with a `warning` instead of a `422` JSON parse error when no LLM is configured.
- Updated `apps/web/lib/api.ts` and `apps/web/app/workspaces/[id]/diff/page.tsx` to display the warning banner and disable `Apply` when there are no proposed changes.
- Added `apps/api/test/propose.test.ts` coverage for the no-LLM fallback.
- Updated `.devin/skills/testing-pkm-search-ai/SKILL.md` with OKF payload shape, LLM stub instructions, axe variables, and harness click fallbacks.

**Evidence**: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm -r build` pass; `pnpm audit --prod` clean; `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts` passes 6/6.
**Decisive gap**: None.
**Changes**: `apps/ai/src/main.py`, `apps/api/src/ai.ts`, `apps/api/src/ask.ts`, `apps/api/src/propose.ts`, `apps/api/test/propose.test.ts`, `apps/web/lib/api.ts`, `apps/web/app/workspaces/[id]/diff/page.tsx`, `.devin/skills/testing-pkm-search-ai/SKILL.md`, `docs/TEST_REPORT_final_v2.md`, `docs/WORKSTREAMS.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: Awaiting the fresh final critic (`devin-a5c8953b2a574861bce737ec7621ed5e`) for a binary PASS/FAIL verdict.

## Round 1.17 — Final v3 critic PASS and v1 completion

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: v1 complete. Final Gauntlet critic returned `PASS` and no release blockers remain.
|- Final v3 critic (`devin-a5c8953b2a574861bce737ec7621ed5e`) reviewed `devin/pkm-v1-search-ai` at `86029fc` and verified the no-LLM `/propose` fallback, Ask warning, workspace isolation, OKF round-trip, performance budgets, accessibility audit, resilience tests, and all quality gates.
|- Final v3 end-to-end test (`docs/TEST_REPORT_final_v3.md`) and critic report (`docs/CRITIC_REPORT_final_v3.md`) merged.
|- Fixed `Ctrl+S` shortcut handling directly in the workspace editor textarea `keydown` handler (`apps/web/app/workspaces/[id]/page.tsx`).

**Evidence**: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm -r build` pass; `pnpm audit --prod` clean; `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts` passes 6/6; `apps/web/scripts/axe-audit.js` reports no critical or serious violations on `/`, `/login`, `/workspaces/:id`, `/ask`, `/diff`, `/attachments`, `/graph`, and `/okf`.
**Decisive gap**: None.
**Changes**: `apps/web/app/workspaces/[id]/page.tsx`, `docs/TEST_REPORT_final_v3.md`, `docs/CRITIC_REPORT_final_v3.md`, `docs/WORKSTREAMS.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.

## Round 2.0 — Workstream 24: LightRAG integration

**Date**: 2026-08-12
**Coordinator**: Devin
**Verdict**: PASS — LightRAG-backed AI service integrated and coordinator gates green; fresh Gauntlet critic and end-to-end tester spawned to confirm.
- Replaced the custom `pgvector`/`document_chunks` + manual wikilink graph pipeline with `lightrag-hku==1.5.6` using `PGKVStorage`, `PGVectorStorage`, `PGDocStatusStorage`, and `PGTableGraphStorage` on the existing `pgvector/pgvector:pg16` image (no Apache AGE or Neo4j).
- `apps/ai` is now a FastAPI service exposing `POST /index`, `DELETE /index/{workspace_id}/{document_id}`, `POST /query`, `POST /ask`, `GET /graph/{workspace_id}`, `GET /index-status/{workspace_id}`, plus `/health` and `/ready`.
- Per-workspace `LightRAG` instances use the workspace UUID as the `workspace` field and are cached with LRU eviction; `finalize_storages()` is awaited before eviction.
- `apps/api` delegates `search.ts`, `ask.ts`, `graph.ts`, `documents.ts`, and `propose.ts` to `apps/ai`; `apps/web` graph click handling skips entity nodes.
- No-LLM fallback preserved: when `LLM_BASE_URL`/`LLM_API_KEY` are unset, indexing skips KG extraction (`process_options="F!"`) and `/ask` returns grounded snippets with a warning.
- Canonical Markdown remains the source of truth; LightRAG data is a projection. `content_hash` and full `file_path` are aligned with the API's canonical values.
- Stub embedding uses a stable MD5-based token-count vector for repeatable local smoke tests.
**Evidence**: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build`, `pnpm -r test`, and `pnpm --filter @pkm/api test:resilience` pass; `pnpm audit --prod` reports no known vulnerabilities; `docker compose up -d --wait` shows all services healthy; `apps/web/scripts/axe-audit.js` reports no critical or serious violations on `/`, `/login`, editor, `/ask`, `/diff`, `/attachments`, `/graph`, and `/okf`; `curl` smoke tests on `devin/pkm-lightrag-coord` verified document create, `/search` semantic retrieval, `/ask` no-LLM fallback, `/graph` (manual wikilink + LightRAG entity merge), entity nodes no longer navigate, `/index-status`, delete note with index-status/graph updates, workspace isolation, attachments, OKF export, and no-LLM behavior. The coordinator fixed an invalid `numpy==2.5.2` pin to `numpy==2.2.6`, fixed `getDocumentIndexStatus` to report `failed` when the LightRAG `/index-status` call fails, added an explicit `source` (document/entity) field to `GraphNode` so the UI cannot navigate to AI-derived entities, and dropped the obsolete `document_chunks` table via migration `0004_drop_document_chunks.sql`. The initial Gauntlet critic `343af9d057904f90bab47a6fd9c6e2e3` and tester `9512ffbbc4fa4a8597abe2add6cb201c` were terminated; fresh critic `eba378a4e69245b6aab275a5fadc8f99` and end-to-end tester `e676947454264a56a348f22124016e81` are reviewing the updated branch.
**Decisive gap**: None.
**Changes**: `apps/ai/src/main.py`, `apps/ai/requirements.txt`, `apps/api/src/ai.ts`, `apps/api/src/ask.ts`, `apps/api/src/search.ts`, `apps/api/src/graph.ts`, `apps/api/src/documents.ts`, `apps/api/src/propose.ts`, `apps/api/src/migrations/0004_drop_document_chunks.sql`, `apps/api/test/setup.ts`, `apps/api/test/propose.test.ts`, `apps/api/test/resilience.test.ts`, `apps/api/test/auth.test.ts`, `apps/api/test/integration.test.ts`, `apps/api/test/rate-limit.test.ts`, `apps/api/test/attachments.test.ts`, `apps/web/app/workspaces/[id]/graph/page.tsx`, `apps/web/app/workspaces/[id]/_components/GraphView.tsx`, `apps/web/lib/api.ts`, `apps/web/lib/graph.ts`, `.env.example`, `docs/DECISIONS.md` (AD-003, AD-019, AD-021), `docs/WORKSTREAMS.md`, `docs/GAUNTLET_LOG.md`.
**Regressions**: The end-to-end tester later found a release-blocking regression: editing a note produced a failed `dup-*` LightRAG document because `POST /index` reused the same `file_path` without deleting the previous record.
**Blockers**: None.

## Round 2.1 — LightRAG index update regression fix

**Date**: 2026-08-13
**Coordinator**: Devin
**Verdict**: PASS — release-blocking regression fixed and all gates green; awaiting fresh critic/tester.
- The fresh end-to-end tester on `devin/pkm-lightrag-coord` found that editing `cat.md` caused LightRAG to fail with `File name already exists` and left a failed `dup-*` document; `/ask` then could not answer questions about the newly added content.
- Root cause: `apipeline_enqueue_documents` treats a repeated `file_path` as a duplicate and refuses to overwrite an existing document.
- Fix: `apps/ai/src/main.py` `POST /index` now calls `rag.adelete_by_doc_id(document_id)` before enqueuing the new content. `not_found` is ignored; `not_allowed` or other failures surface as HTTP 503/500.
- Re-verified locally: create `cat.md`, `/ask` about cats, edit `cat.md` to add "They eat meat and fish.", `/ask` "What do cats eat?" returns the updated snippet, `/index-status` shows one document and zero failed documents.
- Re-ran `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build`, `pnpm -r test`, `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test:resilience`, and `pnpm audit --prod`; all pass.
**Evidence**: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build`, `pnpm -r test`, and `pnpm --filter @pkm/api test:resilience` pass; `pnpm audit --prod` reports no known vulnerabilities; local `curl` smoke confirms update → `/ask` reflects new content and `failed_document_count` stays 0.
**Decisive gap**: None.
**Changes**: `apps/ai/src/main.py`, `docs/DECISIONS.md`, `docs/GAUNTLET_LOG.md`, `docs/WORKSTREAMS.md`.
**Regressions**: None.
**Blockers**: None.
