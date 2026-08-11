# PKM v1 Gauntlet Critic Report — Round 0.8

**Branch reviewed:** `origin/devin/pkm-v1-search-ai` (latest HEAD `3aeb093`)  
**Report branch:** `devin/pkm-v1-critic-round-0-8`  
**Critic date:** 2026-08-11  
**Verdict:** **FAIL**

## Summary

The latest `devin/pkm-v1-search-ai` branch resolves the previous round’s critical runtime blockers: `bcryptjs` ESM import is fixed, `/auth/register` and `/auth/login` work, sessions are properly invalidated on logout, nonce-based CSP headers are present, attachment validation rejects dangerous types, and workspace isolation holds across documents, search, graph, and `/ask`.

The new features (duplicate/archive/restore, autosave, unlinked mentions) also work at the API level and are wired into the UI.

However, the **wikilink autocomplete** feature—explicitly in-scope for v1 and just added in this round—is broken in the UI: accepting a candidate inserts a malformed, double-bracketed link that uses the full file path (`roadmap.md`) instead of the note title (`roadmap`). This breaks a core v1 product requirement and is the single largest gap to fix.

A second, non-runtime issue is that `pnpm -r typecheck` does not pass on a clean checkout until `packages/markdown` is built first, because `packages/okf` consumes `@pkm/markdown` via `dist/`.

## Verdict

**FAIL** — a core v1 interaction (wikilink autocomplete) is functionally broken and the documented type-check gate is not clean-checkout reproducible.

## Release Blockers

1. **Wikilink autocomplete inserts malformed links.**
   - In `apps/web/app/workspaces/[id]/page.tsx`, `insertWikilink` computes:
     ```ts
     const textBefore = content.slice(0, start - wikilinkQuery.length);
     const display = wikilinkQuery.trim();
     const insertion = display ? `[[${target.path}|${display}]]` : `[[${target.path}]]`;
     const newValue = `${textBefore}${insertion}${textAfter}`;
     ```
     It does **not** remove the opening `[[` trigger, so accepting a suggestion prepends another `[[`, producing `[[[[roadmap.md|road]]`.
   - It also uses `target.path` (e.g. `roadmap.md`) instead of `target.title` / path-without-extension, so `wikiToStandard` later appends a second `.md` and the link is unresolved.
   - This makes the v1 requirement for fast wikilink autocomplete unusable. Evidence: browser test typing `[[road` and selecting `roadmap` produced `[[[[roadmap.md|road]]` and an *Unresolved wikilinks* entry of `[[roadmap.md` (see screenshots `ss_44de5841.png` and `ss_44c0693d.png`).

2. **`pnpm -r typecheck` fails on a clean checkout.**
   - `packages/okf` imports from `@pkm/markdown`, whose `package.json` points `types` to `./dist/index.d.ts`.
   - After `pnpm install` but before any build, `pnpm -r typecheck` fails:
     ```
     packages/okf typecheck: src/core.ts(7,8): error TS2307: Cannot find module '@pkm/markdown'
     packages/okf typecheck: src/types.ts(1,40): error TS2307: Cannot find module '@pkm/markdown'
     ```
   - Running `pnpm --filter "./packages/*" build` first makes `pnpm -r typecheck` pass, but the README lists `pnpm -r typecheck` as a standalone gate.

3. **Semantic search relies on a non-configurable stub embedding model.**
   - `apps/ai/src/main.py` `/embed` always returns deterministic 384-dimensional vectors based on character codes.
   - There is no `EMBEDDING_*` configuration path to call a real embedding model, which means the advertised semantic search is not actually semantic.
   - This affects `PRODUCT.md` v1 scope #5 and the grounded answer quality in `/ask`.

## Single Largest Meaningful Gap to Fix Next

Fix the **wikilink autocomplete** in `apps/web/app/workspaces/[id]/page.tsx`:
- Remove the opening `[[` trigger characters (`start - wikilinkQuery.length - 2`) before inserting the replacement.
- Insert the note title/path without the `.md` extension (e.g. `[[roadmap|road]]`), matching the convention used by manually typed wikilinks.
- Add a unit/browser test that types `[[roa`, accepts `roadmap`, and asserts the source becomes `[[roadmap|roa]]` and the rendered link resolves.

## High Findings

- **Authentication/session fixes verified:** registration/login/logout all work; logout blocklists the signed cookie; re-login issues a fresh token. `/auth/me` returns the current user; unauthenticated workspace access returns `401`.
- **Workspace isolation verified:** cross-workspace document access returns `404`; cross-workspace graph returns empty `nodes`/`edges`; cross-workspace `/ask` returns no citations.
- **CSP/security headers verified:** `curl -I http://localhost:3000/login` returns `content-security-policy` with nonces, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and no `X-Powered-By`.
- **Attachment validation verified:** `text/markdown` uploads succeed; `text/html` and `application/octet-stream` are rejected with `400`. The validation is still prefix/magic-byte only and will accept a PNG file that has valid magic bytes but otherwise malformed content; full file parsing or content scanning is still medium-risk.
- **YAML frontmatter safety verified:** YAML alias bombs are rejected (`400`) and documents over 1 MiB are rejected (`413`).
- **Rate limiting verified:** the 6th `/auth/register` request within the burst window returns `429`.
- **External link rendering missing `rel` protection.** `MarkdownLink` in `apps/web/app/workspaces/[id]/page.tsx` renders external links with `target="_blank"` but no `rel="noopener noreferrer"`, leaving tabnabbing exposure despite the CSP.
- **Trust proxy for rate limits not documented.** `apps/api/src/app.ts` only enables Fastify `trustProxy` when `TRUST_PROXY=true`, but `.env.example` does not include `TRUST_PROXY`. Deploying behind a reverse proxy without it will rate-limit the proxy IP instead of client IPs.

