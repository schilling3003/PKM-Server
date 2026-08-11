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
- Updated `.env.example` with `LLM_*` and `TEST_DATABASE_URL` documentation.
**Evidence**: `pnpm -r build/typecheck/lint/test` pass; `pnpm audit --prod` clean; API tests run against `pkm_test` and do not touch `pkm`; `packages/markdown` round-trip tests pass with `Project Ideas` target containing a space.
**Critic report**: Round 0.8 critic session in progress.
**Decisive gap**: The configurable LLM path has not been exercised against a live model; only the stub and mock are verified. This is acceptable for v1 when the operator has not configured a model.
**Changes**: `apps/api/src/env.ts`, `apps/api/src/index.ts`, `apps/api/src/ask.ts`, `apps/api/src/ai.ts`, `apps/api/test/setup.ts`, `apps/ai/src/main.py`, `apps/api/src/attachments.ts`, `packages/markdown/src/links.ts`, `packages/markdown/test/parser.test.ts`, `.env.example`, `docs/GAUNTLET_LOG.md`.
**Regressions**: None.
**Blockers**: None.
