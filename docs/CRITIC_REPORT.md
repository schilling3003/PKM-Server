# PKM v1 Critic Report — Round 0.7

**Branch reviewed:** `origin/devin/pkm-v1-search-ai`  
**Report branch:** `devin/pkm-v1-critic-round-0-7`  
**Date:** 2026-08-11  
**Reviewer:** Gauntlet critic (fresh context)

## Summary

This review re-ran the required gates and manually verified the endpoints and UI against `AGENTS.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY_BAR.md`, and `docs/SECURITY.md`.

The core feature set is in place and the security hardening from Round 0.6 is mostly effective: workspace isolation, auth/authz, session invalidation, attachment magic-byte validation, YAML frontmatter limits, rate limiting scaffolding, AI API-key enforcement, and minimal health disclosure all work as intended. The graph view, outline panel, tags/properties panel, and search/ask endpoints are wired and functional.

However, three items explicitly listed in `docs/SECURITY.md` as open hardening remain unresolved, and one of them is a critical production-dependency CVE. These are release blockers.

## Verdict

**FAIL**

The branch cannot be released until the blockers below are resolved. The largest and most urgent gap is the production dependency audit failure (RB-1).

## Release Blockers

### RB-1: Production dependency audit fails — critical `tar` CVEs via `bcrypt`/`node-pre-gyp`

`pnpm audit --prod` reports **12 vulnerabilities**, including **1 critical** and **7 high**, all through the path `apps__api > bcrypt > @mapbox/node-pre-gyp > tar`.

- Critical: `node-tar: Decompression/parse DoS via unlimited input` (GHSA-23hp-3jrh-7fpw)
- High: arbitrary file creation/overwrite, symlink poisoning, negative tar entry size infinite loop, etc.

This directly violates the open hardening item in `docs/SECURITY.md`: *“Dependency audit remediation (`tar` via `bcrypt`/`node-pre-gyp`).”* A release cannot ship with a known critical CVE in the production dependency tree, regardless of whether `tar` is actively exercised at runtime.

### RB-2: CSP is not strict — `script-src` allows `unsafe-inline` and `unsafe-eval`

`apps/web/next.config.ts` sets:

```
script-src 'self' 'unsafe-eval' 'unsafe-inline'
```

and the running server emits `X-Powered-By: Next.js`. This contradicts `AGENTS.md` and `docs/SECURITY.md`, which require a strict Content Security Policy. `unsafe-inline` defeats CSP’s primary XSS defense, and `unsafe-eval` weakens it further. The app does not appear to need either for its current Next.js/React bundle, so this is an avoidable release blocker.

### RB-3: Rate limiter is unreliable in production-like deployments

Two operational issues remain in `apps/api/src/rate-limit.ts`:

1. **Fail-open on Redis errors.** When `redisClient` is configured and the Redis `eval` fails, the limiter logs a warning and returns `{ allowed: true }`. This means a Redis outage or overload disables rate limiting for all protected endpoints.
2. **Per-IP limits are ineffective behind a reverse proxy.** The Fastify app is created without `trustProxy`, so `request.ip` is the socket remote address. In any deployment with a reverse proxy or load balancer, all requests share the proxy’s IP, making the IP-based bucket useless and leaving account-only limits.

These issues undermine the rate-limiting control called out in `docs/SECURITY.md`.

## High Findings

### H-1: `/ask` endpoint is a stub and does not synthesize grounded answers

`apps/ai/src/main.py` `/ask` always returns:

> “I reviewed the cited notes above, but this v1 instance does not have a configured language model. Please check the cited sources directly.”

`apps/api/src/ask.ts` forwards this as the answer. While citations are returned, the product requirement in `docs/PRODUCT.md` — *“Ask grounded questions across notes and receive citations to exact source notes and relevant passages”* — is not met. Workstream 7 in `docs/WORKSTREAMS.md` should not be marked done until a real model path is wired, prompt-injection controls are in place, and abstention behavior is demonstrated.

### H-2: No prompt-injection controls for the AI path

