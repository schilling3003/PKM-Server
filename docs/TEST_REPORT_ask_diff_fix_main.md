# Ask/Diff main fix end-to-end test report

**Branch:** `devin/pkm-ask-diff-fix-main` (PR #15)  
**Commit:** `0484e86 fix(web): keep Propose-diff instruction input editable when opened from workspace`  
**Runtime:** Docker Compose + AI (`EMBEDDING_PROVIDER=stub`, `EMBEDDING_DIMENSIONS=384`, no LLM) + API + Next.js dev server on `:3000`.

## Verdict

**PASS** — the diff page now correctly pre-selects the note when opened from the workspace **Propose** button or `Ctrl/Cmd+Shift+D`, keeps the instruction input and **Propose edit** button enabled, and auto-runs `/propose` only when both `documentId` and `instruction` query params are present. With no LLM, `/propose` returns a safe 200 warning and the UI surfaces it gracefully without crashing. All quality gates and the axe audit passed.

## Quality gates

| Gate | Result |
|------|--------|
| `pnpm -r typecheck` | passed |
| `pnpm -r lint` | passed |
| `pnpm -r build` | passed |
| `pnpm -r test` | passed (`apps/api` 50, `packages/markdown` 18, `packages/okf` 7) |
| `pnpm audit --prod` | passed (no known vulnerabilities) |
| Axe audit (`apps/web/scripts/axe-audit.js`) | passed (no critical/serious violations on `/`, `/login`, editor, `/ask`, `/diff`, `/attachments`, `/graph`, `/okf`) |

## Test assertions

- **Workspace Propose button** opens `/workspaces/{ws}/diff?documentId={doc}` and the diff page pre-selects the note.
- **`Ctrl+Shift+D` keyboard shortcut** from the workspace editor opens the same `/diff` URL with `documentId` pre-selected.
- **Controls enabled on pre-select:** `select#diff-doc` is not disabled, `input#diff-instruction` is editable and empty, and the **Propose edit** button is enabled once an instruction is typed.
- **Manual propose:** typing an instruction and clicking **Propose edit** calls `/propose` and renders the result.
- **Auto-run with both params:** opening `/diff?documentId={doc}&instruction=Add+a+diet+section` automatically runs `/propose`; during the request the select, input, and button are disabled, and the page shows `Proposing edit…`.
- **No-LLM graceful fallback:** `POST /propose` returns `200 OK` with `originalContent === proposedContent`, `warning: "No LLM is configured. No relevant notes were found to summarize."`, and explanation `"No relevant notes were found."`. The UI shows a yellow warning banner, `No changes were proposed.`, and the **Apply** button is disabled (the **Reject** button is enabled).
- **No crash / no unhandled 422:** the diff page catches the no-LLM response and renders it; no error alert is shown.
- **Axe audit covers `/diff`:** `apps/web/scripts/axe-audit.js` includes the `diff` route in its authenticated audit list and reports no critical or serious violations.

## Artifacts

- **Screen recording:** `/home/ubuntu/screencasts/pkm-ask-diff-fix-main/pkm-ask-diff-fix-main-edited.mp4`
- **Axe report:** `/tmp/axe-report-ask-diff.json`
- **Puppeteer test screenshots:**
  - `/tmp/diff-t1-start.png` — `/diff?documentId=...` with pre-selected note and editable instruction
  - `/tmp/diff-t1-result.png` — manual propose result: no-LLM warning and `No changes were proposed.`
  - `/tmp/diff-t2-auto.png` — auto-run loading state with controls disabled
  - `/tmp/diff-t2-result.png` — auto-run completed with no-LLM warning
  - `/tmp/diff-workspace-before.png` — workspace editor before clicking Propose
  - `/tmp/diff-propose-button.png` — diff page after workspace Propose button click
  - `/tmp/diff-shortcut.png` — diff page after `Ctrl+Shift+D`
- **Test scripts:**
  - `/tmp/diff-test.mjs` (full T1/T2 assertion run)
  - `/tmp/diff-propose-button.mjs` (Propose button navigation)
  - `/tmp/diff-shortcut.mjs` (`Ctrl+Shift+D` shortcut)

## Suggested blueprint updates

The repo blueprint already covers `pnpm -r typecheck/lint/build/test` and the local stack. It could be extended with:
- `pnpm audit --prod`
- `PUPPETEER_EXECUTABLE_PATH=... AXE_AUDIT_URL=http://localhost:3000 AXE_API_URL=http://localhost:4000 pnpm --filter @pkm/web test:axe`
- `EMBEDDING_PROVIDER=stub` / `EMBEDDING_DIMENSIONS=384` / no LLM env note for the `ai-service` smoke path.

## Anything still needed from the user

None. The fix behaves as specified; no release-blocking gaps were found.
