# PKM v1 round 0.8 end-to-end test report

**Branch under test:** `origin/devin/pkm-v1-search-ai` (latest, including workstream 16)  
**Commit tested:** `3aeb093` (`docs: update WORKSTREAMS and GAUNTLET_LOG for workstream 16`) and feature commit `ed1933d` (`feat: autosave, wikilink autocomplete, unlinked mentions, duplicate/archive/restore`)  
**Test date:** 2026-08-11  
**Testers:** `pkm-tester-3@example.com` / `TestPass123!` (UI); `u1_20260811@example.com` and `u2_20260811@example.com` (curl isolation)  
**Workspace:** `Test Round 0.8` (`112f40cd-ea05-4ccd-9c8c-74472c87fcae`)  
**Other workspace:** `Other Workspace` (`e3428576-9e26-415f-853a-ee9ecf9a0f09`)  

## Environment

- Reset to `origin/devin/pkm-v1-search-ai` and rebuilt with `pnpm -r build` after discovering an old `next-server` process was still bound to port 3000 and serving a stale build.
- Docker Compose stack (postgres, redis, minio, temporal) healthy.
- AI service (`uvicorn src.main:app`) on 8000, API (`pnpm --filter @pkm/api start`) on 4000, web (`pnpm --filter @pkm/web start`) on 3000.
- `curl http://localhost:4000/health` → `{"status":"ok","version":"0.1.0"}`.
- `curl http://localhost:8000/health` → `{"status":"ok","version":"0.1.0"}`.
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` → `200`.

## Recording and screenshots

- **Recording:** `/home/ubuntu/screencasts/pkm-v1-round-0-8-actual/pkm-v1-round-0-8-actual-edited.mp4`
- A previous recording (`/home/ubuntu/screencasts/pkm-v1-round-0-8-clean/...`) was superseded because the web server was still running a stale build; it is not included in the final verdict.
- Screenshots are saved under `/home/ubuntu/screenshots/` with prefixes `ss_...`; key frames are referenced in the flow results below.

## Flow results

### Flow A — Registration, workspace/note creation, wikilink resolution
**Result: PASS**

- Registered `pkm-tester-3@example.com` and was redirected to `/`.
- Created `Test Round 0.8`.
- Created `notes/intro.md` and `notes/Roadmap.md`.
- Saved Markdown, saw file tree update, preview render, and the right panel show outgoing/backlinks, outline, tags, and properties.
- `[[notes/Roadmap]]` in `intro.md` previewed as a clickable `notes/Roadmap` button and the right panel resolved the outgoing link to `Roadmap`.

### Flow B — Autosave
**Result: PASS**

- Typed a new paragraph into `intro.md` and waited > 1 s.
- The `Save` button disabled and the content persisted after a refresh.

### Flow C — Wikilink autocomplete
**Result: FAIL**

- Typed `[[road` at the end of `intro.md`; the autocomplete dropdown appeared with `Roadmap`.
- Selected the candidate.
- The editor inserted `[[[[notes/Roadmap.md|road]]` instead of `[[notes/Roadmap.md|road]]` or `[[notes/Roadmap.md]]` — the original `[[` prefix was not removed, leaving an unresolved wikilink.
- The preview rendered the malformed link as plain text and the right panel showed an `Unresolved wikilinks` entry.

### Flow D — Unlinked mentions
**Result: PASS**

- Added `Also see the intro note for context.` to `Roadmap.md` (which should match `intro.md`) and saved.
- The right panel rendered an `Unlinked mentions` section listing `intro.md`.
- Clicking the mention navigated to `intro.md`.

### Flow E — Duplicate, archive, and restore
**Result: PARTIAL PASS**

- `Duplicate` on `Roadmap.md` created `notes/Roadmap (copy).md` in the active tree and opened it.
- `Archive` on `Roadmap (copy).md` removed it from the active tree, showed the `Show archived` checkbox, and revealed the archived note when checked.
- `Restore` on the archived note persisted the change on the backend (the note reappears in the active tree after a page reload), but the in-page tree state did not update immediately; the archived entry stayed visible and the active tree did not show the restored note until after navigating away and back. The underlying `restore` endpoint works correctly.

### Flow F — Search palette (Command-K)
**Result: PASS**

- `Ctrl+K` opened the search palette.
- Typing `roadmap` filtered to `Roadmap` and `intro`, and selecting `Roadmap` navigated to it.

### Flow G — Graph view
**Result: PASS**

- Graph page showed the workspace-scoped graph with nodes for `intro`, `Roadmap`, and `Roadmap (copy)` connected by edges.

### Flow H — Attachment upload and download
**Result: PASS**

- Uploaded `pkm_test_attachment.txt` from the browser.
- Attachments list showed `pkm_test_attachment.txt`, `text/plain`, `29 B`.
- `curl` download returned exactly `PKM round 0.8 attachment test` (29 bytes).

### Flow I — Workspace isolation and switching
**Result: PASS**

- Workspace dropdown listed `Test Round 0.8` and `Other Workspace`.
- `Other Workspace` contained only `private.md`; switching back to `Test Round 0.8` showed `intro.md`, `Roadmap.md`, and `Roadmap (copy).md` only.

### Flow J — Logout and re-login
**Result: PASS**

- Clicking `Logout` redirected to `/login`.
- Re-login with the same credentials restored both workspaces and the `Test Round 0.8` notes.

### Flow K — Curl verification of isolation, graph leakage, and CSP
**Result: PASS**

- `Content-Security-Policy` header is present and nonce-based:
  - `script-src 'self' 'nonce-...' 'strict-dynamic'`
  - No `unsafe-inline` or `unsafe-eval`.
- `X-Powered-By` header is absent.
- As `u2`, all cross-workspace requests to `u1` returned `403`:
  - `GET /workspaces/{WS1}/documents`
  - `GET /workspaces/{WS1}/documents/{D1}`
  - `GET /workspaces/{WS1}/graph`
  - `GET /workspaces/{WS1}/attachments`
- Graph JSON node ID sets for `u1` and `u2` are disjoint:
  - `u1` nodes: `f4a90510-beb3-49a6-922a-b6cf2a2b3064`
  - `u2` nodes: `85b041ef-e04c-46b7-a22a-02e3a338902b`

## Blockers / follow-ups

1. **Wikilink autocomplete insertion bug.** When a candidate is selected, the editor inserts `[[[[<path>|<query>]]` because the original `[[` is not subtracted from the insertion point. This leaves an unresolved wikilink and breaks the link preview.
2. **Archive/restore UI reactivity.** The `restore` backend endpoint works, but clicking `restore` does not immediately refresh the tree state. The archived item remains visible and the active tree does not show the restored note until the workspace page is reloaded or re-entered.

## Summary

The core PKM v1 flows — registration, workspace/note creation, autosave, unlinked mentions, duplicate/archive UI, search, graph, attachments, workspace isolation, logout/re-login, and HTTP-level isolation/CSP — are working in the latest branch. The new workstream 16 features are mostly functional, but the wikilink autocomplete insertion leaves a malformed link, and the archive/restore tree state needs a page reload to reflect the restored note.
