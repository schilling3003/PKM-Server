# PKM v1 — Gauntlet Round 0.5 Critic Report

**Branch reviewed:** `devin/pkm-v1-search-ai`  
**Report branch:** `devin/pkm-v1-critic-round-0-5`  
**Date:** 2026-08-11  
**Critic:** Devin Gauntlet critic  

## Verdict

**FAIL — not releasable.**

The walking skeleton is functional for most user journeys (register/login, workspace isolation, document CRUD, backlinks, search, ask, OKF round-trip, attachments) and all automated gates pass. However, there are **decisive release blockers** in authentication/session management and first-use UX that would regress real users, plus several high-severity security findings from `SECURITY_REVIEW.md` that remain unresolved. The branch should be fixed and re-reviewed before it can be considered Gauntlet-accepted.

---

## Gates run

| Gate | Command | Result |
|------|---------|--------|
| Clean install | `pnpm install` | Pass |
| Type check | `pnpm -r typecheck` | Pass |
| Lint | `pnpm -r lint` | Pass |
| Tests | `pnpm -r test` | Pass (20 API tests + package tests) |
| Build | `pnpm -r build` | Pass |
| Local stack | `docker compose up -d --wait` | Healthy (Postgres 16, Redis, MinIO, Temporal) |

> Snapshot build was incomplete, so setup was rerun from a clean state (`rm -rf node_modules .venv .next dist`, `cp .env.example .env`, `pnpm install`). The stack started successfully after `.env` was present.

---

## Verification evidence

### 1. Auth endpoints

- `POST /auth/register` and `POST /auth/login` return a signed `pkm_session` cookie and user object.
- `GET /workspaces` without a cookie returns `401 Unauthorized`.
- `GET /workspaces/:id` without a cookie returns `401 Unauthorized`.
- Workspace isolation works: a non-member receives `403 Forbidden` for `GET /workspaces/:id`, document routes, search, ask, and attachments.

### 2. Document journeys

- Document create, read, update, rename (`PUT .../path`), and delete work through the API.
- Backlinks resolve once the target note exists.
- Search (`/search?q=...`) and `/ask` stay within the workspace and do not leak across workspaces.

### 3. OKF import/export

- `POST /workspaces/:id/import` accepts a bundle with reserved `index.md`/`log.md` entries placed in `indices`/`logs` arrays.
- `GET /workspaces/:id/export` round-trips these reserved documents correctly.
- Attempting to put `index.md` inside `concepts` is rejected with `Reserved filename cannot be used for a concept`.

### 4. Attachments

- Upload, list, download (302 to MinIO presigned URL), and delete work for workspace members.
- Cross-workspace attachment access returns `403 Forbidden` / `404 Not Found` as expected.

### 5. Browser verification

- The login page loads at `http://localhost:3000/login`.
- After login, the user is redirected to `/workspaces`, which **does not exist** and returns a Next.js 404.
- The home page (`/`) shows the workspace list and allows creation when navigated to manually.
- The workspace detail page loads, notes render, wikilinks resolve, and the side panel shows outgoing/backlink/unresolved link sections.

---

## Release blockers

These are regressions or latent defects that break core user journeys or security guarantees. They must be fixed before this branch can be accepted.

### RB-1: Logout does not invalidate the session on the server

**Severity:** Critical (auth bypass / session hijack risk)

**Reproduction:**

```bash
API=http://localhost:4000
COOKIE_JAR=/tmp/cookies.txt
rm -f $COOKIE_JAR

# register and login
curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X POST -H "Content-Type: application/json" \
  -d '{"email":"rb1@example.com","password":"password123"}' $API/auth/register
curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X POST -H "Content-Type: application/json" \
  -d '{"email":"rb1@example.com","password":"password123"}' $API/auth/login

# logout
curl -s -b $COOKIE_JAR -X POST $API/auth/logout

# the same cookie still grants access
curl -s -o /dev/null -w "%{http_code}\n" -b $COOKIE_JAR $API/workspaces
# => 200
```

