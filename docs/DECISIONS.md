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

## AD-008: Server-side session invalidation blocklist

**Decision**: Keep signed user-ID cookies but add a server-side blocklist for
`/auth/logout` so the signed cookie cannot be reused before its `maxAge` expires.

**Alternatives**: Replace signed cookies with opaque Redis-backed sessions, issue
short-lived JWTs, or rotate the signing secret on every logout.

**Evidence**: A blocklist keyed by the signed cookie value with a TTL equal to the
cookie lifetime is the smallest change that closes the critical release blocker.
It does not require a session table or secret rotation. The existing `Redis`
connection is reused, with an in-memory fallback for test environments.

**Reversibility**: Medium. Replacing this with full server-side sessions only affects
`apps/api/src/session-blocklist.ts`, `apps/api/src/auth.ts`, and
`apps/api/src/middleware/auth.ts`.

## AD-009: Attachment content validation and proxy serving

**Decision**: Validate attachment uploads by magic bytes against an allow-list of
safe formats and proxy downloads through the API with `Content-Disposition: attachment`
and `X-Content-Type-Options: nosniff`.

**Alternatives**: Redirect to a presigned MinIO URL with `response-content-type` set
from user-supplied values, or use a content-type allow-list without magic-byte checks.

**Evidence**: Presigned redirects let the uploader control `response-content-type`
and could serve executable or HTML content. Magic-byte verification and proxy serving
keeps the API in control of headers and content type. The object store remains an
opaque blob backend.

**Reversibility**: Low. The download contract changes from a 302 redirect to a 200
with the body; clients must already follow the API route. Upload validation is additive.

## AD-010: YAML frontmatter alias and document-size limits

**Decision**: Parse YAML frontmatter with `maxAliasCount: 50` and cap total document
content at 1 MiB.

**Alternatives**: Use a smaller `maxAliasCount`, add `maxDocumentLength`/`maxLength`
options if the `yaml` library supports them, or validate only source string length.

**Evidence**: The `yaml` package exposes `maxAliasCount` but does not support
`maxLength` or `maxDocumentLength` in the version used. A 50-alias cap prevents the
demonstrated billion-laughs-style frontmatter bomb while remaining generous for normal
use. The 1 MiB document cap catches oversized payloads at the API boundary.

**Reversibility**: High. The limits are configured in `packages/markdown/src/parser.ts`
and `apps/api/src/documents.ts` and can be adjusted without schema changes.
