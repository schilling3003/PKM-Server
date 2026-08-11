# PKM v1 Workstreams

## Ownership and Status

| # | Workstream | Owner | Status | Depends On |
|---|------------|-------|--------|------------|
| 1 | Canonical Markdown, YAML, and OKF domain model | coordinator | done | — |
| 2 | Document persistence, revisioning, snapshots, recovery | coordinator | done | 1 |
| 3 | Editor fidelity, keyboard workflows, slash commands, palette | child-3872c0 | done (v1 scope: split source/preview, Ctrl+S save) | 1, 2 |
| 4 | Navigation, folders, tabs, properties, tags, outline, links, backlinks | child-3872c0 | done (v1 scope: tree, switcher, create/rename/delete, backlinks) | 1, 2 |
| 5 | Full-text search, filters, quick switcher, unlinked mentions | coordinator | done | 1, 2 |
| 6 | Semantic search, embeddings, vector retrieval | coordinator | done | 1, 2 |
| 7 | Grounded AI answers, citations, abstention, diff editing | coordinator | done | 1, 6 |
| 8 | Collaboration, presence, reconnects, conflicts, concurrent edits | unassigned | planned | 2, 3 |
| 9 | Authentication, workspace membership, authorization, isolation | child-auth | done | — |
| 10 | Attachments, safe rendering, imports, exports, migration | child-attachments | in_progress | 1, 9 |
| 11 | Responsive design, accessibility, theming, search UI, quick switcher | child-webui | in_progress | 3, 4 |
| 12 | Performance, resilience, rate limiting, observability, backups | unassigned | planned | all |
| 13 | Supply-chain security, privacy, threat model, abuse cases | unassigned | planned | 9, 10 |
| 14 | Clean-checkout onboarding, development tooling, CI, release readiness | coordinator | in_progress | all |

## Shared Contracts

- Canonical Markdown and YAML frontmatter schema: `packages/shared`.
- OpenAPI/tRPC API contracts: `packages/shared`.
- Database migrations in `apps/api/src/migrations` (coordinator owned; builders must not create conflicting `0004_*` files).
- Docker Compose local stack: root `docker-compose.yml` (coordinator owned).

## Current Parallel Builders

| Session | Branch | Workstream | Exclusive ownership | Must not touch |
|---------|--------|------------|---------------------|----------------|
| child-auth | `devin/pkm-v1-auth` | 9 (done) | `apps/api/src/auth.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/migrations/0004_auth.sql`, `apps/web/app/login/page.tsx`, `apps/web/lib/auth.ts`, `apps/web/middleware.ts`, `apps/web/components/UserNav.tsx` | `apps/api/src/app.ts`, `apps/web/app/workspaces/[id]/page.tsx`, `apps/web/app/page.tsx`, `apps/web/app/layout.tsx`, `apps/web/lib/api.ts` |
| child-attachments | `devin/pkm-v1-attachments` | 10 | `apps/api/src/attachments.ts`, `apps/api/src/migrations/0005_attachments.sql`, `apps/web/app/workspaces/[id]/attachments/page.tsx`, `apps/web/lib/attachments.ts`, `apps/web/components/AttachmentUpload.tsx` | `apps/api/src/app.ts`, `apps/web/app/workspaces/[id]/page.tsx`, `apps/web/app/page.tsx`, `apps/web/app/layout.tsx`, `apps/web/lib/api.ts` |
| child-webui | `devin/pkm-v1-search-theme` | 5 & 11 | `apps/web/components/SearchPalette.tsx`, `apps/web/components/CommandPalette.tsx`, `apps/web/hooks/useSearch.ts`, `apps/web/app/workspaces/[id]/page.tsx` (search integration only), `apps/web/app/globals.css` (theme tokens), `apps/web/app/layout.tsx` (theme class) | `apps/api/*` except route registration helpers, `apps/web/lib/api.ts` (may read but not edit), `apps/web/app/login/*` |

## Integration Order

1. Workstream 1 (canonical model) first.
2. Workstreams 2, 3, and 9 in parallel once contracts are frozen.
3. Workstreams 4, 5, 6, 8, 10 after persistence and auth.
4. Workstreams 7, 11, 13 after search and graph are functional.
5. Workstream 12 and 14 continuously and after all others.