**Location:** `apps/api/src/auth.ts:92-99`, `apps/api/src/middleware/auth.ts:12-23`

**Why it matters:** The cookie is a signed user ID. Calling `/auth/logout` only clears the browser cookie; the server has no session store, so the signed token remains valid until `maxAge` (7 days). Anyone who captures or re-sets the cookie can continue as the user.

**Smallest fix:** Add a server-side token blocklist in Redis keyed by the signed cookie value. On `/auth/logout`, store the current cookie value with a TTL equal to `SESSION_MAX_AGE_SECONDS`. In `resolveUser`, reject any cookie whose value is in the blocklist. This makes logout effective without a full session rewrite. For production, move to opaque session tokens stored server-side.

---

### RB-2: Login/Register success redirects to a 404 page

**Severity:** Blocker (first-use UX is broken)

**Reproduction:**

1. Open `http://localhost:3000/login`.
2. Register or log in with valid credentials.
3. The app calls `router.push('/workspaces')` and lands on:

```
404 | This page could not be found.
http://localhost:3000/workspaces
```

**Location:** `apps/web/app/login/page.tsx:25`

**Smallest fix:** Change `router.push('/workspaces')` to `router.push('/')` (the home page is the workspace list). Optionally create `app/workspaces/page.tsx`, but the existing home page already serves that purpose.

---

### RB-3: Attachment upload trusts file extension and content-type

**Severity:** High (stored XSS / malware delivery)

**Reproduction:**

```bash
# Upload HTML payload with a .txt extension and text/plain content-type
BOUNDARY=----attest
TMP=$(mktemp)
{
  printf -- '--%s\r\n' "$BOUNDARY"
  printf 'Content-Disposition: form-data; name="file"; filename="report.txt"\r\n'
  printf 'Content-Type: text/plain\r\n\r\n'
  printf '<html><body><script>alert(1)</script></body></html>\r\n'
  printf -- '--%s--\r\n' "$BOUNDARY"
} > "$TMP"

ATT=$(curl -s -b $COOKIE_JAR -X POST \
  -H "Content-Type: multipart/form-data; boundary=$BOUNDARY" \
  --data-binary "@$TMP" \
  $API/workspaces/$WS_ID/attachments)
echo "$ATT"
```

Result: the upload is accepted and the download redirect uses `response-content-type=text/plain` but stores the object with the attacker-supplied type. If a browser later opens a `.txt` file that is actually HTML, it can be sniffed/rendered as HTML.

**Location:** `apps/api/src/attachments.ts:52-111`, `261-278`

**Smallest fix:**
1. Add a **block-list** for executable/script content-types (done) and enforce a **magic-byte allow-list** for the few file types you actually want to serve inline (images, PDF, text).
2. Do **not** let the uploader control the served `Content-Type`. Determine the type from magic bytes in the API and always serve downloads with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
3. Consider proxying attachment bytes through the API rather than redirecting to MinIO with user-controllable response headers.

---

### RB-4: YAML frontmatter parsing has no alias/length limits

**Severity:** High (DoS / billion-laughs-style expansion)

**Reproduction:**

```bash
curl -s -X POST -H "Content-Type: application/json" -b $COOKIE_JAR \
  -d '{"path":"yaml-bomb.md","content":"---\na: &a [x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]\n---\nbody"}' \
  $API/workspaces/$WS_ID/documents
```

A 3-level payload expands to a ~700 KB object and is stored without error. Deeper or larger payloads could exhaust memory/CPU per note.

**Location:** `packages/markdown/src/parser.ts:34`

**Smallest fix:** Pass limits to `yaml.parse`:

```ts
parseYaml(frontmatterRaw, {
  strict: true,
  maxAliasCount: 100,
  maxLength: 8192,
  maxDocumentLength: 16384,
})
```

Also add an overall document size cap in `documents.ts`/`okf.ts`.

---

## High-severity findings still unresolved

