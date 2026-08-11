# PKM v1 Golden-Path End-to-End Test Report

**Branch:** `devin/pkm-v1-search-ai`  
**Commit under test:** `ffd3d4e` (includes attachment auth fix `9eebf91`)  
**Date:** 2026-08-11 UTC

## Summary

All automated gates passed and all golden-path API and web UI scenarios passed after re-fetching the attachment-authorization fix.

| Category | Result |
|----------|--------|
| `pnpm -r build` | PASS |
| `pnpm -r typecheck` | PASS |
| `pnpm -r lint` | PASS |
| `pnpm -r test` | PASS (18/18 apps/api tests) |
| API end-to-end scenarios | PASS |
| Web UI end-to-end scenarios | PASS |

## Services

- AI service: `http://localhost:8000/health` ok
- API: `http://localhost:4000/health` ok
- Web dev server: `http://localhost:3000` ok
- Docker stack: `postgres`, `redis`, `minio`, `temporal` all healthy

## API Scenarios

Run via `e2e_api_report.py` against `http://127.0.0.1:4000`.

| Scenario | Result |
|----------|--------|
| Auth: register, `/auth/me`, logout, `/auth/me` 401, login | PASS |
| Workspaces: create and list member workspaces | PASS |
| Workspace isolation: non-member gets 403 on docs/search | PASS |
| Documents: create, edit, rename, backlinks/outgoing links update, delete | PASS |
| Search: unique text found, workspace-scoped, invalid `limit=abc` → 400 | PASS |
| Ask: cites a source from the same workspace | PASS |
| OKF: import note.md/index.md/log.md, export, re-import, no data loss, reserved filenames rejected | PASS |
| Attachments: upload, list, download, non-member denied, delete | PASS |

### Initial finding (fixed)

The first end-to-end run exposed an attachment-authorization bypass on `/attachments/:id?workspaceId=...`: unauthenticated and non-member requests could download an attachment if they knew the `workspaceId` and `attachmentId`, because the auth pre-handler only protected `/workspaces/*` routes. Commit `9eebf91` added `/attachments/:id` to the pre-handler and included `auth.test.ts` coverage. Re-running the full suite after this fix was green.

## Web UI Scenarios

Run in Chrome (incognito) against `http://localhost:3000`.

| Scenario | Result |
|----------|--------|
| Register a new user | PASS |
| Login / auto-redirect after registration | PASS |
| Create a note through the editor | PASS |
| Save the note | PASS |
| Switch workspaces | PASS |
| Search palette finds note in current workspace | PASS |
| Search palette returns empty in workspace without matching notes | PASS |
| Toggle theme | PASS |

## Artifacts

- API scenario script and log: `e2e_api_report.py`, `e2e_api_report.log`
- UI screenshots: `ui-01-login-page.png` through `ui-09-theme-dark.png`
- UI recording: `ui-golden-path.mp4`
- Detailed reports: `e2e_api_report.md`, `e2e_ui_report.md`
