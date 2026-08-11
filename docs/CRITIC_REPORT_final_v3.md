# PKM v1 Final Gauntlet Critic Report v3

**Branch reviewed:** `devin/pkm-v1-search-ai`  
**Commit reviewed:** `86029fc` (HEAD after Round 1.16)  
**Critic session:** `devin-a5c8953b2a574861bce737ec7621ed5e`  
**Report date:** 2026-08-11  
**Verdict:** **PASS**

## Executive summary

This is a fresh critic re-review of `devin/pkm-v1-search-ai` after the Round 1.16 integration that added a graceful no-LLM fallback for `/propose` and propagated the no-LLM warning through the Ask UI. All requested quality gates, resilience tests, accessibility audits, manual API/browser checks, and performance budgets were reproduced independently against the running stack. The Round 1.12 release blockers and the Round 1.16 target behavior are addressed. No release-blocking regression or material feature gap remains.

## Quality gates (reproduced)

| Gate | Command | Result |
|------|---------|--------|
| Install | `pnpm install --frozen-lockfile` | Up to date |
| Build | `pnpm -r build` | Pass |
| Type-check | `pnpm -r typecheck` | Pass |
| Lint | `pnpm -r lint` | Pass |
| Unit / integration tests | `pnpm -r test` | Pass (50 API + 18 markdown + 7 OKF) |
| Production dependency audit | `pnpm audit --prod` | No known vulnerabilities |
| Resilience tests | `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts` | Pass (6/6) |

## Accessibility audit (reproduced)

`apps/web/scripts/axe-audit.js` was run against the running stack on:

- `/`
- `/login`
- `/workspaces/:id`
- `/workspaces/:id/ask`
- `/workspaces/:id/diff`
- `/workspaces/:id/attachments`
- `/workspaces/:id/graph`
- `/workspaces/:id/okf`

Result: **PASSED** — no critical or serious WCAG 2.2 AA violations.

## Manual API and browser inspection (reproduced)

All flows were exercised directly against `http://localhost:4000` (API) and `http://localhost:3000` (web), with a fresh test user and workspace created for this review.

| Journey | Method | Result | Evidence |
|---------|--------|--------|----------|
| Register / login / cookie | API `POST /auth/register` | 200 with `pkm_session` cookie | curl logs |
| Workspace creation | API `POST /workspaces` | 201, workspace returned | curl logs |
| `/propose` no-LLM fallback | API `POST /workspaces/:ws/propose` with `LLM_BASE_URL`/`LLM_API_KEY` unset | **HTTP 200** with a no-op `ProposedEdit` (`originalPath === proposedPath`, `originalContent === proposedContent`, `warning` present, `citations` scoped to target note) | curl logs |
| Ask warning propagation | API `POST /workspaces/:ws/ask` | Returns `warning` and `citations` with no-LLM message | curl logs |
| Ask UI warning | Browser `/workspaces/:ws/ask` | Yellow warning banner renders above the answer, sources list shown | screenshot |
| Diff UI no-op warning | Browser `/workspaces/:ws/diff?documentId=...&instruction=...` | Warning banner and "No changes were proposed" render; **Apply button is disabled** | screenshot |
| OKF import | API `POST /workspaces/:ws/okf/import` with `path`, `metadata.type`, `custom_key` | Imports 1 concept, preserves `custom_key`, canonicalizes `[[orders\|the orders table]]` to `[the orders table](orders.md)` | curl logs |
| OKF export | API `GET /workspaces/:ws/okf/export` | Returns v0.2 bundle, re-emits `[[orders\|the orders table]]` wikilink, preserves `custom_key` | curl logs |
| Workspace isolation | Create `secret.md` in workspace B, search workspace A for `Beta` | Workspace A returns only its own notes; workspace B returns `secret.md`; no cross-workspace leakage | curl logs |
| Backlinks | API `GET /workspaces/:ws/documents/:uuid/backlinks` after `a.md` links to `[B](b.md)` | Returns `a.md` for `b.md` | curl logs |
| Outgoing links | API `GET /workspaces/:ws/documents/:uuid/links` | Returns `b.md` for `a.md` | curl logs |
| Note CRUD / round-trip | API `PUT /workspaces/:ws/documents/:uuid` | Content and frontmatter preserved; revisions generated | curl logs |
| Revisions | API `GET /workspaces/:ws/documents/:uuid/revisions` | 2 revisions returned after an edit | curl logs |
| Archive / restore | API `POST .../archive` and `POST .../restore` | `archived_at` set, excluded from active list, then cleared | curl logs |
| Index status | API `GET /workspaces/:ws/index-status` | Reports all documents indexed and current | curl logs |
| Attachments | API `POST /workspaces/:ws/attachments` and `GET /attachments/:id?workspaceId=:ws` | Upload returns 201, download returns original bytes | curl logs |
| Public landing redirect | Browser `GET /` unauthenticated | 307 redirect to `/login` | curl logs |

