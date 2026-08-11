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

## Round 0.6 — Fresh critic review after round 0.5 security fixes

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: FAIL — four release blockers identified.
- Round 0.5 critic reviewed `devin/pkm-v1-search-ai` after the workspace-auth fix. Build, typecheck, lint, tests, and local stack pass; most user journeys work.
- Release blockers: (RB-1) `/auth/logout` does not invalidate the signed cookie server-side; (RB-2) login/register redirects to missing `/workspaces` route; (RB-3) attachment upload trusts extension/content-type; (RB-4) YAML frontmatter parsing has no alias/length limits.
- Several high findings from `SECURITY_REVIEW.md` remain open (CSP, rate limiting, AI auth, `/health` info leak, CORS, search length). These are being addressed by the workstream 13 security hardening child.
**Evidence**: Critic report `devin/pkm-v1-critic-round-0-5` branch; all gates passed locally; browser verification shows the 404 after login.
**Decisive gap**: Logout/server-side session invalidation, attachment content validation, YAML limits, and login redirect.
**Changes**: None yet; fixes queued in workstream 13 security hardening and will be re-reviewed.
**Regressions**: None.
**Blockers**: Security hardening child in flight.

## Round 0.7 — Address round 0.5 release blockers RB-2 and RB-4

**Date**: 2026-08-11
**Coordinator**: Devin
**Verdict**: Partial fix; two release blockers resolved.
- RB-2 (login/register 404): `apps/web/app/login/page.tsx` now redirects to `/` instead of `/workspaces`; `apps/web/lib/auth.ts` extracts a plain `error` string from JSON API responses.
- RB-4 (YAML limits): `packages/markdown/src/parser.ts` now enforces a 1 MiB document size cap, a 64 KiB frontmatter cap, and a `maxAliasCount` of 100 with `uniqueKeys`; YAML parse errors and size violations are re-thrown as `DocumentValidationError`.
- `apps/api/src/app.ts` error handler maps `DocumentValidationError` to `400`.
- Added `packages/markdown/test/parser.test.ts` coverage for size, frontmatter size, and alias-bomb rejection.
**Evidence**: `pnpm -r build/typecheck/lint/test` pass; `curl` to the running API returns `400` for an alias-bomb note and `/workspaces` unauthenticated still returns `401`.
**Decisive gap**: RB-1 (server-side logout invalidation) and RB-3 (attachment content-type/magic-byte validation) are in progress in the workstream 13 security hardening child.
**Changes**: `apps/web/app/login/page.tsx`, `apps/web/lib/auth.ts`, `packages/markdown/src/parser.ts`, `packages/markdown/src/index.ts`, `packages/markdown/test/parser.test.ts`, `apps/api/src/app.ts`.
**Regressions**: None.
**Blockers**: None.
