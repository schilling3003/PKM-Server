# PKM v1 Gauntlet Critic Report — Round 0.9

**Branch reviewed:** `devin/pkm-v1-search-ai` (`schilling3003/PKM-Server`)  
**Reviewer:** Devin Gauntlet critic  
**Date:** 2026-08-11  
**Standards:** `AGENTS.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY_BAR.md`, `docs/SECURITY.md`

---

## Summary

The `devin/pkm-v1-search-ai` branch boots a working local stack, passes all required gates (`typecheck`, `lint`, `test`, `build`, `pnpm audit --prod`), and implements the advertised v1 feature set: workspace-scoped Markdown notes, wikilinks, backlinks, full-text/semantic/hybrid search, graph/outline/tags/index-status panels, attachment upload/download with magic-byte validation, session invalidation, rate limiting on auth/search/ask, nonce-based CSP, and AI-service API-key auth. Workspace isolation holds against cross-user attempts, the AI service returns real 384-dimensional embeddings, and the `/ask` endpoint safely falls back to citations when no LLM is configured.

No release-blocking defect was reproduced. The verdict is **PASS**. The highest-impact remaining gaps are (1) the absence of rate limiting on attachment uploads/downloads despite `docs/SECURITY.md` listing it as open hardening, and (2) missing end-to-end/performance/accessibility coverage relative to `docs/QUALITY_BAR.md` and `docs/PRODUCT.md` acceptance criteria.

---

## Verdict

**PASS**

No cross-workspace leakage, auth bypass, CSP bypass, YAML bomb, invalid attachment, or gate failure was observed. The branch is releasable for a v1 private/self-hosted target if the high findings below are scheduled for the next hardening round.

---

## Release Blockers

None.

---

## High Findings

### H-1: `docs/SECURITY.md` lists attachment rate limiting as open hardening, but no rate limiter is wired to attachment routes

`apps/api/src/auth.ts` only applies per-IP/per-account Redis-backed rate limiting to `/auth/login`, `/auth/register`, `/workspaces/:id/search`, and `/workspaces/:id/ask`. `apps/api/src/attachments.ts` has no rate-limit hook. A logged-in workspace member can POST an unbounded number of 10 MiB files.

Evidence:

```ts
// apps/api/src/auth.ts
if (parts[0] === 'workspaces' && parts[2] && (parts[2] === 'search' || parts[2] === 'ask')) {
  // ... rate limit logic
}
// no branch for attachments
```

`docs/SECURITY.md` line 68 lists "Rate limiting on auth, search, `/ask`, and attachments" under **Open hardening (in progress)**, while line 38 lists only auth/search/ask under **Mitigations**. The document is inconsistent and the code does not implement the broader claim.

### H-2: No end-to-end, performance, or accessibility gate coverage

`pnpm -r test` runs only package and `apps/api` unit/integration tests. `apps/web` has no test script, and there are no axe, Playwright, or load-test suites. `docs/PRODUCT.md` acceptance criteria require:

- automated end-to-end tests for primary user journeys,
- keyboard operability,
- zero serious/critical axe violations,
- 100,000-word notes and 10,000-note workspaces within `docs/QUALITY_BAR.md` budgets.

None of these were exercised in this review because no harness exists. This is a documentation/quality gap, not a runtime defect, but it blocks a confident production release.

---

## Medium/Low Findings

### M-1: Default Next.js 404 page uses inline `<style>` without a CSP nonce (medium)

`apps/web/proxy.ts` correctly injects per-request nonces into `script-src` and `style-src`, and `curl` confirms the response header nonce matches the HTML body nonces. However, the default `/_not-found` route rendered by Next.js 16 contains an inline `<style>` block with no `nonce` attribute; under `style-src 'self' 'nonce-...'` this styling will be blocked. A custom `app/not-found.tsx` should apply the same nonce.

### M-2: `SECURITY.md` is internally inconsistent (medium)

The **Mitigations** section says rate limiting is on `/auth/login`, `/auth/register`, `/workspaces/:id/search`, `/workspaces/:id/ask`, while **Open hardening** repeats the same controls plus attachments. Several items in **Open hardening** (session blocklist, attachment magic-byte validation, CSP, AI API key, `/health` disclosure) are already implemented. The doc needs a single authoritative pass.