These were flagged in `SECURITY_REVIEW.md` on `origin/devin/pkm-v1-security-review` and are still present. They do not all block the walking skeleton, but several are trivial to fix and should not wait.

| ID | Finding | Status | Location |
|----|---------|--------|----------|
| 2 | Signed user-ID cookie, weak fallback secret, no rotation | Open | `apps/api/src/auth.ts:30-51` |
| 3 | No rate limiting on auth/search/ask/attachments | Open | `apps/api/src/app.ts`, `index.ts` |
| 4 | Attachment content validation by extension only | Open | `apps/api/src/attachments.ts:52-111` |
| 5 | Prompt injection via concatenated string, AI service called over plain HTTP | Open | `apps/api/src/ask.ts:37-44`, `apps/ai/src/main.py` |
| 6 | No Content-Security-Policy / security headers | Open | `apps/web/next.config.ts`, verified with `curl -I` |
| 7 | YAML frontmatter parsing unbounded | Open | `packages/markdown/src/parser.ts:34` |
| 8 | Docker/dependency image pins and supply-chain | Open | `docker-compose.yml`, `pnpm audit` |
| 9 | Dev fallback secrets in `.env.example` | Open | `.env.example` |
| 10 | Attachment membership bypass | **Fixed** — verified cross-workspace returns 403/404 |
| 11 | `/health` leaks internal service topology unauthenticated | Open | `apps/api/src/index.ts:45-57` |
| 12 | CORS `credentials` not set / origin not constrained | Open | `apps/api/src/app.ts:14` |
| 13 | Search query length not limited | Open | `apps/api/src/search.ts:5-13` |
| 14 | User email visible in `UserNav` (minor privacy) | Open | `apps/web/components/UserNav.tsx` |
| 15 | AI service has no authentication | Open | `apps/ai/src/main.py` |
| 16/17 | Logging/retention and dev defaults | Open | `apps/api/src/index.ts:138` |

**Note:** Finding 10 (attachment auth bypass) and the unauthenticated `/workspaces` enumeration have been correctly fixed in this branch.

---

## Build / supply-chain

- `pnpm audit --prod` reports multiple `critical` and `high` findings in `tar`, transitively pulled in by `bcrypt` → `@mapbox/node-pre-gyp`.
- The API currently uses `bcrypt` for password hashing. Consider switching to `@node-rs/bcrypt` (Rust implementation) or adding a `pnpm.packageExtensions`/`pnpm.overrides` for `tar` to a patched version to close the supply-chain gap.

---

## Minor UX / polish issues

- The login form renders raw JSON validation errors as the error string (e.g., `{"error":"Validation error","details":...}`). The API error format should be parsed or the API should return a plain `error` string for UI display.
- `app/page.tsx` loads the workspace list but has no unauthenticated landing state; unauth users see an error until they navigate to `/login`.
- `Attachments` and `login` pages use `gray`/`blue` utility classes while the rest of the app uses theme tokens (`bg-background`, `text-foreground`, etc.), causing inconsistency in dark mode.

---

## Recommended acceptance criteria for the next round

1. **Session/logout** works server-side: after `POST /auth/logout`, the cookie is rejected by all protected routes and the AI/attachment endpoints.
2. **Login/register redirect** lands on a working page (`/` or a new `/workspaces` index).
3. **Attachment** uploads are validated by magic bytes and served with `nosniff` / `attachment` headers.
4. **YAML** parsing has `maxAliasCount`, `maxLength`, and total document size limits.
5. **Security headers** (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) are added to the web app.
6. **`/health`** does not expose internal service names and latency unless authenticated.
7. Re-run `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm -r build`, and the full curl/browser checklist from this report.

---

## Conclusion

`devin/pkm-v1-search-ai` is a coherent integrated build, but it cannot be Gauntlet-accepted while logout is client-only and new users are dropped onto a 404 after logging in. Fix RB-1 and RB-2 first, then address the high-severity security findings (RB-3, RB-4, session secrets, CSP, and rate limiting) before the next critic round.
