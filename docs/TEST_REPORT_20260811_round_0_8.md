# PKM v1 round 0.8 end-to-end test report

**Branch under test:** `origin/devin/pkm-v1-search-ai` (commit `59ccb65`)
**Report date:** 2026-08-11
**Tester:** Devin testing agent
**Environment:** local Docker Compose stack (postgres, redis, minio, temporal) + AI service (port 8000) + API (port 4000) + Next.js production build (port 3000)
**Recording:** `/home/ubuntu/screencasts/pkm-v1-round-0-8/pkm-v1-round-0-8-edited.mp4`

## Setup notes

- All required ports were free; Docker Compose services came up healthy.
- `pnpm install` and `pnpm -r build` completed successfully.
- The production API start (`pnpm --filter @pkm/api start`) failed with `bcrypt.hash is not a function` because `apps/api/src/auth.ts` uses `import * as bcrypt from 'bcryptjs'`, which under Node's native ESM loads `bcryptjs` as a namespace whose `hash`/`compare` properties are not callable (only `bcrypt.default` is). To complete end-to-end testing, the generated `apps/api/dist/auth.js` was temporarily patched to `import bcrypt from 'bcryptjs';` and restarted. This must be fixed in source and retested against an unmodified production build.

## Test flow results

| Flow | Description | Result | Notes |
|------|-------------|--------|-------|
| A | Register, create workspace, create/edit notes, file tree updates | **Passed** | Registration redirected to `/`; workspace and both notes appeared; outgoing/backlink panels updated after creating `Roadmap.md`. |
| B | Workspace isolation | **Passed** | Created a second workspace (`Other Workspace`) and a note `private.md`; switching via the sidebar dropdown showed only the selected workspace's notes. Cross-user isolation was verified with `curl` (403). |
| C | Search palette (Command-K) | **Passed** | `Ctrl+K` opened the palette; typing `roadmap` returned results and Enter opened `Roadmap.md`. |
| D | Graph view | **Passed** | Graph page rendered and showed `2 notes · 1 links`; the intro↔Roadmap edge was visible. |
| E | Outline and tags/properties panels | **Passed** | `Roadmap.md` displayed `type: Note`, `status: active`, and tags `planning`/`v1`; `intro.md` outline listed `Goals` and `References`. |
| F | Attachment upload and download | **Passed** | `pkm_test_attachment.txt` uploaded (29 B, text/plain); download fetch returned the exact uploaded content. |
| G | Logout and re-login | **Passed** | Logout redirected to `/login`; re-login restored the workspace list with both workspaces. |
| H | Curl: CSP, workspace isolation, graph isolation | **Passed** | CSP header is nonce-based and contains no `unsafe-inline`/`unsafe-eval`; non-member gets 403; graph node IDs are disjoint across workspaces. |

## Detailed curl evidence (Flow H)

```
$ curl -I http://localhost:3000/login
content-security-policy: default-src 'self'; script-src 'self' 'nonce-<nonce>' 'strict-dynamic'; ...
# No X-Powered-By header present

$ curl -s -o /dev/null -w "%{http_code}" -b u2.jar http://localhost:4000/workspaces/<u1-ws>/documents
403

$ curl -s -o /dev/null -w "%{http_code}" -b u2.jar http://localhost:4000/workspaces/<u1-ws>/graph
403

$ curl -s -b u1.jar .../graph  | jq '.nodes | length'  -> 1
$ curl -s -b u2.jar .../graph  | jq '.nodes | length'  -> 1
# Intersection of node IDs across the two user workspaces: empty set
```

## Blockers / follow-ups

1. **API bcryptjs ESM interop bug (release-blocking).** The production build cannot register or log in users until `apps/api/src/auth.ts` imports `bcrypt` correctly (e.g., `import bcrypt from 'bcryptjs';`). The `dev` (`tsx watch`) path happens to work but the production `start` path does not.
2. **Workspace creation form intermittently unresponsive on the `/` page re-visit.** After re-login, typing a workspace name and pressing Enter / clicking `Create` did not create the workspace until the page was refreshed and the API was called directly. This needs reproduction and a fix in the home page form state/handler.
3. **Middleware `/` redirect flakiness.** At one point `/` redirected to `/login` even though the user was still authenticated (UserNav showed the email). A re-login cleared it; root cause should be investigated.
4. The temporary `apps/api/dist/auth.js` patch and the extra `.env` copies in `apps/api`, `apps/web`, and `apps/ai` should be cleaned up after the source fix.

## Artifacts

- **Screen recording:** `/home/ubuntu/screencasts/pkm-v1-round-0-8/pkm-v1-round-0-8-edited.mp4`
- **Selected screenshots:**
  - Workspace list after re-login: `/home/ubuntu/screenshots/ss_5fd33452.png`
  - Graph view showing `2 notes · 1 links`: `/home/ubuntu/screenshots/ss_db5f5c4c.png`
  - Search palette with `roadmap` results: `/home/ubuntu/screenshots/ss_a7e71e95.png`
  - Attachment uploaded: `/home/ubuntu/screenshots/ss_2a9adf10.png`

## Verdict

The end-to-end functionality **works after the temporary bcryptjs runtime patch**. The flows requested in the test plan pass, workspace isolation and CSP are correct, and the recording and curl evidence support that. However, the production build's auth import is a **release blocker** and must be fixed before this branch can be considered merge-ready.
