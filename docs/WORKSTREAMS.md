# PKM v1 Workstreams

## Ownership and Status

| # | Workstream | Owner | Status | Depends On |
|---|------------|-------|--------|------------|
| 1 | Canonical Markdown, YAML, and OKF domain model | coordinator | done | — |
| 2 | Document persistence, revisioning, snapshots, recovery | coordinator | done | 1 |
| 3 | Editor fidelity, keyboard workflows, slash commands, palette | child-3872c0 | done (v1 scope: split source/preview, Ctrl+S save) | 1, 2 |
| 4 | Navigation, folders, tabs, properties, tags, outline, links, backlinks | child-3872c0 | done (v1 scope: tree, switcher, create/rename/delete, backlinks) | 1, 2 |
| 5 | Full-text search, filters, quick switcher, unlinked mentions | child-webui (`devin/pkm-v1-search-theme`) | done | 1, 2 |
| 6 | Semantic search, embeddings, vector retrieval | coordinator | done | 1, 2 |
| 7 | Grounded AI answers, citations, abstention, diff editing | coordinator | done | 1, 6 |
| 8 | Collaboration, presence, reconnects, conflicts, concurrent edits | unassigned | planned | 2, 3 |
| 9 | Authentication, workspace membership, authorization, isolation | child-auth (`devin/pkm-v1-auth`) | done | — |
| 10 | Attachments, safe rendering, imports, exports, migration | child-attachments (`devin/pkm-v1-attachments`) | done | 1, 9 |
| 11 | Responsive design, accessibility, theming, search UI, quick switcher | child-webui (`devin/pkm-v1-search-theme`) | done | 3, 4 |
| 12 | Performance, resilience, rate limiting, observability, backups | unassigned | planned | all |
| 13 | Supply-chain security, privacy, threat model, abuse cases | child-security-hardening (`devin/pkm-v1-security-hardening`) | done (merged) | 9, 10 |
| 14 | Clean-checkout onboarding, development tooling, CI, release readiness | child-ci (merged PR #5) | done | all |
| 15 | Graph view, note outline, tags/properties panel | child-graph (`devin/pkm-v1-graph-panel`) | done (merged) | 3, 4 |
| 16 | Autosave, wikilink autocomplete, unlinked mentions, duplicate/archive/restore | coordinator (`devin/pkm-v1-autosave-ux`) | done (merged) | 3, 4, 15 |
| 17 | AI index status, observability, and staleness indicators | coordinator (`devin/pkm-v1-ai-observability`) | done (merged) | 7, 15 |
| 18 | Revision history API and UI (list/restore previous versions) | child-revisions (`devin/pkm-v1-revisions`) | done (merged) | 2, 3 |
| 19 | Performance, resilience, and recovery tests (100k note, 10k workspace, restart, failed indexing) | child-perf (`devin/pkm-v1-perf`) | in_progress | all |
| 20 | Accessibility audit and keyboard navigation polish | child-a11y (`devin/pkm-v1-a11y`) | done | 3, 4, 11 |
| 21 | Final Gauntlet integration, clean checkout reproducibility, and PR readiness | coordinator | in_progress | all |

## Shared Contracts

- Canonical Markdown and YAML frontmatter schema: `packages/shared`.
- OpenAPI/tRPC API contracts: `packages/shared`.
- Database migrations in `apps/api/src/migrations` (coordinator owned).
- Docker Compose local stack: root `docker-compose.yml` (coordinator owned).

## Recently Completed Builders

| Session | Branch | Workstream | Integration notes |
|---------|--------|------------|-------------------|
| child-auth | `devin/pkm-v1-auth` | 9 | Adds `users`, `workspace_members`, signed-cookie auth, login page, and membership middleware. Coordinator must wire `requireAuth` into `buildApp` and `UserNav` into layout. |
| child-attachments | `devin/pkm-v1-attachments` | 10 | Adds MinIO-backed attachments table, upload/list/download/delete routes, and `/workspaces/:id/attachments` page. Coordinator must wire `registerAttachmentRoutes` into `buildApp`. |
| child-webui | `devin/pkm-v1-search-theme` | 5 & 11 | Adds search palette, quick switcher, theme toggle/provider, and responsive workspace layout. Already integrated into `workspaces/[id]/page.tsx` and `layout.tsx`. |

## Integration Order

1. Workstream 1 (canonical model) first.
2. Workstreams 2, 3, and 9 in parallel once contracts are frozen.
3. Workstreams 4, 5, 6, 8, 10 after persistence and auth.
4. Workstreams 7, 11, 13 after search and graph are functional.
5. Workstream 12 and 14 continuously and after all others.
