# PKM v1 Architecture

## Service Boundaries

| Service | Responsibility | Technology |
|---------|----------------|------------|
| `web` | React/Next.js application, editor, navigation, command palette | Next.js 15, React 19, TypeScript, Tailwind CSS, Milkdown, CodeMirror |
| `api` | Application API, auth, CRUD, search orchestration, websockets | Fastify 5, TypeScript, Prisma, tRPC/REST |
| `ai` | Indexing, embeddings, LightRAG, retrieval, grounded answers | FastAPI, Python 3.12, LightRAG, sentence-transformers |
| `postgres` | Application data, search vectors, LightRAG production storage | PostgreSQL 16 with `pgvector` |
| `redis` | Presence, rate limiting, caching, ephemeral locks | Redis 7 |
| `minio` | S3-compatible immutable attachments, exports, snapshots | MinIO |
| `temporal` | Durable ingestion, indexing, and re-indexing workflows | Temporal server + `temporal` worker |

## Canonical Data Flow

1. User edits a note in `web`.
2. Visual editor (Milkdown/ProseMirror) or source editor (CodeMirror) keeps
   canonical Markdown with YAML frontmatter.
3. Yjs/Hocuspocus/WebSocket sync merges concurrent edits.
4. The `api` persists canonical Markdown to `postgres` (documents table,
   revisions table).
5. Change events are pushed to a `temporal` workflow.
6. The `ai` service ingests canonical Markdown, updates embeddings in
   `pgvector`, and updates LightRAG records.
7. Search, graph, backlinks, and AI answers read derived projections only.
8. Import/export reads and writes canonical Markdown and attachments from
   `minio`.

## Schemas

- `Workspace` isolates all data.
- `User` and `UserWorkspace` membership control access.
- `Document` stores canonical Markdown (`content`), normalized path,
  frontmatter JSONB, and a content hash.
- `Revision` stores immutable snapshots keyed by content hash.
- `Link` and `Backlink` tables are derived from canonical content.
- `IndexState` records per-document AI index status and consumed revision.
- `Attachment` records S3 keys, MIME types, and checksums.

## Trust Boundaries

- Workspace ID is the primary authorization scope in every query.
- AI service receives only the workspace-scoped canonical text it is asked to
  index or retrieve; it does not hold session cookies.
- Object storage keys include workspace and content hash prefixes.
- OIDC identity is abstracted behind an internal `AuthProvider`; the
  application never assumes a specific provider.

## Versioning

- API contracts are versioned through OpenAPI schemas under `packages/shared`.
- Database migrations are forward-safe and transactional where possible.
- OKF adapter is pinned to v0.2 and isolated in `packages/okf`.
- All migrations and exports include an explicit schema version.