## Medium / Low Findings

- The file tree groups all notes under the first folder segment even when sibling top-level notes exist, which makes the `project` folder visually contain `roadmap` in the UI.
- The workspace UUID is rendered next to the workspace selector; this is useful for debugging but noisy for end users.
- `getSession` in `apps/web/lib/auth.ts` returns `null` on any error, which can silently mask non-auth failures.
- `apps/api/src/documents.ts` logs embedding failures to the console; the error message is generic but should be reviewed to ensure it never includes note content.

## Evidence

### Gates

After building packages first, all required gates pass:

```
$ pnpm -r build
packages/markdown build: Done
packages/shared build: Done
packages/okf build: Done
apps/web build: Done
apps/api build: Done

$ pnpm -r typecheck
apps/api typecheck: Done
apps/web typecheck: Done
packages/markdown typecheck: Done
packages/okf typecheck: Done
packages/shared typecheck: Done

$ pnpm -r lint
apps/api lint: Done
apps/web lint: Done

$ pnpm -r test
packages/markdown test: 14 passed
packages/okf test: 7 passed
apps/api test: 37 passed
```

On a clean checkout (`rm -rf packages/*/dist apps/api/dist` then `pnpm -r typecheck`):

```
packages/okf typecheck: src/core.ts(7,8): error TS2307: Cannot find module '@pkm/markdown'
packages/okf typecheck: src/types.ts(1,40): error TS2307: Cannot find module '@pkm/markdown'
packages/okf typecheck: Failed
```

### Runtime verification

Health endpoints:
```
$ curl -s http://localhost:4000/health
{"status":"ok","version":"0.1.0"}

$ curl -s http://localhost:8000/health
{"status":"ok","version":"0.1.0"}
```

CSP headers:
```
$ curl -s -D - -o /dev/null http://localhost:3000/login | grep -E 'content-security-policy|X-Frame-Options|X-Content-Type-Options|Referrer-Policy|X-Powered-By'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
content-security-policy: default-src 'self'; script-src 'self' 'nonce-...' 'strict-dynamic'; ...
```

Workspace isolation:
```
$ WS1=7a7d4e63-ccfa-4bdb-8bd6-b5ec6e7b7e6f WS2=9a874a88-1b53-47d4-83f4-edf59fa361a6 DOC=bc04822f-b660-45ea-9819-2c35d83d0d99
$ curl -s -o /dev/null -w "%{http_code}" -b cookies.txt http://localhost:4000/workspaces/$WS2/documents/$DOC
404
$ curl -s http://localhost:4000/workspaces/$WS2/graph | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['nodes'], d['edges'])"
0 0
$ curl -s -X POST http://localhost:4000/workspaces/$WS2/ask -H 'Content-Type: application/json' -d '{"question":"What?"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('answer'), len(d.get('citations',[])))"
I do not have enough information... 0
```

Duplicate / archive / restore:
```
$ curl -s -X POST http://localhost:4000/workspaces/$WS1/documents/$DOC/duplicate
{"path":"project/ideas (copy).md", ...}

$ curl -s -X POST http://localhost:4000/workspaces/$WS1/documents/$ROADMAP/archive
{"archived_at":"2026-08-11T05:52:17.840Z", ...}

$ curl -s -X POST http://localhost:4000/workspaces/$WS1/documents/$ROADMAP/restore
{"archived_at":null, ...}
```

Wikilink autocomplete failure (browser):
- Source after selecting `roadmap` from `[[road`: `[[[[roadmap.md|road]]`
- Preview renders the trailing `road` as plain text.
- Note details panel shows *Unresolved wikilinks* `[[roadmap.md`.
- Screenshots: `ss_44de5841.png`, `ss_44c0693d.png`.

## Recommended Changes

1. **Fix wikilink autocomplete** as described in the release-blocker section.
2. **Make `pnpm -r typecheck` clean-checkout reproducible** by either adding TypeScript project references between `packages/okf` and `packages/markdown`, or by adding `pretypecheck`/`postinstall` build steps for workspace packages, and update `README.md` if a build-first order is intentional.
3. **Provide a real embedding path** for `apps/ai/src/main.py` `/embed` (e.g. an `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` / `EMBEDDING_API_KEY`) so semantic search is actually semantic.
4. **Add `rel="noopener noreferrer"`** to external links in `MarkdownLink`.
5. **Document `TRUST_PROXY=true`** in `.env.example` for reverse-proxy deployments.
6. **Strengthen attachment validation** beyond prefix magic-byte checks (e.g. reject trailing non-image data after a valid PNG signature for image types, or run a content scanner).
