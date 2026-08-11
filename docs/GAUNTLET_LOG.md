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