### M-3: `/ask` LLM path has only been exercised with the no-LLM fallback (low)

When `LLM_BASE_URL` and `LLM_API_KEY` are unset, `/workspaces/:id/ask` returns a safe note-list response. The prompt-injection-resistant system prompt and OpenAI-compatible call path in `apps/ai/src/main.py` look correct, but no live or mocked LLM call was verified end-to-end in this review.

### M-4: Web graph panel is minimal (low)

The graph page renders nodes and reports counts, but node labels, link directions, and zoom/pan affordances are bare. This is acceptable for v1 but should be enhanced before broad release.

### L-1: Development-only `eval`/`new Function` CSP warning (low)

`next dev` logs a CSP-related console warning about `eval()` not being supported. This disappears in `next start`/standalone production builds; it is not a runtime blocker.

### L-2: Wikilink autocomplete popup is unstyled and anchored to the textarea container corner (low)

Functionality verified in the browser (`[[n` → candidate `note` → Enter inserts `[[note|n]]`), but the popup has no visible highlight beyond browser defaults and does not track the caret. Fine for v1, polish later.

---

## Evidence

### Gates

All required gates passed on a clean checkout:

```text
$ pnpm -r typecheck
... Done (all packages)

$ pnpm -r lint
apps/web lint$ eslint
apps/web lint: Done
apps/api lint$ tsc --noEmit
apps/api lint: Done

$ pnpm -r test
packages/markdown test: 16 passed
packages/okf test: 7 passed
apps/api test: 39 passed (auth, rate-limit, integration, attachments)

$ pnpm -r build
apps/web build: Compiled successfully
apps/api build: Done
```

`pnpm audit --prod` returned `No known vulnerabilities found`.

### Docker Compose and health

```text
$ docker compose up -d --wait
Container pkm-server-postgres-1  Healthy
Container pkm-server-redis-1     Healthy
Container pkm-server-minio-1     Healthy
Container pkm-server-temporal-1  Healthy

$ curl -s http://localhost:4000/health
{"status":"ok","version":"0.1.0"}

$ curl -s http://localhost:8000/health
{"status":"ok","version":"0.1.0"}
```

### AI embedding

`POST /embed` with `EMBEDDING_PROVIDER=sentence-transformers` returns a real 384-dimensional vector:

```text
$ curl -s -X POST http://localhost:8000/embed \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: dev-ai-key-change-in-production' \
  -d '{"text":"cat"}' | node -e "..."
len 384
```

### Semantic search

Created `cat.md` and `animals.md` in a fresh workspace:

```text
GET /workspaces/:id/search?q=cat
[
  { "path": "cat.md", "rank": 0.3, ... },
  { "path": "animals.md", "rank": 0.1, ... }
]

GET /workspaces/:id/search?q=animals
[
  { "path": "animals.md", "rank": 0.3, ... },
  { "path": "cat.md", ... }
]
```

Both queries returned the most relevant document first, demonstrating full-text + vector hybrid ordering.

### Workspace isolation (cross-user)

User 1 owns workspace `WS1`; User 2 is not a member. User 2 receives `403 Forbidden` for every cross-workspace path tested:

```text
GET  /workspaces/:WS1/search?q=cat     -> 403 Forbidden
GET  /workspaces/:WS1/documents/:note1 -> 403 Forbidden
GET  /workspaces/:WS1/graph            -> 403 Forbidden
GET  /workspaces/:WS1/index-status     -> 403 Forbidden
POST /workspaces/:WS1/attachments      -> 403 Forbidden
```

User 1 listing `/workspaces` returns only workspaces they belong to; User 2's workspace is not present.

### Session invalidation

```text
GET  /workspaces/:id (with valid cookie)   -> 200
POST /auth/logout                          -> {"ok": true}
GET  /workspaces/:id (same cookie)       -> 401 Unauthorized
POST /auth/login (same credentials)      -> new session cookie
GET  /workspaces/:id (new cookie)        -> 200
```

Logout immediately invalidates the cookie; re-login issues a fresh token.

### Attachment validation and headers

