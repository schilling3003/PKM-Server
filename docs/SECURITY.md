# PKM v1 Security

## Threat Model

- **Cross-workspace data leakage** through APIs, search, graph, vector
  retrieval, exports, logs, or backups.
- **Broken authorization** on documents, attachments, workspaces, and AI
  answers.
- **Injection** in Markdown rendering, wikilinks, frontmatter, imported
  bundles, and AI prompts.
- **Stored/reflected XSS** from unsafe note or attachment rendering.
- **SSRF** from user-supplied URLs in imports, attachments, or preview links.
- **CSRF/session attacks** against the web/API session.
- **Rate-limit abuse** on search, AI, and authentication endpoints.
- **Unsafe deserialization** of imported OKF bundles or Yjs updates.
- **Prompt injection** leaking system policy or other workspaces.
- **Dependency risk** from unvetted packages.

## Privacy Model

- Canonical note content never leaves the workspace boundary without explicit
  authorization.
- AI indexing receives only the canonical text of the workspace being indexed.
- Logs, traces, and metrics must not contain note bodies, embeddings, tokens,
  or private content.
- Attachments are stored as opaque blobs keyed by hash and workspace.

## Mitigations

- Workspace ID enforced in every DB query and service request.
- Content Security Policy applied by `apps/web/proxy.ts` using `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'` (`'unsafe-eval'` in development), `style-src 'self' 'unsafe-inline'`,
  `object-src 'none'`, `frame-ancestors 'none'`, and explicit `img-src`/`connect-src`/`font-src`
  origins. Markdown rendered through a hardened, allow-list-based pipeline.
- Attachment uploads limited by size and validated against a magic-byte allow-list
  (`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`,
  `text/plain`, `text/markdown`); executable, HTML, SVG, and unknown types are
  rejected. Downloads are proxied through the API and served with
  `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- Rate limiting at API gateway (`/auth/login`, `/auth/register`, `/workspaces/:id/search`,
  `/workspaces/:id/ask`, and `/workspaces/:id/attachments` plus `/attachments/:id`)
  backed by Redis with an in-memory fallback, applied per IP and per account.
- Search `q` and ask `question` capped at 500 characters.
- AI service `/embed` and `/ask` require a shared `X-API-Key` in both directions.
- Session cookies are signed, HTTP-only, `SameSite=Lax`, and cleared on logout; the
  signed cookie value is added to a Redis-backed server-side blocklist on `/auth/logout`
  so the token cannot be reused before `SESSION_MAX_AGE_SECONDS` expires.
- Production startup refuses to start if `SESSION_SECRET`, `S3_SECRET_KEY`,
  `DATABASE_URL`, or `AI_SERVICE_API_KEY` are missing.
- YAML frontmatter parsing limits alias expansion (`maxAliasCount: 50`) and documents
  are capped at 1 MiB to prevent billion-laughs-style and oversized-payload DoS.
- `/health` returns only top-level status and version, without internal service names
  or latencies.
- Input validation and sanitization at all boundaries.
- OWASP ASVS Level 2 controls mapped to tests and evidence.

## Implemented mitigations

- Workspace membership enforced on all `/workspaces/:id/*` and `/attachments/:id?workspaceId=...` routes via a global auth pre-handler.
- `/workspaces` list/create require authentication and only return workspaces the current user belongs to.
- `requireWorkspaceMembership` fails closed (`401`) when `request.user` is missing.
- Markdown link rendering uses a scheme allow-list (`http`, `https`, `mailto`, `tel`) to prevent malicious URLs.
- YAML frontmatter parsing has defensive limits: 1 MiB document size cap, 64 KiB frontmatter cap, `maxAliasCount: 50`, and `uniqueKeys`.
- OKF bundle import validates filenames, rejects reserved `index.md`/`log.md` placements, and preserves unknown YAML keys.

## Open hardening (in progress)

- Sub-resource integrity for third-party assets, if any are loaded.
- CSRF double-submit cookie review for cross-origin POSTs in multi-origin deployments.
- Fuzz and adversarial fixtures for Markdown, HTML, OKF, and attachment imports.

## Security-Test Plan

- Unit and integration tests for authorization and isolation.
- Fuzz and malicious fixtures for Markdown, HTML, OKF, and attachment imports.
- Prompt-injection fixtures evaluated for grounded answers and diff proposals.
- Static analysis, dependency audit, and container image scanning in CI.
- A fresh Gauntlet critic review after each security-focused integration.
