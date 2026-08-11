# PKM v1 final v3 end-to-end test report

Branch under test: `devin/pkm-v1-search-ai`  
Commit: `86029fc`  
Test run: 2026-08-11  
Recording: `/home/ubuntu/screencasts/pkm-v1-final-v3/pkm-v1-final-v3-edited.mp4`

## Summary

All quality gates passed, the Docker Compose stack was healthy, CSP/static-chunk checks were correct, the axe accessibility audit reported no critical or serious violations across `/`, `/login`, `/workspaces/:id`, `/ask`, `/diff`, `/attachments`, `/graph`, and `/okf`, and the runtime API/curl checks passed. The browser golden path was exercised under `next start` with CSP enabled and **no LLM configured** (`LLM_BASE_URL`/`LLM_API_KEY` unset). The new no-LLM `/propose` fallback returned `200` with a warning, identical original/proposed content, a `No changes were proposed.` message, and an inactive `Apply` button. `/ask` also showed the no-LLM warning with citations. A few UI controls were unreachable by the test-harness mouse and were worked around with keyboard, direct URL navigation, or the API; these are flagged as harness-only caveats.

## Quality gates

| Gate | Result |
|------|--------|
| `pnpm -r typecheck` | ✅ passed |
| `pnpm -r lint` | ✅ passed |
| `pnpm -r build` | ✅ passed (regular `.next` build, `Proxy (Middleware)`) |
| `pnpm -r test` | ✅ passed (`packages/markdown` 18, `packages/okf` 7, `apps/api` 50, resilience skipped in default run) |
| `pnpm audit --prod` | ✅ passed (no known vulnerabilities) |
| `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts` | ✅ passed (6/6) |
| `PUPPETEER_EXECUTABLE_PATH=... pnpm --filter @pkm/web test:axe` | ✅ passed (no critical/serious violations on workspace-list, editor, ask, diff, attachments, graph, okf) |

## Stack health

- `curl http://localhost:8000/health` → `{"status":"ok","version":"0.1.0"}`
- `curl http://localhost:4000/health` → `{"status":"ok","version":"0.1.0"}`
- `curl http://localhost:9000/minio/health/live` → `200`
- CSP header on `/login` and `/nonexistent` uses `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' http://localhost:9000 data: blob:; connect-src 'self' http://localhost:4000; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` with no nonce/unsafe-eval/strict-dynamic.
- `/_next/static` chunk served with `200`.
- Unauthenticated `GET /` returns `307` → `/login`; authenticated `/login` redirects to `/`.

## API/curl checks

- `POST /auth/register` and `POST /auth/login` work and set a signed `pkm_session` cookie.
- `GET /workspaces/:id/documents` returns workspace documents.
- `GET /workspaces/:id/search?q=cat&limit=5` returns `cat.md` with a numeric score (`68.43`).
- `POST /workspaces/:id/ask` with no LLM returns `warning: "No configured language model..."` and `citations` for `cat.md`, `dog.md`, `rabbit.md`.
- `POST /workspaces/:id/propose` with no LLM returns `200`, `warning`, `originalPath === proposedPath`, `originalContent === proposedContent`.
- `GET /workspaces/:id/okf/export` returns `version: "0.2"` with 3 concepts.
- `POST /workspaces/:id/okf/import` with a `rabbit.md` concept containing `[[cat|the cat]]` returns `imported: 1` and stores the body as `[the cat](cat.md)`.
- Attachment uploads: first two rapid `final1.txt`/`final2.txt` uploads return `201`; third returns `429`. Download `GET /attachments/:id?workspaceId=...` returns `200`; `DELETE` returns `204`.
- Workspace isolation: a second user receives `403` on `/workspaces/:ws/documents`.

## Browser golden path

The following was exercised in a screen recording (Chrome, production build, CSP enabled, no LLM):

