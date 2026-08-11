# PKM Server

A production-quality, server-based, Markdown-first Personal Knowledge Management
application with AI as a native, inspectable capability.

## Local development

1. Copy environment defaults: `cp .env.example .env`
2. Start backing services: `docker compose up -d --wait`
3. Install dependencies: `pnpm install`
4. Start the API and web dev servers: `pnpm dev`
5. Start the AI service:
   ```bash
   cd apps/ai
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn src.main:app --reload
   ```
6. Check health:
   - API: http://localhost:4000/health
   - AI: http://localhost:8000/health
   - Web: http://localhost:3000

## Verification

- `docker compose ps` shows all backing services healthy.
- `pnpm -r typecheck` runs TypeScript checks across the monorepo.
- `pnpm -r lint` runs linting.
- `pnpm -r build` compiles the shared packages and apps (required before tests because `@pkm/markdown`, `@pkm/shared`, and `@pkm/okf` are consumed from `dist/`).
- `pnpm -r test` runs the test suites. API/integration tests require the Docker Compose stack to be running.
- On a fresh checkout, run in order: `pnpm install`, `pnpm -r build`, `pnpm -r test`.

## Project structure

- `apps/web` — Next.js application (editor, navigation, command palette)
- `apps/api` — Fastify application API (CRUD, search, auth, collaboration)
- `apps/ai` — FastAPI AI service (LightRAG, embeddings, grounded answers)
- `packages/shared` — Shared TypeScript schemas and types
- `docs` — Product, architecture, security, quality, decisions, workstreams,
  and Gauntlet log

See `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` for the v1 definition.