The prompt in `apps/api/src/ask.ts` concatenates user question and note content with a single instruction:

```
You are a helpful research assistant. Answer the user's question using ONLY the provided notes...
```

There are no delimiters, no system/user role separation, and no output constraints. When a real LLM is configured, a malicious note could hijack the prompt. `docs/SECURITY.md` lists this as open hardening.

### H-3: Integration tests truncate the development database

`apps/api/test/integration.test.ts` runs `TRUNCATE users, workspace_members, workspaces, documents, revisions, document_links, document_chunks, attachments CASCADE` in `beforeAll` against the same `pool` used by the running API. Running the test suite against a local dev stack wipes all user data. The test harness should use a separate test database or isolated transactions.

### H-4: Local environment variables are loaded per package, not from the repo root

`import 'dotenv/config'` in `apps/api/src/index.ts` and `load_dotenv()` in `apps/ai/src/main.py` load `.env` from the process working directory. `pnpm --filter <pkg> dev` runs inside each package directory, so the root `.env` is ignored unless copied into `apps/api` and `apps/ai`. This caused the AI service to reject the API’s embeddings during this review because the shared API key was not loaded. Production deployments that inject env vars are unaffected, but local reproducibility is fragile.

## Medium / Low Findings

### M-1: `X-Powered-By: Next.js` leaks stack information

The response headers include `X-Powered-By: Next.js`. This is minor but should be disabled with `poweredByHeader: false` in `next.config.ts`.

### M-2: Attachment text validation only scans the first 4 KB

`isSafeText` in `apps/api/src/attachments.ts` checks the first 4096 bytes for HTML/executable tags. A large text file with malicious tags later in the payload would be accepted. The content-type and extension checks are also extension-based for text files. Consider scanning the entire file or using libmagic.

### M-3: `standardToWiki` regex is fragile

`packages/markdown/src/links.ts` uses `\[([^\]]+)\]\(([^)]+)\.md\)` to convert standard Markdown links back to wikilinks. This will mangle links containing `]` or `)` in text/URL and does not handle titles. For OKF round-tripping this is currently sufficient for the test fixtures, but it is not a robust Markdown parser.

### L-1: Next.js middleware deprecation warning

`pnpm -r build` emits: *“The `middleware` file convention is deprecated. Please use `proxy` instead.”* This is not a release blocker but should be addressed before it becomes a breaking change.

## Evidence

### Required gates

- `pnpm -r typecheck` — passed (all workspace packages)
- `pnpm -r lint` — passed (`apps/web` eslint, `apps/api` `tsc --noEmit`)
- `pnpm -r test` — passed (37 tests across `packages/markdown`, `packages/okf`, `apps/api`)
- `pnpm -r build` — passed (`apps/web` standalone build, `apps/api` tsc + migrations copy)
- `docker compose ps` — all services healthy (postgres, redis, minio, temporal)
- `curl http://localhost:4000/health` — `{"status":"ok","version":"0.1.0"}`
- `curl http://localhost:8000/health` — `{"status":"ok","version":"0.1.0"}`

### Workspace isolation

Created `ReviewWS` and two notes (`a.md` linking to `b.md`). Cross-workspace request:

```bash
curl -b cookies.txt http://localhost:4000/workspaces/00000000-0000-0000-0000-000000000000/graph
# -> {"error":"Forbidden"}
```

Same-workspace graph returns only its own nodes and edges.

### Graph endpoint

```json
{
  "nodes": [
    { "id": "d1f4c4ed-...", "path": "a.md", "title": "a", "type": "Note" },
    { "id": "28e02c71-...", "path": "b.md", "title": "b", "type": "Concept" }
  ],
  "edges": [
    { "source": "d1f4c4ed-...", "target": "28e02c71-...", "type": "markdown" }
  ]
}
```

### Session invalidation

