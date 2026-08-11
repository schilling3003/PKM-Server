# PKM v1 Decisions

## AD-001: API framework — Fastify

**Decision**: Use Fastify for the application API.

**Alternatives**: NestJS.

**Evidence**: Fastify provides lower latency and memory overhead than NestJS for
I/O-heavy JSON APIs, has first-class TypeScript support, and offers a simpler
routing/plugin model. NestJS would add abstraction and decorator overhead
without improving the v1 feature set. Fastify can be revisited if the API grows
large enough to benefit from NestJS module conventions.

**Reversibility**: Medium. Replacing Fastify with NestJS would primarily affect
`apps/api`; route handlers are isolated and OpenAPI contracts live in
`packages/shared`.

## AD-002: Primary database — PostgreSQL with pgvector

**Decision**: Use PostgreSQL 16 with the `pgvector` extension for relational,
full-text, and vector data.

**Alternatives**: Separate vector database, Neo4j, OpenSearch.

**Evidence**: A single database reduces operational surface and satisfies v1
requirements. pgvector supports `ivfflat`/`hnsw` indexes. Neo4j and OpenSearch
are excluded by project constraint unless measurements prove PostgreSQL
inadequate.

**Reversibility**: Medium. The domain model is not coupled to pgvector SQL
dialect; embeddings could migrate to a dedicated vector store later.

## AD-003: Semantic graph and retrieval — LightRAG

**Decision**: Use LightRAG for entity extraction, semantic retrieval, and the
derived knowledge graph, backed by PostgreSQL.

**Alternatives**: Building a custom graph/RAG pipeline.

**Evidence**: LightRAG provides entity and relationship extraction, vector
retrieval, and graph traversal in a maintained package with documented storage
backends. The application treats LightRAG records as projections of canonical
Markdown.

**Reversibility**: High. The canonical document store is independent of LightRAG
schema.

## AD-004: Collaborative editing — Yjs + Hocuspocus

**Decision**: Use Yjs for conflict-free replicated data types and Hocuspocus for
WebSocket provider infrastructure.

**Alternatives**: Operational Transform server, plain WebSocket.

**Evidence**: Yjs is mature for real-time collaborative text editing and
handles disconnect/reconnect. Hocuspocus provides authentication hooks and
PostgreSQL persistence adapters.

**Reversibility**: Medium. The editor state is a projection; canonical Markdown
remains authoritative.

## AD-005: Durable workflows — Temporal

**Decision**: Use Temporal for ingestion, indexing, and re-indexing workflows.

**Alternatives**: In-process background jobs, Celery, queued workers.

**Evidence**: Temporal offers durable execution, retries, visibility, and safe
re-indexing across process restarts.

**Reversibility**: Medium. Workers and workflows are isolated in `apps/api` and
`apps/ai`.

## AD-006: Authentication — bcrypt passwords and signed session cookies

**Decision**: Store users with `bcrypt`-hashed passwords and authenticate API
requests using signed `pkm_session` HTTP-only cookies via `@fastify/cookie`.
Workspace access is enforced by the `workspace_members` table.

**Alternatives**: Passwordless/OIDC-only, JWT access tokens, Redis-backed
sessions.

**Evidence**: Bcrypt is widely adopted for password hashing. Signed cookies keep
session state out of the database for local development while remaining
stateless. Workspace membership in Postgres keeps authorization logic in the
same transaction boundary as the data. OIDC fields remain in `.env.example` for
future provider abstraction.

**Reversibility**: Medium. Replacing signed cookies with Redis sessions or OIDC
tokens only affects `apps/api/src/auth.ts` and `apps/api/src/middleware/auth.ts`;
`users` and `workspace_members` tables are provider-agnostic.

## AD-007: OKF reserved filenames (`index.md` and `log.md`)

**Decision**: Treat `index.md` and `log.md` as OKF bundle-level reserved
artifacts. The regular document API rejects these names for concept notes.
OKF `export` routes reserved documents into `indices`/`logs` arrays, and
`import` writes them back as workspace documents using `{ allowReserved: true }`.

**Alternatives**: Allow `index.md`/`log.md` as normal concepts; map them to
dedicated `index`/`log` tables; structure indices and logs with parsed sections.

**Evidence**: `packages/okf` already declares `index.md` and `log.md` as reserved
for concepts. Preserving them as content-addressed `{ path, content }` entries in
the bundle makes round-trip import/export lossless without requiring a separate
schema or parser for v1, and keeps canonical Markdown as the source of truth.

**Reversibility**: Medium. The bundle shape is additive (`indices`/`logs` arrays
of objects with `path` and `content`). A future front can switch to parsed
`OkfIndex`/`OkfLog` structures while still accepting the current content-based
entries for backward compatibility.

## AD-008: Markdown frontmatter parsing limits

**Decision**: Cap canonical document size at 1 MiB, frontmatter at 64 KiB, and
YAML aliases at 100. Parse frontmatter YAML with `uniqueKeys: true` and
`maxAliasCount: 100` and surface parse/validation failures as `400` responses.

**Alternatives**: Use a separate YAML parser, restrict all frontmatter to a
fixed schema, or rely on process-level memory limits.

**Evidence**: A 3-level alias bomb can expand to a ~700 KB object from a tiny
frontmatter string, causing per-request CPU/memory exhaustion. The `yaml` package
provides `maxAliasCount`; byte limits prevent oversized notes and frontmatter.
A `DocumentValidationError` mapped to `400` keeps the API from crashing or
returning misleading 500s for malformed user input.

**Reversibility**: Low. These are numeric safety limits and can be raised or
made configurable via environment variables without schema changes.

## AD-009: Post-login redirect target

**Decision**: After successful registration or login, redirect the web UI to `/`
(the home page, which lists the user's workspaces) rather than `/workspaces`,
which is not implemented.

**Alternatives**: Implement a dedicated `/workspaces` index page.

**Evidence**: The current home page already serves the workspace-list role. A
separate `/workspaces` route can be added later if the product requires a
different layout for that view.

**Reversibility**: High. Redirect target is a single string in `login/page.tsx`.
