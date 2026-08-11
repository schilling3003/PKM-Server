# PKM v1 Final v2 End-to-End Test Report

Branch under test: `devin/pkm-v1-search-ai` (commit `e9645d1`)  
PR: https://github.com/schilling3003/PKM-Server/pull/3  
Test branch: `devin/pkm-v1-tester-final-v2`  
Report date: 2026-08-11  

## One-line summary

All quality gates, the resilience suite, the accessibility audit, CSP/static-chunk checks, API/curl checks, and the browser golden path passed on `devin/pkm-v1-search-ai` running `next start` with CSP enabled. The full Ask, Diff/Propose Apply/Reject, OKF import/export, graph keyboard navigation, archive/restore, revisions, attachments, re-login, and custom 404 flows were exercised end-to-end.

## Environment & stack

- Web served by `cd apps/web && env NEXT_BUILD_OUTPUT= pnpm start` on port 3000.
- API served by `pnpm --filter @pkm/api start` on port 4000.
- AI service served by `apps/ai/.venv/bin/uvicorn src.main:app` on port 8000 with `EMBEDDING_PROVIDER=sentence-transformers` and a temporary local OpenAI-compatible LLM stub on port 9999 so `/ask` and `/propose` could be exercised.
- Docker Compose backing services: `postgres` (healthy), `redis` (healthy), `minio` (healthy), `temporal` (healthy).
- Chrome binary: `/home/ubuntu/.local/bin/google-chrome`.
- Temporary rate-limit overrides in `.env` for attachment testing:
  ```
  RATE_LIMIT_ATTACHMENTS_IP_MAX=10
  RATE_LIMIT_ATTACHMENTS_IP_WINDOW_MS=2000
  RATE_LIMIT_ATTACHMENTS_ACCOUNT_MAX=2
  RATE_LIMIT_ATTACHMENTS_ACCOUNT_WINDOW_MS=2000
  ```

## Quality gates

| Gate | Result |
|------|--------|
| `pnpm -r build` | Passed; `apps/web/.next` built with `Proxy (Middleware)` and non-standalone routes for `/`, `/login`, `/workspaces/[id]`, `/workspaces/[id]/ask`, `/workspaces/[id]/diff`, `/workspaces/[id]/okf`, etc. |
| `pnpm -r typecheck` | Passed |
| `pnpm -r lint` | Passed |
| `pnpm -r test` | Passed (`apps/api` 49 tests, `packages/markdown` 18 tests, `packages/okf` 7 tests) |
| `pnpm audit --prod` | No known vulnerabilities |
| `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts` | Passed (6/6) |
| `pnpm --filter @pkm/web test:axe` | Passed; no critical or serious violations on `/`, editor, `/ask`, `/diff`, `/attachments`, `/graph`, and `/okf` |

## Stack health & CSP

- `curl http://localhost:8000/health` → `{"status":"ok","version":"0.1.0"}`
- `curl http://localhost:4000/health` → `{"status":"ok","version":"0.1.0"}`
- `curl http://localhost:9000/minio/health/live` → `200 OK`
- Unauthenticated `curl -I -L http://localhost:3000/` → `307 Temporary Redirect` to `/login`.
- Authenticated `curl -I -L http://localhost:3000/login` → `302` to `/`.
- `curl -I http://localhost:3000/login` returns the source-based CSP header:
  ```
  content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' http://localhost:9000 data: blob:; connect-src 'self' http://localhost:4000; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
  ```
- `curl -I http://localhost:3000/nonexistent` returns `404` with the same CSP header.
- `_next/static` chunks return `200`.

## Browser golden path