- Plain text upload: `201` with correct metadata.
- HTML disguised as `.txt`: `400 {"error":"File type is not allowed"}`.
- Download response headers:

```text
content-type: text/plain
content-disposition: attachment; filename="plain.txt"
x-content-type-options: nosniff
```

- Cross-user attachment download: `403 Forbidden`.

### CSP nonce

A single request with `curl -i` produced a `Content-Security-Policy` header containing `nonce-<value>`; that same nonce appeared twice in the response body (script and style tags).

```text
Nonce in header: nonce-MDNhNWUzMjgtNzI4NS00MzAwLWJkMjMtMmU1OTdhMWEzZTRi
Matches in body: 2
```

### AI service auth

```text
POST /embed without X-API-Key -> 401 Invalid or missing API key
POST /ask   without X-API-Key -> 401 Invalid or missing API key
```

### Health disclosure

Both `/health` endpoints return only `status` and `version`:

```json
{"status":"ok","version":"0.1.0"}
```

### `/ask` behavior

With no LLM configured:

```json
{
  "answer": "I reviewed the cited notes above, but this v1 instance does not have a configured language model...",
  "citations": [
    { "id": "...", "path": "cat.md", "title": "cat", "snippet": "..." },
    { "id": "...", "path": "animals.md", "title": "animals", "snippet": "..." }
  ]
}
```

The response cites exact source notes and does not hallucinate.

### YAML frontmatter safety

A YAML alias-bomb payload was rejected:

```text
POST /workspaces/:id/documents
{"error":"Excessive alias count indicates a resource exhaustion attack"}
HTTP:400
```

### Graph, outline, tags/properties, index-status panels

API responses:

```text
GET /workspaces/:id/graph
{"nodes":[{"id":"...","path":"animals.md","title":"animals","type":"Note"},...],"edges":[]}

GET /workspaces/:id/index-status
{"document_count":2,"indexed_document_count":2,"current_document_count":2,
 "stale_document_count":0,"chunk_count":4,"embedded_chunk_count":4}

GET /workspaces/:id/documents/:id/index-status
{"document_id":"...","chunk_count":2,"embedded_chunk_count":2,"stale":false}
```

Browser inspection confirmed the right sidebar renders **Outgoing**, **Backlinks**, **Unlinked mentions**, **Index status**, **Outline**, and **Properties** sections. The **Graph** page loaded at `/workspaces/:id/graph` and displayed a node with "1 notes · 1 links".

### Wikilink autocomplete

In the browser, typing `[[n` in the source textarea produced a candidate list containing `note`; pressing Enter inserted `[[note|n]]`, which rendered as an internal link button in the preview and updated the Outgoing/Backlink panels.

---

## Recommended Changes

1. **Implement attachment rate limiting** and add tests. Reuse the existing `RateLimiter` in `apps/api/src/auth.ts` or as a route-level pre-handler in `apps/api/src/attachments.ts`; match the per-IP/per-account pattern used for search/ask. Then reconcile `docs/SECURITY.md` so it no longer lists this as open hardening.

2. **Reconcile `docs/SECURITY.md`** so **Mitigations**, **Implemented mitigations**, and **Open hardening** are mutually consistent and reflect the actual code.

3. **Add end-to-end and accessibility coverage** for the primary journeys (login, create note, edit, wikilink autocomplete, search, graph, attachments). Add a load/performance test for the `docs/QUALITY_BAR.md` budgets.

4. **Create a custom `app/not-found.tsx`** that applies the per-request nonce to any inline `<style>`/`<script>`, eliminating the CSP warning on 404 pages.

5. **Exercise the LLM `/ask` path** against a mock OpenAI-compatible server in CI to verify prompt construction, citation format, and prompt-injection refusal behavior.

6. **Polish the graph UI** with readable labels, directed edge indicators, and better zoom/pan controls.

---

## Single Largest Meaningful Gap to Fix Next

**Attachment rate limiting**: the Redis-backed `RateLimiter` already exists and is tested; the only missing piece is wiring it to `POST /workspaces/:id/attachments` and `GET /attachments/:id`. This closes a clear DoS/storage-abuse vector and resolves the inconsistency with `docs/SECURITY.md`.
