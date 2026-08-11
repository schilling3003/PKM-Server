---
name: testing-pkm-okf
description: Verify the PKM v1 OKF v0.2 import/export endpoints and workspace-isolation behavior against the real local stack.
---

# Testing PKM OKF v0.2 import/export

## Devin Secrets Needed
- None for local-only verification.

## When to use this skill
- After OKF import/export or document link/backlink changes land in `apps/api`.
- When you need a fast, shell-driven end-to-end check that does not require the AI service or the Next.js frontend.

## Pre-flight
1. Ensure no stale process is holding `localhost:4000`:
   ```bash
   ss -ltnp | grep ':4000' || true
   lsof -ti :4000 | xargs kill 2>/dev/null || true
   ```
2. Ensure the Docker Compose stack is healthy (`postgres`, `redis`, `minio`, `temporal`).
   If in doubt, rebuild from scratch:
   ```bash
   docker compose down -v && docker compose up -d --wait
   ```
3. Build and typecheck the repo:
   ```bash
   pnpm install
   pnpm -r build
   pnpm -r typecheck
   ```

## Run the integration suite
`apps/api/test/integration.test.ts` requires a running Postgres/Redis stack:
```bash
pnpm -r test
```

## Start the API server
```bash
nohup pnpm --filter @pkm/api start > api.log 2>&1 &
sleep 3
curl -s http://localhost:4000/health | jq .
```
Expected: `services.postgres.status` and `services.redis.status` are `ok`; `services.ai.status` is `error` (graceful fallback when the AI service is off).

## End-to-end curl checks

### Create a workspace
```bash
WS=$(curl -s -X POST http://localhost:4000/workspaces \
  -H 'Content-Type: application/json' -d '{"name":"OKF Roundtrip"}')
WS_ID=$(echo "$WS" | jq -r '.id')
```

### Import an OKF v0.2 bundle
```bash
curl -s -X POST "http://localhost:4000/workspaces/$WS_ID/okf/import" \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "0.2",
    "concepts": [{
      "path": "concepts/customers.md",
      "metadata": {
        "type": "BigQuery Table",
        "title": "Customers",
        "custom_key": [1, 2, 3]
      },
      "document": {
        "body": "# Schema\n\nSee [[orders|the orders table]] for related data.\n"
      }
    }]
  }'
```
Expect: HTTP 200, `imported: 1`.

### Verify stored canonical Markdown
```bash
curl -s "http://localhost:4000/workspaces/$WS_ID/documents" | jq .
```
Expect: one document with `content` containing `[the orders table](orders.md)` and no `[[` wikilink syntax, while `custom_key` and `type` remain in frontmatter.

### Verify export
```bash
curl -s "http://localhost:4000/workspaces/$WS_ID/okf/export" | jq .
```
Expect: `version: "0.2"`, `workspace` matching the workspace name, a generated `id`, an ISO `timestamp`, `custom_key: [1, 2, 3]`, and `document.body` containing `[[orders|the orders table]]`.

### Validation checks
```bash
# Missing type -> 400
curl -s -w '\nHTTP:%{http_code}' -X POST "http://localhost:4000/workspaces/$WS_ID/okf/import" \
  -H 'Content-Type: application/json' \
  -d '{"concepts":[{"path":"x.md","metadata":{},"document":{"body":""}}]}'

# Reserved filenames -> 400
curl -s -w '\nHTTP:%{http_code}' -X POST "http://localhost:4000/workspaces/$WS_ID/okf/import" \
  -H 'Content-Type: application/json' \
  -d '{"concepts":[{"path":"index.md","metadata":{"type":"Note"},"document":{"body":""}}]}'

curl -s -w '\nHTTP:%{http_code}' -X POST "http://localhost:4000/workspaces/$WS_ID/okf/import" \
  -H 'Content-Type: application/json' \
  -d '{"concepts":[{"path":"log.md","metadata":{"type":"Note"},"document":{"body":""}}]}'
```

### Workspace isolation quick check
- Create two workspaces, each with a `note.md`.
- `GET /workspaces/{ws}/search?q=Alpha` should return results only for the workspace whose note contains "Alpha".
- Backlinks and `/ask` should similarly stay scoped to the target workspace.

### Document CRUD and backlinks
- Create `a.md` linking to `[B](b.md)` before `b.md` exists.
- Create `b.md`.
- `GET /workspaces/{ws}/documents/{b}/backlinks` should list `a.md`.
- `GET /workspaces/{ws}/documents/{a}/links` should list `b.md`.
- `PUT` updates, `DELETE` returns 204, and `/documents` count drops by one.

## Shutdown
```bash
docker compose down -v
pkill -f 'node dist/index.js' || true
```
