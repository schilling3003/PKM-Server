# PKM v1 End-to-End Test Report — 2026-08-11

Branch under test: `devin/pkm-v1-search-ai`
Tester: Devin end-to-end run
Date: 2026-08-11

## Summary

The `devin/pkm-v1-search-ai` branch was exercised against a full Docker Compose local stack (postgres, redis, minio, temporal), the AI service (port 8000), the API (port 4000), and the Next.js web app (port 3000).

- All requested golden-path browser and `curl` flows passed.
- One release-blocking authentication issue was found: a user cannot log in again immediately after logout because the session cookie is derived from the user ID and the same value is re-issued after logout, hitting the logout blocklist.
- Rate-limiting in Redis required a manual flush during repeated automated test iterations; this is test-environment noise.

## Setup

```bash
cd /home/ubuntu/repos/PKM-Server
cp .env.example .env
pnpm install
docker compose down -v && docker compose up -d --wait
pnpm -r build
cd apps/ai && .venv/bin/pip install -r requirements.txt
nohup .venv/bin/uvicorn --app-dir apps/ai src.main:app --host 0.0.0.0 --port 8000 > ai.log 2>&1 &
cd /home/ubuntu/repos/PKM-Server
nohup node apps/api/dist/index.js > api.log 2>&1 &
nohup pnpm --filter @pkm/web start > web.log 2>&1 &
```

Health checks:

```bash
curl -s http://localhost:4000/health   # {"status":"ok","version":"0.1.0"}
curl -s http://localhost:8000/health   # {"status":"ok","version":"0.1.0"}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000   # 200
```

## Browser tests

| # | Flow | Result | Notes |
|---|------|--------|-------|
| 1 | Register a new user and log in | Pass | User created and redirected to workspace list. |
| 2 | Create a workspace | Pass | Created "E2E Alpha". |
| 3 | Create a note, edit Markdown, save | Pass | Frontmatter title `E2E Test Note` saved to `journal/e2e-note.md`. |
| 4 | File tree updates after save | Pass | Tree updates after save; folder `journal/` must be expanded to see the titled note. |
| 5 | Switch workspaces and verify isolation | Pass | Created "E2E Beta"; no notes from Alpha leaked; switching back restored the Alpha tree. |
| 6 | Search palette (Command-K / Control+K) | Pass | Typed `Hello`, selected `E2E Test Note`, and navigated back. |
| 7 | Graph view | Pass | Canvas showed `2 notes · 1 links` after adding a wikilink to `second.md`. |
| 8 | Outline panel | Pass | Listed `# Hello World` and `## Subsection` headings. |
| 9 | Tags / properties panel | Pass | Showed `type: Note`, `demo`, and `e2e` tags. |
| 10 | Attachment upload/download | Pass | Uploaded `.txt` file, appeared in list, and downloaded content matched original. |
| 11 | Logout and session invalidation | Pass | Logout redirected to `/login`; direct navigation to `/workspaces/<id>` redirected to `/login`. |

## curl tests

| # | Flow | Result | Notes |
|---|------|--------|-------|
| 1 | Register/login via API | Pass | Obtained authenticated session. |
| 2 | Workspace CRUD via API | Pass | Create/list/delete workspaces. |
| 3 | Note/document CRUD via API | Pass | Create/read/update/delete notes in workspace. |
| 4 | Graph endpoints per workspace | Pass | `/workspaces/W1/graph` contained only W1 nodes/edges; W2 graph contained only W2 nodes/edges. |
| 5 | Non-member gets 403 on workspace | Pass | User B received `403` for W1 graph, documents, search, and attachment download. |
| 6 | Attachment isolation | Pass | Owner could upload/download; non-owner got `403`. |
| 7 | Search scoped to workspace | Pass | Results did not leak across workspaces. |
| 8 | Logout invalidates session | Pass | After logout, old session returned `401` on `/workspaces`. |

## Blockers / findings

1. **Re-login after logout is broken** (release-blocking)
   - Root cause: the `pkm_session` cookie value is the signed user ID. `/auth/logout` blocklists that value. On the next login for the same user, the same signed user ID is re-issued, so the new session is immediately invalid.
   - Evidence:
     ```
     logout 200  Set-Cookie: pkm_session=; Max-Age=0
     login  200  Set-Cookie: pkm_session=<same-signed-user-id>
     GET /workspaces 401 {"error":"Unauthorized"}
     ```
   - Recommended fix: issue a random session ID, store it server-side (or in signed cookie) and blocklist the session ID on logout, not the user ID.

2. **Auth rate-limiting during rapid test runs**
   - The default `10 req/min` per-IP limit was hit during repeated local curl/browser iterations.
   - Workaround: clear `pkm:rl:*` keys in Redis.
   - This is test-environment noise, not a product bug, but test suites should either use distinct IPs or disable rate limiting in test mode.

## Artifacts

- Screen recording (with setup, test-start, and assertion annotations):
  - `/home/ubuntu/screencasts/pkm-search-ai-e2e/pkm-search-ai-e2e-edited.mp4`
- Screenshots:
  - `/tmp/pkm_01_login.png`
  - `/tmp/pkm_02_home_after_register.png`
  - `/tmp/pkm_03_workspace_alpha.png`
  - `/tmp/pkm_04_note_created.png`
  - `/tmp/pkm_05_note_saved.png`
  - `/tmp/pkm_06_second_note.png`
  - `/tmp/pkm_07_tree_expanded.png`
  - `/tmp/pkm_08_note_open_for_panels.png`
  - `/tmp/pkm_09_panels.png` — outline + tags/properties panel
  - `/tmp/pkm_10_search_selected.png` — Command-K search result
  - `/tmp/pkm_11_workspace_beta.png`
  - `/tmp/pkm_12_switched_alpha.png`
  - `/tmp/pkm_13_graph.png` — graph view (`2 notes · 1 links`)
  - `/tmp/pkm_14_attachments_empty.png`
  - `/tmp/pkm_15_attachments_uploaded.png`
  - `/tmp/pkm_16_download_done.png`
  - `/tmp/pkm_17_logout.png`
- Skill draft (manual E2E test harness used by this run):
  - `/home/ubuntu/repos/PKM-Server/.devin/skills/testing-pkm-e2e/SKILL.md`