## Performance budgets (reproduced / verified)

| Benchmark | Result | Budget | Status |
|-----------|--------|--------|--------|
| Note open by id (100,000 words, 50 runs) | 3.94 ms p95 | < 200 ms | pass |
| Note open by path (100,000 words, 10 runs) | 3.26 ms p95 | < 200 ms | pass |
| Full-text search (1,000 generated notes, 50 queries) | 1.68 ms p95 | < 150 ms | pass |

## Documentation consistency

- `docs/PRODUCT.md` — v1 scope is represented in code and tests.
- `docs/QUALITY_BAR.md` — budgets are measurable and the relevant scripts exist.
- `docs/SECURITY.md` — threat model, mitigations, implemented mitigations, and open hardening are consistent.
- `docs/WORKSTREAMS.md` — workstreams 1–22 are marked `done`; workstream 21 is correctly shown as the final integration gate and notes the propose no-LLM fallback fix.
- `docs/DECISIONS.md` — AD-014 and AD-021 cover the optional LLM design and the `/propose` JSON prompt; the no-LLM fallback behavior is consistent with the opt-in model.
- `docs/GAUNTLET_LOG.md` — records rounds 0 through 1.16 and explicitly lists the no-LLM fallback as the Round 1.16 change, awaiting this fresh critic verdict.
- `docs/TEST_REPORT_final_v2.md` — **caveat #3 is now stale**: it states that `/propose` without an LLM returns `422` and calls that a release gap. Round 1.16 fixed this; the behavior verified in this re-review returns HTTP 200 with a no-op proposal and a warning. The test report should be superseded or updated to avoid confusion.

## Release blockers

None.

## Observations and recommended final integration steps

1. **No-LLM fallback is complete.** With `LLM_BASE_URL`/`LLM_API_KEY` unset, `POST /workspaces/:id/propose` now returns a 200 no-op `ProposedEdit` containing a `warning`, and the `/diff` UI disables `Apply` and shows the warning. `POST /workspaces/:id/ask` also surfaces the warning in the UI. This closes the gap noted in `docs/TEST_REPORT_final_v2.md`.

2. **Stale test report caveat.** `docs/TEST_REPORT_final_v2.md` still lists `/propose` without an LLM as a release gap. Update or replace this report before declaring v1 final so documentation matches the verified behavior.

3. **Search semantic threshold can return broad results for unrelated short queries.** `hybridSearch` falls back to semantic neighbors when the full-text query matches nothing; in a small test workspace this can return all indexed notes. Results remain workspace-scoped and no cross-workspace leakage was observed. This is not a regression introduced in Round 1.16, but it makes Ask/Diff "Sources" lists less focused when no LLM is configured. Consider tightening the `semanticSearch` distance threshold or adding a relevance cutoff in a future polish round.

4. **Recommended before declaring v1 complete:**
   - Merge `devin/pkm-v1-search-ai` into `main` via PR #3.
   - Run the full CI workflow on the merge commit.
   - Update or supersede `docs/TEST_REPORT_final_v2.md` to remove the resolved no-LLM caveat.
   - Tag the release and document the LLM opt-in requirement in release notes.

## Conclusion

`devin/pkm-v1-search-ai` at `86029fc` is ready for final integration. The branch passes all reproduced quality gates, resilience tests, accessibility audits, manual API checks, and performance budgets. The no-LLM fallback for `/propose` and the Ask warning propagation work as intended, workspace isolation and OKF round-trip remain intact, and no release-blocking gap remains.
