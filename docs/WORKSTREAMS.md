# PKM v1 Workstreams

## Ownership and Status

| # | Workstream | Owner | Status | Depends On |
|---|------------|-------|--------|------------|
| 1 | Canonical Markdown, YAML, and OKF domain model | coordinator | done | — |
| 2 | Document persistence, revisioning, snapshots, recovery | coordinator | done | 1 |
| 3 | Editor fidelity, keyboard workflows, slash commands, palette | child-3872c0 | in_progress | 1, 2 |
| 4 | Navigation, folders, tabs, properties, tags, outline, links, backlinks | child-3872c0 | in_progress | 1, 2 |
| 5 | Full-text search, filters, quick switcher, unlinked mentions | coordinator | done | 1, 2 |
| 6 | Semantic search, embeddings, vector retrieval | coordinator | done | 1, 2 |
| 7 | Grounded AI answers, citations, abstention, diff editing | coordinator | done | 1, 6 |
| 8 | Collaboration, presence, reconnects, conflicts, concurrent edits | unassigned | planned | 2, 3 |
| 9 | Authentication, workspace membership, authorization, isolation | coordinator | v1-todo | — |
| 10 | Attachments, safe rendering, imports, exports, migration | unassigned | planned | 1, 9 |
| 11 | Responsive design, accessibility, theming, interaction states | unassigned | planned | 3, 4 |
| 12 | Performance, resilience, rate limiting, observability, backups | unassigned | planned | all |
| 13 | Supply-chain security, privacy, threat model, abuse cases | unassigned | planned | 9, 10 |
| 14 | Clean-checkout onboarding, development tooling, CI, release readiness | coordinator | in_progress | all |

## Shared Contracts

- Canonical Markdown and YAML frontmatter schema: `packages/shared`.
- OpenAPI/tRPC API contracts: `packages/shared`.
- Database migrations in `apps/api/prisma/migrations` (coordinator owned).
- Docker Compose local stack: root `docker-compose.yml` (coordinator owned).

## Integration Order

1. Workstream 1 (canonical model) first.
2. Workstreams 2, 3, and 9 in parallel once contracts are frozen.
3. Workstreams 4, 5, 6, 8, 10 after persistence and auth.
4. Workstreams 7, 11, 13 after search and graph are functional.
5. Workstream 12 and 14 continuously and after all others.
