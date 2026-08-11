---
name: testing-pkm
description: How to boot and verify the PKM v1 walking skeleton local stack.
---

# Testing the PKM v1 walking skeleton

## Devin Secrets Needed
- None for the local walking-skeleton flow.

## Prerequisites
- pnpm 11.x, Node 22.x, Docker Compose v2.x, python3, pip.
- Ports 3000, 4000, 8000, 5432, 6379, 9000-9001, 7233-7236 must be free.

## Clean bootstrap
```bash
cd /home/ubuntu/repos/PKM-Server
pkill -f 'uvicorn src.main:app|tsx watch|next dev' || true
rm -rf node_modules apps/ai/.venv .next dist apps/api/dist apps/web/.next packages/shared/dist
cp .env.example .env
pnpm install
pnpm -r build
```

## Start the local stack
```bash
docker compose down -v && docker compose up -d --wait
```
Wait until `docker compose ps` reports `postgres`, `redis`, `minio`, and `temporal` as `healthy`.

## Start the AI service
```bash
cd apps/ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
nohup .venv/bin/uvicorn src.main:app --host 0.0.0.0 --port 8000 > ai.log 2>&1 &
```

## Start the API and web dev servers
From the repo root:
```bash
nohup pnpm --filter @pkm/api start > api.log 2>&1 &
nohup pnpm --filter @pkm/web start > web.log 2>&1 &
```

For production-like end-to-end verification, use `start` instead of `dev`.

## Verify
```bash
curl http://localhost:8000/health
curl http://localhost:4000/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

## Shutdown
```bash
docker compose down -v
pkill -f 'uvicorn src.main:app|tsx watch|next dev' || true
```

## Known caveats
- `docker compose up -d --wait` can take a minute while Temporal auto-setup completes.
- `LayoutProps<"/">` in `apps/web/app/layout.tsx` currently uses a Next 16 typing style that may or may not type-check depending on the exact `@types/next` resolution; the build succeeded in the verified environment.
- The default `docker-compose.yml` and `.env.example` contain local-only cleartext credentials (`pkm`, `minioadmin`) which should be rotated/secret-injected before any non-local deployment.
