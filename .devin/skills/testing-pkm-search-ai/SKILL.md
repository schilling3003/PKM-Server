---
name: testing-pkm-search-ai
description: End-to-end testing notes for the PKM v1 search/AI branch, including CSP caveats, rate-limit configuration, and golden-path commands.
---

# Testing PKM v1 search/AI branch

## Devin Secrets Needed
None beyond the local `.env` created from `.env.example`.

## One-time setup
1. `cp .env.example .env` in `/home/ubuntu/repos/PKM-Server`.
2. `pnpm install`
3. `pnpm -r build`
4. `docker compose up -d --wait`
5. Start AI: `cd apps/ai && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && uvicorn src.main:app --host 0.0.0.0 --port 8000`
6. Start API: `pnpm --filter @pkm/api start`
7. Start web: `cd apps/web && env NEXT_BUILD_OUTPUT= pnpm start` (uses `next start` with the regular production build and source-based CSP).

## Content-Security-Policy
`apps/web/proxy.ts` emits a source-based CSP (`default-src 'self'`, `script-src 'self' 'unsafe-inline'` with `'unsafe-eval'` in dev, `style-src 'self' 'unsafe-inline'`, `object-src 'none'`, `frame-ancestors 'none'`, and explicit `img-src`/`connect-src`/`font-src`). It should not block the UI. Verify the header with `curl -I http://localhost:3000/login` and the custom 404 with `curl -I http://localhost:3000/nonexistent`.

## Production build caveat
`apps/web/next.config.ts` uses `output: 'standalone'` only when `NEXT_BUILD_OUTPUT=standalone` is set. The Dockerfile sets it so the production image can run `apps/web/.next/standalone/apps/web/server.js`. For local verification, `pnpm --filter @pkm/web start` (which runs `next start`) serves the regular `.next` build and static chunks correctly. Kill any stale `next-server` processes before switching between `next start` and the standalone server.

## Rate-limit test setup
Add to `.env` (temporary values for testing):
```
RATE_LIMIT_ATTACHMENTS_IP_MAX=10
RATE_LIMIT_ATTACHMENTS_ACCOUNT_MAX=2
RATE_LIMIT_ATTACHMENTS_IP_WINDOW_MS=2000
RATE_LIMIT_ATTACHMENTS_ACCOUNT_WINDOW_MS=2000
```
Restart the API after changing `.env`.

## Quality gates
1. `pnpm -r typecheck`
2. `pnpm -r lint`
3. `pnpm -r build`
4. `pnpm -r test`
5. `pnpm audit --prod`
6. `RUN_RESILIENCE_TESTS=1 pnpm --filter @pkm/api test test/resilience.test.ts`

## Accessibility / performance / resilience gates
- `pnpm --filter @pkm/web test:axe` (requires web on `http://localhost:3000` and API on `http://localhost:4000`; set `AXE_AUDIT_URL`, `AXE_API_URL`, and `PUPPETEER_EXECUTABLE_PATH` if needed).
- `CHROME_PATH=/path/to/google-chrome pnpm --filter @pkm/web perf:page-load -- --url=http://localhost:3000/login --runs=2`
- `pnpm --filter @pkm/api perf:search -- --count=1000 --queries=50`

## API golden-path sanity checks
- `curl http://localhost:8000/health`
- `curl http://localhost:4000/health`
- `curl -s -b cookies.txt http://localhost:4000/workspaces`
- `curl -s -b cookies.txt -X POST http://localhost:4000/workspaces/{ws}/documents -d '{"path":"cat.md","content":"..."}'`
- `curl -s -b cookies.txt "http://localhost:4000/workspaces/{ws}/search?q=cat"`
- `curl -s -b cookies.txt -X POST http://localhost:4000/workspaces/{ws}/attachments -F "file=@f.txt"` (third rapid upload should 429)
- `curl -s -b cookies.txt "http://localhost:4000/workspaces/{ws}/okf/export"`
- `curl -s -b cookies.txt -X POST http://localhost:4000/workspaces/{ws}/okf/import -H 'Content-Type: application/json' -d '{"concepts":[{"path":"rabbit.md","metadata":{"type":"Concept"},"document":{"body":"A bunny. See [[cat|the cat]]."}}],"version":"0.2"}'`

## Notes
- The workspace ID shown in the Next.js URL is the canonical one returned by the API; copy it from `GET /workspaces` if the UI is blocked.
- Attachments are uploaded to MinIO (`http://localhost:9000`) using the bucket and credentials from `.env`.
- The AI `/ask` endpoint returns an answer only when `LLM_BASE_URL` / `LLM_API_KEY` are configured; otherwise it returns a no-LLM warning with citations.
- `/propose` (`POST /workspaces/:id/propose`) requires a configured LLM to return valid JSON. For end-to-end tests without an external model, start a temporary OpenAI-compatible stub on `http://localhost:9999/v1` and set `LLM_BASE_URL=http://localhost:9999/v1` + `LLM_API_KEY=test-llm` when launching the AI service.
- When starting `next start` in the background with `nohup`, use `env NEXT_BUILD_OUTPUT= pnpm --filter @pkm/web start` so the empty variable is passed correctly.
- If small sidebar buttons (note-tree `dup`/`arch`, `Show archived`, right-sidebar `Restore`) do not respond to mouse clicks in the test harness, use keyboard `Tab`/`Enter` as a fallback.
- The header Search button may not register mouse clicks in the harness; the shortcut `Ctrl+Shift+F` / `Cmd+Shift+F` opens the palette.
- The `Logout` button and the note-tree `dup`/`arch`/`rename`/`×` buttons may need keyboard activation in the harness.
- The `Apply`/`Reject` buttons on the `/diff` page may need keyboard activation; `Tab` to focus them and press `Enter`.
- The `Ask` and `/diff` text inputs may not focus on click in the harness; `Tab` to the input before typing.
- Axe audit: set `AXE_AUDIT_URL=http://localhost:3000 AXE_API_URL=http://localhost:4000 AXE_REPORT_FILE=/tmp/axe-report.json PUPPETEER_EXECUTABLE_PATH=/home/ubuntu/.local/bin/google-chrome` before `pnpm --filter @pkm/web test:axe`.
- OKF import payload needs `concepts[].metadata.type` and `concepts[].document.body`; example: `'{"version":"0.2","concepts":[{"path":"rabbit.md","metadata":{"type":"Note"},"document":{"frontmatter":{"type":"Note"},"body":"A rabbit. See [[cat|the cat]]."}}]}'`.
- Kill stale processes before re-running: `pkill -f 'next-server|uvicorn|node dist/index.js|tsx'`.
