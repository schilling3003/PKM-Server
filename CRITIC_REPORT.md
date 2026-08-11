# PKM v1 Critic Report — Round 0.4

**Branch reviewed:** `devin/pkm-v1-search-ai` (`schilling3003/PKM-Server`)

**Verdict:** **FAIL**

## Gate Results

| Gate | Result |
|------|--------|
| `pnpm install` | Pass |
| `pnpm -r build` | Pass |
| `pnpm -r typecheck` | Pass |
| `pnpm -r lint` | Pass |
| `pnpm -r test` | Pass (packages/markdown 10/10, packages/okf 7/7, apps/api 17/17) |
| `docker compose up -d --wait` | Pass (postgres, redis, minio, temporal healthy) |
| End-to-end curl checks | **Fail on attachment authorization** |

## What Passed

- Auth: register / login / logout / `/auth/me` works; unauthenticated calls are rejected.
- Workspace creation assigns the caller as owner.
- Cross-workspace isolation holds for documents, search, backlinks, and `/ask` under `/workspaces/:id/*`.
- Document CRUD, rename, and backlink/outgoing-link updates work.
- `/workspaces/:id/search` returns `400` for `limit=abc` and `limit=0`.
- OKF import/export round-trips `index.md` and `log.md`; unknown frontmatter keys survive.
- The regular document API rejects creating `index.md` and `log.md` with `400`.
- The web editor loads `/workspaces/:id` and renders the workspace shell.

## Release-Blocking Gap: Attachment Download/Delete Authorization Bypass

`GET /attachments/:id` and `DELETE /attachments/:id` do **not** enforce workspace membership, so a non-member (or an unauthenticated client) who knows an attachment ID and its `workspaceId` can download or delete another workspace's attachments.

### Root Cause

- `registerAuthRoutes` installs the auth pre-handler only for paths that start with `/workspaces` (`apps/api/src/auth.ts` lines 108-133).
- The standalone attachment routes live under `/attachments/:id`, so the pre-handler never runs and `request.user` is never populated.
- `requireWorkspaceMembership` in `apps/api/src/attachments.ts` (line 37) then returns `true` when `request.user` is missing, and the only remaining check is the `workspaceId` query parameter.

### Reproduction

Run the local stack and execute this Python script:

```python
import requests, json
api = 'http://localhost:4000'
wsid = '<a workspace owned by user 1>'

s1 = requests.Session()
s1.post(f'{api}/auth/login', json={'email':'u1@example.com','password':'password123'})

boundary = '----test'
body = (
    f'--{boundary}\r\n'
    'Content-Disposition: form-data; name="file"; filename="leak.txt"\r\n'
    'Content-Type: text/plain\r\n\r\n'
    'secret content\r\n'
    f'--{boundary}--\r\n'
)
r = s1.post(
    f'{api}/workspaces/{wsid}/attachments',
    data=body,
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
)
att = json.loads(r.text)['id']

s2 = requests.Session()
s2.post(f'{api}/auth/login', json={'email':'u2@example.com','password':'password123'})

# u2 is NOT a member of ws1
print('non-member download:', s2.get(f'{api}/attachments/{att}?workspaceId={wsid}', allow_redirects=False).status_code)
# observed: 302 (MinIO presigned URL) — expected: 403

print('anonymous download:', requests.get(f'{api}/attachments/{att}?workspaceId={wsid}', allow_redirects=False).status_code)
# observed: 302 — expected: 401 or 403

print('non-member delete:', s2.delete(f'{api}/attachments/{att}?workspaceId={wsid}').status_code)
# observed: 204 — expected: 403
```

Observed in this review:

```
non-member download: 302
anonymous download: 302
non-member delete: 204
```

This violates the workspace-isolation requirement for attachments and the explicit acceptance criterion that non-members cannot download attachments from another workspace.

## Other Findings (Not Release-Blocking)

- `GET /workspaces` is public when no session cookie is present and returns every workspace ID/name.
- `requireWorkspaceMembership` has a fallback that treats missing auth as permitted, which is convenient for test harnesses but unsafe for production routes that are not covered by the `/workspaces` auth hook.

## Recommendation

Add the auth/membership pre-handler to `/attachments/:id` (and any other non-`/workspaces` routes), or move attachment download/delete under `/workspaces/:id/attachments/:id` so they inherit the existing workspace authorization. Remove the `if (!request.user) return true` fallback from `requireWorkspaceMembership` and update tests to authenticate the requests they make.
