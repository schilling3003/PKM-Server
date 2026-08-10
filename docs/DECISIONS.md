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
