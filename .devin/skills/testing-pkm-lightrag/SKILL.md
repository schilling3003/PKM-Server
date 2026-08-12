---
name: testing-pkm-lightrag
description: How to end-to-end test the PKM LightRAG coordination branch (semantic search, ask, graph, index status) with stub embeddings and no LLM.
---

# Testing PKM v1 LightRAG coordination

## Devin Secrets Needed

None beyond the local `.env` copied from `.env.example`.

## One-time setup

1. `cp .env.example .env` in `/home/ubuntu/repos/PKM-Server`.
2. `pnpm install`
3. Create and populate the AI venv:
   ```bash
   cd apps/ai
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```
   Verify `lightrag-hku==1.5.6` and `numpy==2.2.6` are installed.
4. Start Docker Compose: `docker compose up -d --wait`
5. Set `.env` for no-LLM, stub-embedding smoke test:
   ```
   EMBEDDING_PROVIDER=stub
   EMBEDDING_DIMENSIONS=384
   # LLM_BASE_URL and LLM_API_KEY must be unset
   ```
6. Start AI: `cd apps/ai && .venv/bin/uvicorn src.main:app --host 0.0.0.0 --port 8000`
7. Start API: `pnpm --filter @pkm/api start`
8. Start web dev server: `pnpm --filter @pkm/web dev`
9. Wait for `curl http://localhost:8000/health` and `curl http://localhost:4000/health` to return `{"status":"ok"}`.

## Important no-LLM caveats

- `EMBEDDING_PROVIDER=stub` produces deterministic token-hash vectors, not true semantic embeddings. Searches/ask only reliably match exact overlapping tokens.
- `/ask` with no LLM returns `warning: "No LLM is configured..."` and grounded citations when chunks match.
- `/graph` returns **no** AI-derived `source: 'entity'` nodes without an LLM, so the entity-node click guard is not exercisable in this mode.
- LightRAG stores per-workspace state in Postgres and local `/tmp/lightrag/{workspace_id}` scratch files. If the index behaves weirdly, wipe `/tmp/lightrag` and restart the AI service.

## Adversarial checks specific to LightRAG

Do not just create a note and search once. The critical bug is **index staleness after updates**.

1. Create a note, save, and confirm `Index status` shows `current` with `chunks > 0`.
2. Ask a question about the note and verify a citation plus the no-LLM warning.
3. **Edit the note** to add a new section with distinctive text (e.g. `## Diet` / `obligate carnivores`).
4. Verify **all three** of:
   - UI right sidebar `Index status` still says current and has no `failed` count.
   - `GET /workspaces/{ws}/documents/{id}` returns the updated canonical content.
   - `POST /workspaces/{ws}/ask` with a question about the new content returns a citation to the new section.
5. Check `GET /index-status` on the API and the AI service `/index-status/{workspace_id}` for any `dup-*` failed documents or stale chunks.
6. Delete the note and confirm `GET /index-status` returns `document_count: 0`, `chunk_count: 0`, **and** `failed_document_count: 0`.

## Workspace isolation checks

- Create a second workspace with different notes.
- `GET /workspaces/{ws}/search?q=...` should never return a document whose `workspace_id` differs from the requested workspace.
- `POST /workspaces/{ws}/ask` should not cite notes from another workspace.

## Axe

```bash
PUPPETEER_EXECUTABLE_PATH=/home/ubuntu/.local/bin/google-chrome \
  AXE_AUDIT_URL=http://localhost:3000 \
  AXE_API_URL=http://localhost:4000 \
  AXE_REPORT_FILE=/tmp/axe-report-lightrag.json \
  pnpm --filter @pkm/web test:axe
```

Expected: `PASSED: no critical or serious violations found`.