```bash
curl -b cookies.txt http://localhost:4000/auth/me
# -> {"user":{"id":"82e71477-...","email":"review@example.com"}}
curl -b cookies.txt -X POST http://localhost:4000/auth/logout
# -> {"ok":true}
curl -b cookies.txt http://localhost:4000/auth/me
# -> {"error":"Unauthorized"}
```

### Rate limiting

Burst of failed login attempts from the same IP:

```
attempt 1: 400
attempt 2: 400
attempt 3: 400
attempt 4: 400
attempt 5: 429
attempt 6: 429
```

The 429 response includes `retry-after: 60`.

### Attachment validation

- PNG with correct magic bytes: accepted (`id` returned)
- HTML file: `{"error":"File type is not allowed"}`

Download response headers:

```
Content-Disposition: attachment; filename="fake.png"
X-Content-Type-Options: nosniff
```

### CSP / security headers

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
X-Powered-By: Next.js
```

### AI service API key

```bash
curl -X POST http://localhost:8000/embed -d '{"text":"x"}'
# -> {"detail":"Invalid or missing API key"}
curl -H 'X-API-Key: wrong' ...
# -> {"detail":"Invalid or missing API key"}
curl -H 'X-API-Key: dev-ai-key-change-in-production' ...
# -> {"dimensions":384}
```

### Health disclosure

```bash
curl http://localhost:4000/health
# -> {"status":"ok","version":"0.1.0"}
```

No internal service names or latencies are returned.

### YAML frontmatter safety

Oversized document:

```json
{ "error": "Request body is too large" }
```

Nested alias bomb:

```json
{ "error": "Excessive alias count indicates a resource exhaustion attack" }
```

### UI panels

Browser verification of `/workspaces/:id` shows:

- Note source/preview split
- Left file tree
- Right “Note details” panel with Outgoing, Backlinks, Outline, and Properties (type, tags) sections
- Graph view renders workspace-scoped nodes and edges

### Dependency audit

`pnpm audit --prod`:

```
12 vulnerabilities found
Severity: 4 moderate | 7 high | 1 critical
```

All from `apps__api > bcrypt > @mapbox/node-pre-gyp > tar`.

## Recommended Changes

1. **Fix production dependency audit (RB-1).** Either:
   - Add a `pnpm.overrides` entry forcing `tar` to `>=7.5.21` and re-run `pnpm install`, or
   - Replace `bcrypt` with `bcryptjs` to remove the native/`node-pre-gyp`/`tar` chain entirely.
   Re-run `pnpm audit --prod` and make it pass before release.

2. **Harden CSP (RB-2).** In `apps/web/next.config.ts`:
   - Remove `'unsafe-inline'` and `'unsafe-eval'` from `script-src`.
   - Use nonces or hashes if any inline scripts are genuinely required.
   - Set `poweredByHeader: false` to remove `X-Powered-By`.

3. **Make rate limiting fail-closed and proxy-aware (RB-3).**
   - On Redis errors, deny the request (or fall back to the existing in-memory store, not an unconditional allow).
   - Enable Fastify `trustProxy` and use the `X-Forwarded-For` derived IP for per-IP buckets.

4. **Complete the AI ask path (H-1, H-2).**
   - Wire a configurable model provider in `apps/ai`.
   - Add delimiter/role-based prompt templates and output constraints to mitigate prompt injection.
   - Demonstrate abstention when notes do not contain an answer.

5. **Isolate test database (H-3).** Change `apps/api/test/integration.test.ts` to connect to a `pkm_test` database (or use a transaction rollback strategy) so `pnpm -r test` cannot wipe the dev stack’s data.

6. **Improve local env loading (H-4).** Document that `apps/api` and `apps/ai` each need a `.env` copy for local `pnpm --filter` runs, or add a workspace-level env loader to the root setup instructions.

## Single Largest Meaningful Gap to Fix Next

**RB-1 — dependency audit failure.** The `tar` critical CVE (and the surrounding high-severity `tar` issues) is an objective, high-severity supply-chain blocker. It is the first thing CI and any security review will flag, and the fix is mechanical (override or swap `bcrypt`). Fix this before all other recommendations.
