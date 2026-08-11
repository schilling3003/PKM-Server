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

**Decision**: Cap canonical document size at 1 MiB, frontmatter at 64 KiB, and
YAML aliases at 50. Parse frontmatter YAML with `uniqueKeys: true` and
`maxAliasCount: 50` and surface parse/validation failures as `400` responses via a
`DocumentValidationError` with `statusCode: 400`.

**Alternatives**: Use a separate YAML parser, restrict all frontmatter to a fixed
schema, rely on process-level memory limits, or validate only source-string length.

**Evidence**: A 3-level alias bomb can expand to a ~700 KB object from a tiny
frontmatter string, causing per-request CPU/memory exhaustion. The `yaml` package
exposes `maxAliasCount` and `uniqueKeys` but does not support `maxLength` or
`maxDocumentLength` in the version used. Byte limits prevent oversized notes and
frontmatter; `DocumentValidationError` keeps the API from crashing or returning
misleading 500s for malformed user input.

**Reversibility**: High. The limits are configured in `packages/markdown/src/parser.ts`
and `apps/api/src/documents.ts` and can be adjusted without schema changes.

## AD-011: Post-login redirect target

**Decision**: After successful registration or login, redirect the web UI to `/`
(the home page, which lists the user's workspaces) rather than `/workspaces`,
which is not implemented.

**Alternatives**: Implement a dedicated `/workspaces` index page.

**Evidence**: The current home page already serves the workspace-list role. A
separate `/workspaces` route can be added later if the product requires a
different layout for that view.

**Reversibility**: High. Redirect target is a single string in `login/page.tsx`.

## AD-012: Content-Security-Policy (source-based, no per-request nonces)

**Decision**: Apply a CSP in `apps/web/proxy.ts` using source directives and `'unsafe-inline'`, with `'unsafe-eval'` added in development only. Per-request nonces are not used.

**Alternatives**: Per-request nonce CSP (`'nonce-<value>' 'strict-dynamic'`); static CSP with `'unsafe-inline'`/`'unsafe-eval'`.

**Evidence**: Next.js 16.3.0 with Turbopack does not propagate the `Content-Security-Policy` request-header nonce generated by `proxy.ts` to the `nonce` attributes emitted on `<script>`/`<style>` tags. This produced a mismatch that blocked all application JS in development. Attempting to combine `'unsafe-inline'` with `'strict-dynamic'` also fails because `strict-dynamic` disables host-based allowlisting and `unsafe-inline` when a nonce or hash is present. Removing both nonces and `strict-dynamic` while keeping the remaining source directives (`default-src 'self'`, `img-src` to self/S3, `connect-src` to self/API, `object-src 'none'`, `frame-ancestors 'none'`, etc.) allows the UI to load under CSP and still blocks cross-origin frames, objects, fonts, and unlisted connections.

**Reversibility**: Medium. The policy is isolated in `apps/web/proxy.ts`; nonce support can be restored if Next.js nonce propagation becomes reliable.

## AD-013: Password hashing with `bcryptjs`

**Decision**: Use `bcryptjs` (pure JavaScript) for password hashing instead of the native `bcrypt` package.

**Alternatives**: Keep `bcrypt`, replace with `argon2` or `scrypt`.

**Evidence**: `bcrypt` depends on `tar`, which triggered a production `pnpm audit` failure. `bcryptjs` provides the same API, avoids native binaries, and keeps the supply-chain surface smaller for a v1 project. It is slower than native bcrypt but acceptable at expected user scale.

**Reversibility**: Low. The hashing algorithm and cost remain the same, so verifying existing hashes still works; only the package import changes.

## AD-014: Configurable, opt-in LLM for `/ask`

**Decision**: Implement `/ask` in the Python AI service as an optional call to an OpenAI-compatible `chat/completions` endpoint controlled by `LLM_BASE_URL` and `LLM_API_KEY`. When unset, return a safe grounded note-list response.

**Alternatives**: Always call a hard-coded model provider; embed a local model in the AI service; leave the endpoint as a permanent stub.

**Evidence**: Requiring explicit `LLM_BASE_URL` and `LLM_API_KEY` acts as opt-in consent for sending note context to an external model, satisfying AGENTS.md privacy boundaries. The system prompt includes grounding and prompt-injection refusal instructions. The API falls back to a note list when no model is configured, so the product is usable without external AI.

**Reversibility**: Medium. The prompt structure, endpoint, and provider can be changed in `apps/ai/src/main.py` without affecting the API contract.

## AD-015: Integration test database isolation

**Decision**: Create a dedicated `pkm_test` database on demand in `apps/api/test/setup.ts` and override `process.env.DATABASE_URL` before any test module imports `db.ts`.

**Alternatives**: Require `docker-compose.test.yml`; truncate the main `pkm` database; set `TEST_DATABASE_URL` manually.

**Evidence**: Tests previously truncated the developer's main `pkm` database. Creating `pkm_test` in a top-level `setup.ts` keeps dev/test data isolated without adding another compose file or manual setup. The same root `.env` is loaded so credentials match the dev stack.

**Reversibility**: High. The setup is in one test file and one env variable.

## AD-016: Case-insensitive, percent-decoded wikilink resolution

**Decision**: Resolve wikilinks case-insensitively and percent-decode standard Markdown URLs before matching them against document paths. Store normalized lowercase target paths in `document_links`.

**Alternatives**: Require exact path casing; reject mixed-case targets; store display text separately.

**Evidence**: `[[Project Ideas]]` and `[[project ideas]]` should resolve to the same `project ideas.md` note. `wikiToStandard` now percent-encodes spaces, and `standardToWiki` decodes them. Without case/URL normalization, graph edges and backlinks break when users capitalize titles differently or include spaces in filenames.

**Reversibility**: High. The `document_links.target_path` column is a projection; re-normalizing can be re-run for existing rows.
