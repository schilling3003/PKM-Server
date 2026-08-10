# PKM v1 Workstreams

## Ownership and Status

| # | Workstream | Owner | Status | Depends On |
|---|------------|-------|--------|------------|
| 1 | Canonical Markdown, YAML, and OKF domain model | coordinator | planned | — |
| 2 | Document persistence, revisioning, snapshots, recovery | builder-1 | planned | 1 |
| 3 | Editor fidelity, keyboard workflows, slash commands, palette | builder-2 | planned | 1 |
| 4 | Navigation, folders, tabs, properties, tags, outline, links, backlinks | builder-3 | planned | 1, 2 |
| 5 | Full-text search, filters, quick switcher, unlinked mentions | builder-4 | planned | 1, 2 |
| 6 | Semantic search, LightRAG ingestion, entities, graph | builder-5 | planned | 1, 2 |
| 7 | Grounded AI answers, citations, abstention, diff editing | builder-6 | planned | 1, 6 |
| 8 | Collaboration, presence, reconnects, conflicts, concurrent edits | builder-7 | planned | 2, 3 |
| 9 | Authentication, workspace membership, authorization, isolation | builder-8 | planned | — |
| 10 | Attachments, safe rendering, imports, exports, migration | builder-9 | planned | 1, 9 |
| 11 | Responsive design, accessibility, theming, interaction states | builder-10 | planned | 3, 4 |
| 12 | Performance, resilience, rate limiting, observability, backups | builder-11 | planned | all |
| 13 | Supply-chain security, privacy, threat model, abuse cases | builder-12 | planned | 9, 10 |
| 14 | Clean-checkout onboarding, development tooling, CI, release readiness | coordinator | planned | all |

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