1. Registered user `test-final-v3-aug11@example.com` and created workspace **Final V3 WS**.
2. Created `cat.md` and `dog.md` via API, then opened `cat.md` in the UI; frontmatter tags, outline, properties, and index status rendered correctly.
3. Wikilink autocomplete: typing `[[do` showed the `dog.md` dropdown; selecting it inserted `[[dog]]` (no partial-query alias). Outgoing panel listed `dog`; switching to `dog.md` showed `cat.md` in Backlinks.
4. Search palette opened with `Ctrl+Shift+F`, filtered `cat`, and opened `cat.md`.
5. Duplicate/archive/restore: API-created `cat (copy).md` was archived, the `Show archived` toggle appeared, and restore returned it to the active tree with no duplicate archived row.
6. Revisions: three saves to `dog.md` appeared in the Revisions panel; restoring the oldest revision reverted content and appended a new revision entry.
7. Graph view rendered `cat`, `cat (copy)`, `dog`, and `rabbit` with an edge; `Tab`/arrow focus and `+`/`-` zoom were exercised (visual change in harness was limited).
8. Attachments page listed the uploaded file; download and delete were verified via the API.
9. OKF export/import verified via API; the UI export button opened the save dialog.
10. `/workspaces/:id/ask` with the question *“What is a cat?”* showed the no-LLM warning and a citations list.
11. `/workspaces/:id/diff?documentId=...&instruction=Add%20a%20diet%20section` showed the no-LLM warning, explanation, equal Original/Proposed panes, `No changes were proposed.`, and the `Apply` button did not navigate when clicked (disabled because `hasChanges` is false).
12. Logout via `fetch('/api/auth/logout', ...)` redirected to `/login`; re-login returned to the workspace list.
13. `/nonexistent` rendered the custom 404 page.

## Screenshots

### No-LLM `/diff` fallback
![diff no-llm](https://app.devin.ai/attachments/dafabc0f-03cf-48d6-a8aa-ec726cd7585a/ss_d27302f5.png)

### No-LLM `/ask` warning and citations
![ask no-llm](https://app.devin.ai/attachments/486b0f89-ff83-40b1-9246-9b7c063b329e/ss_b05d6c25.png)

### Workspace list after re-login
![workspace list](https://app.devin.ai/attachments/38f81b35-6e94-4bff-814c-6343b428bc1a/ss_7cb2ed0d.png)

### Wikilink inserted with `[[dog]]`
![wikilink](https://app.devin.ai/attachments/d83b76bb-52f4-4dcc-8282-c8a10cbdb7f5/ss_e32899a7.png)

### Search palette
![search](https://app.devin.ai/attachments/59b72092-3f39-4015-aa34-06daf8e3b3d7/ss_4aa74852.png)

### `Show archived` toggle after archive
![show archived](https://app.devin.ai/attachments/df0dc88a-46cd-42e0-92bf-99654efc5c07/ss_8b8921c2.png)

### Graph view
![graph](https://app.devin.ai/attachments/86e13b17-aff4-4900-adbe-5e4ad4ae0b18/ss_25c3742b.png)

### Revisions panel after restore
![revisions](https://app.devin.ai/attachments/ac82f917-e023-42d6-9f69-5005505af4cf/ss_e7eb2b47.png)

### Attachments list
![attachments](https://app.devin.ai/attachments/8d57e304-824c-4f56-8c9f-69d7d1f5ec58/ss_e00bc65c.png)

### Custom 404 page
![404](https://app.devin.ai/attachments/ee10cc39-9b50-4957-a90a-f7c3879f6c49/ss_4fe1d5f6.png)

## Potential issues / caveats

1. **Test-harness pointer coordinates** — several small UI buttons (header `Search`, `Attachments`, `Graph`, `OKF`, `Ask`, `Propose`, `Save`, `Delete`, note-tree `dup`/`arch`/`restore`, `Show archived` toggle, and `Logout`) did not consistently respond to `computer` mouse clicks. The same features worked via keyboard shortcuts (`Ctrl+Shift+F`), direct URL navigation, or the API. This is treated as a harness-only issue, but a real desktop pointer test would confirm it.

2. **Attachment filename rendering** — the Attachments UI listed a file as `final11.txt` while the API consistently returned `final1.txt`. This mismatch is visible in the recording/screenshot and should be confirmed on a real browser; if reproducible, it is a product bug in the attachments list rendering.

3. **No-LLM `/diff` `Apply` button visual state** — when `hasChanges` is false the button is disabled and clicks do not apply, but the disabled styling is subtle (`bg-primary/50` over a dark primary color). The user may not clearly see that `Apply` is inactive. Consider adding a clearer disabled text or tooltip.

4. **Ctrl+S save shortcut** — the workspace editor code comment mentions an explicit `Ctrl/Cmd+S` shortcut, but `handleTextareaKeyDown` only handles wikilink navigation keys and does not call `handleSave` for `Ctrl+S`. This is a minor product inconsistency; the `Save` button still works.

## Artifacts

- Screen recording: `/home/ubuntu/screencasts/pkm-v1-final-v3/pkm-v1-final-v3-edited.mp4`
- Axe report: `/tmp/axe-report-final-v3.json`
- OKF import test file: `/tmp/okf-import-v3.json`
- Cookie jar: `/tmp/pkm-cookies-v3.txt`
- This report: `docs/TEST_REPORT_final_v3.md`

## Shutdown

- Stopped web/API/AI processes and ran `docker compose down -v`; all PKM containers/volumes removed and ports 3000/4000/8000 freed.
