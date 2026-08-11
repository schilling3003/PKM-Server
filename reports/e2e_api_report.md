# PKM v1 Golden-Path API Test Report

Branch: `devin/pkm-v1-search-ai`
Commit under test: `ffd3d4e` (includes attachment auth fix 9eebf91)
Date: 2026-08-11 UTC

## Gates

| Gate | Result |
|------|--------|
| `pnpm -r build` | PASS |
| `pnpm -r typecheck` | PASS |
| `pnpm -r lint` | PASS |
| `pnpm -r test` | PASS (18/18 apps/api tests) |

## Services

- AI service: `http://127.0.0.1:8000` healthy
- API: `http://127.0.0.1:4000` healthy
- Web dev server: `http://127.0.0.1:3000` returns 200
- Docker stack: postgres, redis, minio, temporal all healthy

## API End-to-End Scenarios

All API scenarios passed after re-fetching commit 9eebf91 and rebuilding/restarting the API.

| Scenario | Result |
|----------|--------|
| Auth: register, /auth/me, logout, /auth/me 401, login, /auth/me | PASS |
| Workspaces: create workspace, /workspaces lists only member workspaces | PASS |
| Workspace isolation: user2 workspace, user1 gets 403 on docs/search | PASS |
| Documents: create, edit, rename, backlinks/outgoing links update, delete | PASS |
| Search: unique text found, workspace-scoped, invalid limit=abc returns 400 | PASS |
| Ask: question answered with a cited source from same workspace | PASS |
| OKF: import bundle with note.md/index.md/log.md, export, re-import, no data loss, regular API rejects reserved filenames | PASS |
| Attachments: upload, list, download (presigned MinIO), non-member denied, delete | PASS |

## Notes

- The first end-to-end run hit an attachment-authorization bypass on `/attachments/:id?workspaceId=...`: unauthenticated and non-member requests could download with the correct workspaceId because the auth pre-handler only protected `/workspaces/*` routes. This was resolved by commit 9eebf91, which adds `/attachments/:id` to the auth pre-handler and verifies membership.
- Full scenario script and log are included as `e2e_api_report.py` and `e2e_api_report.log`.
