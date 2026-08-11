# PKM v1 Critic Report

## Verdict

**FAIL** — branch `devin/pkm-v1-search-ai` (commit `cce7265`) has a release-blocking OKF
round-trip/data-loss bug and several smaller correctness/hardening gaps.

## Branch / commit reviewed

- Branch: `devin/pkm-v1-search-ai`
- Commit: `cce7265 docs(WORKSTREAMS): assign parallel child session ownership for auth, attachments, and search`
- Repository: `schilling3003/PKM-Server`

## Tests run

| Gate | Result |
|------|--------|
| `pnpm -r build` | Pass |
| `pnpm -r typecheck` | Pass |
| `pnpm -r lint` | Pass |
| `pnpm -r test` | Pass (10 + 7 + 4 tests) |
| `docker compose up -d --wait` | Healthy |
| `/tmp/pkm_e2e2.py` (workspace, doc CRUD, search, ask, OKF export/import, isolation) | Pass |
| Manual browser smoke (workspace switcher, new note, wikilink resolved/unresolved, save, links panel) | Observed working |

## Release blocker: OKF export cannot be re-imported when `index.md` or `log.md` exist

### Reproduction

```python
import urllib.request, json

base = 'http://localhost:4000'

# 1. Create a workspace
ws = json.loads(urllib.request.urlopen(
    urllib.request.Request(
        f'{base}/workspaces',
        data=json.dumps({'name': 'OKF Reimport Bug'}).encode(),
        headers={'Content-Type': 'application/json'}
    )
).read())
wsid = ws['id']

# 2. Create index.md and log.md through the regular document API
for path, body in [
    ('index.md', '---\ntype: Index\n---\n\n# Index\n\n* [x](x.md)\n'),
    ('log.md', '---\ntype: Log\n---\n\n## 2026-08-11\n\n* update\n'),
]:
    urllib.request.urlopen(urllib.request.Request(
        f'{base}/workspaces/{wsid}/documents',
        data=json.dumps({'path': path, 'content': body}).encode(),
        headers={'Content-Type': 'application/json'}
    ))

# 3. Export the workspace as OKF
export = json.loads(urllib.request.urlopen(
    f'{base}/workspaces/{wsid}/okf/export'
).read())
print(json.dumps(export, indent=2))

# 4. Re-import the same bundle
req = urllib.request.Request(
    f'{base}/workspaces/{wsid}/okf/import',
    data=json.dumps(export).encode(),
    headers={'Content-Type': 'application/json'}
)
try:
    urllib.request.urlopen(req)
    print('re-import succeeded')
except urllib.error.HTTPError as e:
    print('re-import failed', e.code, e.read().decode())
```

### Observed behavior

`export` emits `index.md` and `log.md` inside `concepts`:

```json
{
  "version": "0.2",
  "concepts": [
    { "id": "index", "path": "index.md", ... },
    { "id": "log", "path": "log.md", ... }
  ],
  "indices": [],
  "logs": []
}
```

`okf/import` then rejects the bundle:

```json
{"error":"Reserved filename cannot be used for a concept: index.md"}
```

### Why this is release-blocking

`docs/PRODUCT.md` requires "Import and export a complete, portable knowledge base
without semantic loss." The current implementation allows creating notes named
`index.md` and `log.md` via the document API, but OKF export turns them into
(non-compliant) concepts, and OKF import rejects them. A workspace with those
files cannot be round-tripped, so the knowledge base is not portable.

### Root cause

- `apps/api/src/okf.ts` `exportOkf` maps every document in `documents.getWorkspaceDocuments`
  to a concept; it does not treat `index.md` or `log.md` specially or use
  `packages/okf/src/core.ts` `parseIndex` / `parseLog`.
- `apps/api/src/documents.ts` `createDocument` / `updateDocument` do not reject
  reserved filenames, so the invalid state can be created in the first place.

### Recommended fix

1. In `apps/api/src/documents.ts` `normalizePath`, throw on reserved filenames
   (`index.md` and `log.md`) so the regular API cannot create them as concept notes.
2. Alternatively, fully support `index.md`/`log.md` as OKF first-class citizens:
   - `exportOkf` should route `index.md` to `bundle.indices` and `log.md` to
     `bundle.logs` using `packages/okf` `parseIndex`/`parseLog`.
   - `okf/import` should accept bundle-level `indices` and `logs` and write them as
     documents with reserved filenames.
   - `createDocument`/`updateDocument` should still prevent user-created concept
     notes from using reserved names.

## Other recommended fixes (non-blocking)

1. **`apps/web/app/workspaces/[id]/page.tsx` `handleSave` should call `setContent(updated.content)`**
   After a successful save the component re-renders with `value={content}` while
   `content` may lag `textareaRef.current.value`. If they ever diverge the editor
   can revert visible text on the next keystroke. Setting `content` from the
   server response keeps source, preview, and dirty state consistent.

2. **Validate `limit` query parameter in `/workspaces/:id/search`**
   `app.ts` passes `Number(limit)` directly to Postgres. A non-numeric `limit`
   (e.g. `?q=test&limit=abc`) becomes `NaN` and causes a 500.

3. **Harden `MarkdownLink` external URL scheme allowlist**
   `react-markdown`’s default `urlTransform` currently drops `javascript:` and
   other dangerous schemes, so the common exploit paths are blocked. The component
   itself still renders any string as `href` with `target="_blank"`. Add an
   explicit scheme allowlist (`http:`, `https:`, `mailto:`, `tel:`) inside
   `MarkdownLink` so a future `react-markdown` or `urlTransform` configuration
   change cannot re-introduce stored-XSS vectors.

4. **Align OKF bundle field name with `packages/okf/src/types.ts`**
   `OkfBundle` defines `okfVersion`, but `apps/api/src/okf.ts` uses `version` for
   both import schema and export payload. Pick one and use it consistently across
   the API and the package types.

5. **Update `document_links.target_path` when a document is renamed**
   `updateDocument` path changes leave other notes’ outgoing `target_path` columns
   stale. Because joins use `target_document_id`, navigation still works, but the
   stored path is incorrect and may confuse future OKF export/link sync logic.

## What passed

- Workspace isolation: documents, search, backlinks, and `/ask` citations are all
  scoped by `workspace_id` in SQL and confirmed by unit + E2E tests.
- Canonical Markdown / YAML preservation: unknown frontmatter keys survive
  create, update, OKF import, export, and re-import (integration test).
- Required `type` enforcement and wikilink/standard-link conversion work in both
  directions.
- Build, typecheck, lint, and test gates all pass.
- Web editor supports creating notes, split source/preview, wikilink resolution
  and unresolved indicators, outgoing/backlink panels, and workspace switching.
- XSS via `javascript:` links in Markdown preview is mitigated by
  `react-markdown`’s default `urlTransform`; no script execution was observed.
