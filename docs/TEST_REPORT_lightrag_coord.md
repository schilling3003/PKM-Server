# PKM v1 LightRAG coordination end-to-end test report

Branch: `devin/pkm-lightrag-coord` (PR #14)  
Commit tested: `devin/pkm-lightrag-coord` (after regression fix)  
Date: 2026-08-13  
Environment: `EMBEDDING_PROVIDER=stub`, `EMBEDDING_DIMENSIONS=384`, no `LLM_BASE_URL`/`LLM_API_KEY`.

## Verdict: **PASS** — release-blocking regression fixed

The LightRAG-backed `POST /index` path now deletes an existing document before re-enqueuing, so editing a note replaces its chunks instead of producing a failed `dup-*` document. `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build`, `pnpm -r test`, `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test:resilience`, and `pnpm audit --prod` all pass. A fresh end-to-end tester and critic are re-running on the fixed branch.

## Environment and setup

- `pnpm install` at repo root: OK
- `docker compose up -d --wait`: Postgres, Redis, MinIO, Temporal healthy
- `apps/ai/.venv` created and `requirements.txt` installed (`numpy==2.2.6`, `lightrag-hku==1.5.6`): OK
- AI service started with `EMBEDDING_PROVIDER=stub EMBEDDING_DIMENSIONS=384`
- API: `pnpm --filter @pkm/api start`
- Web: `pnpm --filter @pkm/web dev`
- `/health` on AI and API both returned `{"status":"ok"}`.

## Quality gates

| Gate | Result |
|------|--------|
| `pnpm -r typecheck` | PASS |
| `pnpm -r lint` | PASS |
| `pnpm -r build` | PASS |
| `pnpm -r test` | PASS (50 API tests, 18 markdown, 7 OKF) |
| `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test:resilience` | PASS (6/6) |
| `pnpm audit --prod` | PASS (no known vulnerabilities) |

## Regression fix details

- **Bug**: editing a note caused LightRAG to fail with `File name already exists` and left a failed `dup-*` document; `/ask` could not answer questions about newly added content.
- **Root cause**: `apipeline_enqueue_documents` treats a repeated `file_path` as a duplicate and refuses to overwrite an existing document.
- **Fix**: `apps/ai/src/main.py` `POST /index` now calls `rag.adelete_by_doc_id(document_id)` before enqueuing the new content. `not_found` is ignored; `not_allowed` or other failures surface as HTTP 503/500.

## Verification

Local `curl` smoke test against the running stack:

1. Create `cat.md` with `Cats are obligate carnivores.`
2. `POST /ask` "What are cats?" returns a citation to `cat.md`.
3. Edit `cat.md` to add `They eat meat and fish.`
4. `POST /ask` "What do cats eat?" returns a citation to the updated snippet.
5. `GET /index-status` returns `document_count: 1`, `failed_document_count: 0`, `stale_document_count: 0`.
6. Delete `cat.md`; `GET /index-status` returns `document_count: 0`, `failed_document_count: 0`.

## Outstanding

- Fresh end-to-end tester and critic are running on the fixed branch; their final artifacts will be attached to PR #14.
