# PKM v1 Final Gauntlet Critic Report

**Branch reviewed:** `devin/pkm-v1-search-ai`  
**Report date:** 2026-08-11  
**Verdict:** **FAIL** — v1 scope is not fully user-facing; three release blockers remain.

## Executive summary

The `devin/pkm-v1-search-ai` branch is technically close: all TypeScript quality gates pass, the resilience suite passes, performance budgets are met, authenticated routes pass an axe-core audit, and a full `curl`/browser smoke test confirms that the API implements auth, workspace isolation, note CRUD, wikilinks, search, `/ask`, graph, OKF import/export, revisions, index status, archive/restore, attachments, and logout/re-login.

However, two primary v1 user journeys are **API-only** and a third is **missing entirely**, and the public landing page has an unaddressed axe serious violation. Therefore the branch cannot be called a complete v1 from a user perspective.

## Evidence summary

### Quality gates

| Gate | Command | Result | Evidence |
|------|---------|--------|----------|
| Install | `pnpm install` | Up to date | no changes |
| Build | `pnpm -r build` | Passed | `/tmp/pkm-build.log` |
| Type-check | `pnpm -r typecheck` | Passed | `/tmp/pkm-typecheck.log` |
| Lint | `pnpm -r lint` | Passed | `/tmp/pkm-lint.log` |
| Test | `pnpm -r test` | Passed | `/tmp/pkm-test.log` (42 API + 18 markdown + 7 OKF tests) |
| Audit | `pnpm audit --prod` | No known vulnerabilities | `/tmp/pkm-audit.log` |

### Resilience tests

```
RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts
Test Files  1 passed (1)
     Tests  6 passed (6)
```

Full log: `/tmp/pkm-resilience.log`. The suite covers bulk workspace isolation (110 notes/workspace), failed AI embedding index transitions, and container restart recovery for Postgres, Redis, MinIO, and AI.

### Performance budgets

| Benchmark | Result | Budget | Status |
|-----------|--------|--------|--------|
| Full-text search p95 (10 k notes, 100 queries) | 5.55 ms | < 150 ms | pass |
| Note open by id p95 (100 k words) | 4.23 ms | < 200 ms | pass |
| Note open by path p95 | 3.13 ms | < 200 ms | pass |
| Desktop FCP (login, 2 runs) | 761 ms | < 2000 ms | pass |
| Mobile FCP (login, 2 runs) | 758 ms | < 1500 ms | pass |

Sources: `/tmp/pkm-search-perf.log` (command output), `/tmp/pkm-note-perf.log`, `apps/web/page-load-results.json`.

### Accessibility

- Authenticated primary routes (`/`, `/workspaces/:id`, `/workspaces/:id/attachments`, `/workspaces/:id/graph`) audited with `axe-core`:
  ```
  pnpm --filter @pkm/web test:axe
  PASSED: no critical or serious violations found
  ```
- Unauthenticated public route `/` fails with **1 serious color-contrast violation** on `.bg-destructive/10` (the `ApiError: Unauthorized` banner):
  ```
  [axe-audit] SERIOUS: Elements must meet minimum color contrast ratio thresholds (1 nodes) target=.bg-destructive\/10
  ```

### Functional smoke test

`bash critic-smoke.sh` against the running stack confirmed:

- User registration, `/auth/me`, logout → re-login 401/200 semantics.
- Workspace creation and cross-workspace isolation (user B gets `403`).
- Document create/list, full-text search (`feline` → `cat.md`, `dog.md`).
- `/ask` returns grounded citations (with the expected no-LLM warning because `LLM_BASE_URL` is not configured).
- Graph returns `{ nodes: 2, edges: 1 }` for the seeded notes.
- OKF export returns `version: "0.2"` and `concepts: 2`.
- OKF import creates `rabbit.md` and converts `[[cat]]` to `[cat](cat.md)`.
- Revisions, index status, archive/restore, attachment upload/list/download, and logout all behave correctly.

Full log: `/tmp/pkm-smoke.log`.

## Ranked release blockers

### RB-1: Primary AI journeys are not reachable from the web UI (PRODUCT #7 and #8)

**Severity:** Blocker  
**Evidence:**
- `apps/web/lib/api.ts` defines `askWorkspace` but it is never imported by any page.
- `apps/web/app` contains only five routes: `/login`, `/`, `/workspaces/[id]`, `/workspaces/[id]/attachments`, and `/workspaces/[id]/graph`. No `/ask`, no diff/approval page, and no command-palette command for either.
- `apps/api` has no diff-proposal route or endpoint; searching `apps/api/src` and `packages` for `diff`, `approve`, `suggest`, or `propose` related to AI edits returns no matches.
- `docs/PRODUCT.md` #7: “Ask grounded questions across notes and receive citations to exact source notes and relevant passages.”
- `docs/PRODUCT.md` #8: “Inspect and approve AI-proposed edits through a clear diff before canonical Markdown changes.”
- `AGENTS.md` Product Invariant: “Every AI-proposed canonical-content change requires a visible diff and explicit user approval.”