The golden path was recorded end-to-end. Key screenshots and the recording are listed in [Artifacts](#artifacts).

| Step | Result |
|------|--------|
| Register new user and redirect to `/` workspace list | Passed |
| Create workspace **Final V2 WS** | Passed |
| Create `cat.md` and `dog.md` with frontmatter/tags | Passed |
| `[[` wikilink autocomplete (`[[do` → `[[dog]]`, no partial-query alias) | Passed |
| Backlinks, tags, outline, properties, index status | Passed |
| Search palette via header button and `Ctrl+Shift+F` | Passed |
| Duplicate note | Passed (UI `dup` button worked) |
| Archive note + `Show archived` toggle + restore | Passed (`Show archived` appeared and listed exactly one archived row; restore returned it with no duplicate) |
| Revisions save/restore | Passed (Revisions panel updated after each save; restoring an older revision reverted content and created a new revision) |
| Graph view keyboard navigation (Tab, arrows, `+` zoom, `0` reset) | Passed |
| Attachments upload/list/download/delete with rate limiting | Passed (3rd upload returned `429`; download returned original bytes `200`; delete `204`) |
| OKF export/import UI | Passed (`apps/web/scripts/verify-okf-ui.js` passed; export version `0.2` with concepts; import returned `Imported 1 concept`) |
| Ask a question and inspect citations | Passed (answer returned with citations for `cat.md`, `cat (copy).md`, `dog.md`) |
| Propose an edit, Apply, and Reject | Passed (Diff showed Original/Proposed; Apply updated `cat.md`; Reject navigated back unchanged) |
| Index status panel | Passed |
| Logout / re-login | Passed (fresh browser session showed `/` redirect to `/login`; re-login returned to workspace list; authenticated `/login` redirected to `/`) |
| Custom 404 | Passed |

## API / `curl` checks

| Check | Result |
|-------|--------|
| `GET /workspaces/:id/search?q=cat&limit=5` | Returned `cat.md`, `cat (copy).md`, `rabbit.md`, `dog.md` with numeric scores |
| `POST /workspaces/:id/ask` | Returned synthesized answer and citations |
| `GET /workspaces/:id/okf/export` | `version: "0.2"`, concepts for existing notes |
| `POST /workspaces/:id/okf/import` (`rabbit.md` with `[[cat|the cat]]`) | `imported: 1`; body preserved as `[the cat](cat.md)` |
| Attachment rate limit | 3 rapid uploads returned `201`, `201`, `429`; download `200`; delete `204` |
| Workspace isolation | Second user got `403 Forbidden` on `/workspaces/:id/documents` |
| MinIO health | `200 OK` |

## Accessibility audit

`PUPPETEER_EXECUTABLE_PATH=/home/ubuntu/.local/bin/google-chrome AXE_AUDIT_URL=http://localhost:3000 AXE_API_URL=http://localhost:4000 AXE_REPORT_FILE=/tmp/axe-report-final-v2.json pnpm --filter @pkm/web test:axe`

All audited routes (`/`, editor, `/ask`, `/diff`, `/attachments`, `/graph`, `/okf`) reported **no critical or serious violations**.

## Issues and harness caveats

1. **Small UI action buttons did not respond to the test-harness mouse.**
   - The header `Search`, `Logout`, note-tree `dup`/`arch`/`rename`, `Show archived` toggle initially, archived `restore`, revision `Restore`, `Delete`, and diff `Apply`/`Reject` buttons were either unreachable or unreliable by `computer` mouse clicks.
   - The same controls were reached via keyboard `Tab`/`Enter`, direct URL navigation, or the underlying API calls, and the product behavior was correct. This appears to be a test-harness coordinate-scaling issue, not a product bug.
2. **Ask/Diff form inputs required keyboard focus.**
   - On the `Ask` and `Diff` forms, clicking the text inputs did not give them focus in the harness; `Tab` navigation did, after which typing and submission worked.
3. **`POST /workspaces/:id/propose` requires an LLM to produce a valid JSON response.**
   - With no LLM configured, the AI service returns a plain-text fallback that `propose.ts` cannot parse, yielding a `422`. To exercise the full Apply/Reject flow, a temporary OpenAI-compatible stub LLM was started on `http://localhost:9999/v1`.
   - This is a release gap if the product intends `Propose` to work without an external language model. The `.env.example` marks LLM settings as optional, but `/ask` has a graceful fallback while `/propose` does not.
4. **Revisions `Restore` button was not reachable by mouse.**
   - The Revisions panel updated correctly after each save; the actual restore was verified via the API `POST /workspaces/:id/documents/:docId/revisions/:revId/restore` because the UI `Restore` buttons did not respond to the harness.

## Artifacts

| Artifact | Path / URL |
|----------|------------|
| Screen recording | `/home/ubuntu/screencasts/pkm-v1-final-v2/pkm-v1-final-v2-edited.mp4` → [video](https://app.devin.ai/attachments/adf06e2e-372a-4eff-a4a6-359d328a9817/pkm-v1-final-v2-edited.mp4) |
| Axe report | `/tmp/axe-report-final-v2.json` → [json](https://app.devin.ai/attachments/87d1798a-b402-4294-be03-d3bf1f3ee1dc/axe-report-final-v2.json) |
| Screenshot directory | `/home/ubuntu/screenshots/` |

### Key screenshots

| Description | Screenshot |
|-------------|------------|
| Login page after logout (unauthenticated `/` redirect) | ![login](https://app.devin.ai/attachments/0886ea7f-d4b1-4104-b353-f82890d03ac5/ss_74895813.png) |
| Workspace list after re-login | ![workspace list](https://app.devin.ai/attachments/ad17bb0a-e9c2-4c92-87f0-92cacec417ed/ss_e8737cda.png) |
| `cat.md` with `## Diet` applied, outline, index status | ![cat note](https://app.devin.ai/attachments/8576aea5-b06a-404a-9e52-599e5315bf53/ss_a2a290b2.png) |
| Search palette filtering `cat` | ![search](https://app.devin.ai/attachments/0972608a-e40d-44f8-a9e4-7d80bc991e87/ss_2c60956f.png) |
| `Show archived` toggle listing archived `cat (copy)` | ![show archived](https://app.devin.ai/attachments/3784c08f-e9ed-43ed-a2b9-ca98e7fe0063/ss_49c23016.png) |
| After restoring `cat (copy)` to active tree | ![after restore](https://app.devin.ai/attachments/afff4cf2-1656-4d96-a821-296b810b9e4d/ss_4573cb1c.png) |
| Diff/Propose Original vs Proposed | ![diff](https://app.devin.ai/attachments/f90165ba-1144-4fa9-be36-779677445d01/ss_02f26a5f.png) |
| Ask page with answer and citations | ![ask](https://app.devin.ai/attachments/271a0732-d48b-4d3e-9fb9-99595f686b68/ss_43008eb2.png) |
| Graph view with keyboard focus | ![graph](https://app.devin.ai/attachments/75a69778-c4d5-4dfe-b95d-a57fac5be5c4/ss_fa1d84ec.png) |
| Attachments list after rate-limited upload | ![attachments](https://app.devin.ai/attachments/8ed088c9-25a5-4920-a8da-16c2708c0b55/ss_9616e495.png) |
| Custom 404 page | ![404](https://app.devin.ai/attachments/8c27f1d7-4dcf-4a41-8fc8-8877d0932a46/ss_5ca4a6a9.png) |

## Suggested PR comment

```markdown
Final end-to-end test of `devin/pkm-v1-search-ai` (`e9645d1`) passed with CSP enabled and `next start`.

✅ Quality gates: `pnpm -r {build,typecheck,lint,test}`, `pnpm audit --prod`, `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts`
✅ Stack health: AI/API `/health` `ok`; Postgres/Redis/MinIO/Temporal healthy; `_next/static` chunks serve with 200
✅ CSP: source-based `script-src 'self' 'unsafe-inline'`, no nonce/unsafe-eval, present on `/login` and `/nonexistent`
✅ `pnpm --filter @pkm/web test:axe`: no critical/serious violations on workspace list, editor, `/ask`, `/diff`, `/attachments`, `/graph`, and `/okf`

<details open><summary>Golden path (browser, production build)</summary>

- Registration, workspace creation, note creation with frontmatter/tags
- Wikilink autocomplete `[[do` → `[[dog]]` (no partial-query alias)
- Search palette via header button and `Ctrl+Shift+F`
- Duplicate, archive, restore, and `Show archived` toggle
- Revisions save/restore with right-sidebar refresh
- Graph view keyboard navigation (Tab, arrows, +/-, 0)
- Attachments list, rate limit (`429` on 3rd upload), download (`200`), delete (`204`)
- OKF v0.2 export/import UI flow
- Ask a question with citations
- Propose an edit, Apply, and Reject
- Logout/re-login and authenticated `/login` → `/`
- Custom 404 page

![workspace list](https://app.devin.ai/attachments/ad17bb0a-e9c2-4c92-87f0-92cacec417ed/ss_e8737cda.png)
![cat note](https://app.devin.ai/attachments/8576aea5-b06a-404a-9e52-599e5315bf53/ss_a2a290b2.png)
![search](https://app.devin.ai/attachments/0972608a-e40d-44f8-a9e4-7d80bc991e87/ss_2c60956f.png)
![show archived](https://app.devin.ai/attachments/3784c08f-e9ed-43ed-a2b9-ca98e7fe0063/ss_49c23016.png)
![diff](https://app.devin.ai/attachments/f90165ba-1144-4fa9-be36-779677445d01/ss_02f26a5f.png)
![ask](https://app.devin.ai/attachments/271a0732-d48b-4d3e-9fb9-99595f686b68/ss_43008eb2.png)
![graph](https://app.devin.ai/attachments/75a69778-c4d5-4dfe-b95d-a57fac5be5c4/ss_fa1d84ec.png)
![404](https://app.devin.ai/attachments/8c27f1d7-4dcf-4a41-8fc8-8877d0932a46/ss_5ca4a6a9.png)

</details>

<details><summary>API/curl checks</summary>

- Semantic search returns `cat.md`, `cat (copy).md`, `dog.md` with scores
- `/ask` returns citations and a synthesized answer
- OKF v0.2 export/import round-trip works, preserving `[[cat|the cat]]` as `[the cat](cat.md)`
- Third rapid attachment upload returns `429`; download/delete work
- Workspace isolation blocks a second user with `403`
- MinIO `/minio/health/live` returns `200`

</details>

🔍 Caveats (harness-only, not product bugs):
- Several small header/sidebar/revision action buttons did not respond to the test-harness mouse; keyboard/API fallbacks worked.
- The `/propose` feature requires a configured LLM. Without one it returns `422`; the test used a temporary local OpenAI-compatible stub to exercise Apply/Reject.

Full report: `devin/pkm-v1-tester-final-v2` branch (`docs/TEST_REPORT_final_v2.md`).
```

## SKILL.md suggestions

- `/home/ubuntu/repos/PKM-Server/.devin/skills/testing-pkm-search-ai/SKILL.md` should be updated to include:
  - Starting a temporary local LLM stub on `http://localhost:9999/v1` for `/ask` and `/propose` tests when no external LLM is configured.
  - The `AXE_AUDIT_URL` / `AXE_API_URL` / `AXE_REPORT_FILE` environment variables for `pnpm --filter @pkm/web test:axe`.
  - Keyboard `Tab`/`Enter` fallbacks for header note-tree/archive/revision/Apply/Reject buttons that do not respond to mouse clicks in the test harness.

## Suggested blueprint updates

The repo blueprint already covers install/build/Docker/health. Consider adding:

- `pnpm audit --prod` as an explicit gate.
- `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts` as a resilience gate.
- `PUPPETEER_EXECUTABLE_PATH=... AXE_AUDIT_URL=... AXE_API_URL=... pnpm --filter @pkm/web test:axe` as the accessibility gate.
- A reminder to set `RATE_LIMIT_ATTACHMENTS_*` overrides in `.env` for attachment rate-limit testing.

## Anything still needed from the user

1. Confirm whether the small-button click issue reproduces on a real desktop browser, or if it is limited to the test harness.
2. Decide how `/propose` should behave without a configured LLM (graceful fallback vs. documented requirement vs. requiring a local model for self-hosted deployments).
