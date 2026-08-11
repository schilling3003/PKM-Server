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
7. Start web: `pnpm --filter @pkm/web dev`

## Content-Security-Policy
`apps/web/proxy.ts` emits a source-based CSP (`default-src 'self'`, `script-src 'self' 'unsafe-inline'` with `'unsafe-eval'` in dev, `style-src 'self' 'unsafe-inline'`, `object-src 'none'`, `frame-ancestors 'none'`, and explicit `img-src`/`connect-src`/`font-src`). It should not block the UI. Verify the header with `curl -I http://localhost:3000/login` and the custom 404 with `curl -I http://localhost:3000/nonexistent`.

## Rate-limit test setup
Add to `.env` (temporary values for testing):
```
RATE_LIMIT_ATTACHMENTS_IP_MAX=10
RATE_LIMIT_ATTACHMENTS_ACCOUNT_MAX=2
RATE_LIMIT_ATTACHMENTS_IP_WINDOW_MS=2000
RATE_LIMIT_ATTACHMENTS_ACCOUNT_WINDOW_MS=2000
```
Restart the API after changing `.env`.

## API golden-path sanity checks
- `curl http://localhost:8000/health`
- `curl http://localhost:4000/health`
- `curl -s -b cookies.txt http://localhost:4000/workspaces`
- `curl -s -b cookies.txt -X POST http://localhost:4000/workspaces/{ws}/documents -d '{"path":"cat.md","content":"..."}'`
- `curl -s -b cookies.txt "http://localhost:4000/workspaces/{ws}/search?q=cat"`
- `curl -s -b cookies.txt -X POST http://localhost:4000/workspaces/{ws}/attachments -F "file=@f.txt"` (third rapid upload should 429)
- `curl -s -b cookies.txt "http://localhost:4000/workspaces/{ws}/okf/export"`
- `curl -s -b cookies.txt -X POST http://localhost:4000/workspaces/{ws}/okf/import -d @okf.json`

## Notes
- The workspace ID shown in the Next.js URL is the canonical one returned by the API; copy it from `GET /workspaces` if the UI is blocked.
- Attachments are uploaded to MinIO (`http://localhost:9000`) using the bucket and credentials from `.env`.
- The AI `/ask` endpoint returns an answer only when `LLM_BASE_URL` / `LLM_API_KEY` are configured; otherwise it returns a no-LLM warning with citations.