**Single largest remaining gap:** without a user-facing Ask flow and AI diff/approval, the product’s stated “AI as a native, inspectable capability” is not delivered. The `/ask` backend exists but cannot be invoked by a user, and the diff/approval feature does not exist at all.

### RB-2: OKF import/export is API-only

**Severity:** Blocker  
**Evidence:**
- `apps/web/lib/api.ts` has no OKF export/import helper functions.
- No web page or command exposes OKF import/export.
- `docs/PRODUCT.md` #6: “Import and export a complete, portable knowledge base without semantic loss.”
- The API round-trip works (`critic-smoke.sh` verified export and import), but an end user cannot perform either action through the application.

### RB-3: Unauthenticated `/` has a serious axe-core violation and poor UX

**Severity:** Blocker  
**Evidence:**
- `pnpm --filter @pkm/web test:axe` with no `AXE_API_URL` (public-route fallback) reports:
  ```
  [axe-audit] Auditing workspace-list-public: http://localhost:3000/
  [axe-audit]   SERIOUS: Elements must meet minimum color contrast ratio thresholds (1 nodes) target=.bg-destructive\/10
  [axe-audit] FAILED: 0 critical, 1 serious violations
  ```
- `docs/QUALITY_BAR.md` requires “zero serious or critical axe violations on primary journeys,” and `docs/PRODUCT.md` acceptance criteria states “Axe reports no serious or critical violations on primary workflows.”
- A first-time visitor to `/` is shown an `ApiError: Unauthorized` banner instead of being redirected to `/login`.

### RB-4: Workstream 7 is marked done but diff editing is not implemented

**Severity:** High / release-readiness  
**Evidence:**
- `docs/WORKSTREAMS.md` line 13 marks workstream 7 as `done` with scope “Grounded AI answers, citations, abstention, diff editing.”
- No diff-editing UI or backend exists (see RB-1).
- Workstream 8 (collaboration, presence, reconnects, conflicts, concurrent edits) is still `planned` while `docs/PRODUCT.md` #10 lists concurrent edits in v1 scope; this is a scope/product-management inconsistency that should be resolved before release.

### RB-5: `docs/SECURITY.md` open-hardening list is stale

**Severity:** Medium / release-readiness  
**Evidence:**
- `docs/SECURITY.md` “Open hardening” still lists:
  - “Automated end-to-end, accessibility (axe), and load/performance test coverage” — all now implemented and passing.
  - “Per-request nonce-based CSP once Next.js nonce propagation is reliable” — the project has switched to a source-based CSP (`docs/DECISIONS.md` AD-012/014, `apps/web/proxy.ts`) and this item should be retired or updated.
- These stale entries create release-readiness confusion.

## Recommended final integration steps

1. **Add a user-facing Ask flow.** Wire `askWorkspace` in `apps/web` (e.g., a `/workspaces/[id]/ask` page or a command-palette command) and render citations.
2. **Implement AI-proposed diff/approval.** Add a backend route/service that proposes canonical edits, a diff view, and approve/reject controls; require explicit approval before any Markdown mutation, per `AGENTS.md`.
3. **Add OKF import/export UI.** Add workspace-level import/export buttons and a file picker for OKF bundles; reuse the existing API endpoints.
4. **Fix the public landing page.** Redirect unauthenticated `/` requests to `/login`, or render a public landing without the `bg-destructive/10` banner, then re-run `pnpm --filter @pkm/web test:axe` on the public fallback.
5. **Reconcile documentation.** Update `docs/WORKSTREAMS.md` to reflect that workstream 7 diff editing is not done; confirm whether workstream 8 (real-time collaboration) is in v1 or a post-v1 roadmap item. Update `docs/SECURITY.md` to retire implemented mitigations.
6. **Re-run the full gate set and the persistent end-to-end tester** after the UI additions, then open the final integration PR.

## Conclusion

The branch is a strong, well-tested implementation of the backend and many core UI flows, but it is **not v1-complete** because critical user-facing AI and OKF journeys are missing and the public landing page fails the accessibility quality bar. Address RB-1 through RB-3, reconcile the docs, and re-verify before calling v1 ready.

---

*Evidence files collected on this VM:*
- `/tmp/pkm-build.log`
- `/tmp/pkm-typecheck.log`
- `/tmp/pkm-lint.log`
- `/tmp/pkm-test.log`
- `/tmp/pkm-audit.log`
- `/tmp/pkm-resilience.log`
- `/tmp/pkm-smoke.log`
- `apps/web/page-load-results.json`
