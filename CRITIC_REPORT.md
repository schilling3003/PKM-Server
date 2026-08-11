# PKM v1 Critic Report — Round 0.4 (Re-Review)

**Branch reviewed:** `devin/pkm-v1-search-ai` (`schilling3003/PKM-Server`)

**Verdict:** **PASS**

## Gate Results

| Gate | Result |
|------|--------|
| `pnpm install` | Pass |
| `pnpm -r build` | Pass |
| `pnpm -r typecheck` | Pass |
| `pnpm -r lint` | Pass |
| `pnpm -r test` | Pass (packages/markdown 10/10, packages/okf 7/7, apps/api 18/18) |
| `docker compose up -d --wait` | Pass (postgres, redis, minio, temporal healthy) |
| End-to-end checks | Pass |

## What Passed

- Auth: register / login / logout / `/auth/me` works; unauthenticated calls are rejected.
- Workspace creation assigns the caller as owner.
- Cross-workspace isolation holds for documents, search, backlinks, `/ask`, and attachments.
- Document CRUD, rename, and backlink/outgoing-link updates work.
- `/workspaces/:id/search` returns `400` for `limit=abc` and `limit=0`.
- OKF import/export round-trips `index.md` and `log.md`; unknown frontmatter keys survive.
- The regular document API rejects creating `index.md` and `log.md` with `400`.
- Attachment upload / list / member download (`302`) / member delete (`204`) works.
- Non-members and unauthenticated clients are now rejected from `GET /attachments/:id` and `DELETE /attachments/:id` with `401`/`403`.
- The web editor loads `/workspaces/:id` and renders the workspace shell.

## Previously Reported Gap — Fixed

The attachment download/delete authorization bypass reported in the first pass has been addressed in commit `9eebf91`:

- `/attachments/:id` routes are now covered by the workspace auth pre-handler.
- `apps/api/test/auth.test.ts` includes a dedicated `attachment authorization` test that verifies:
  - unauthenticated requests receive `401`
  - non-member requests receive `403`

### Reproduction After Fix

```python
import requests
api = 'http://localhost:4000'

s1 = requests.Session()
s1.post(f'{api}/auth/login', json={'email':'u1@example.com','password':'password123'})

wsid = s1.post(f'{api}/workspaces', json={'name':'Test'}).json()['id']
boundary = '----test'
body = (
    f'--{boundary}\r\n'
    'Content-Disposition: form-data; name="file"; filename="hello.txt"\r\n'
    'Content-Type: text/plain\r\n\r\n'
    'Hello world\r\n'
    f'--{boundary}--\r\n'
)
att = s1.post(f'{api}/workspaces/{wsid}/attachments', data=body,
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
).json()['id']

s2 = requests.Session()
s2.post(f'{api}/auth/login', json={'email':'u2@example.com','password':'password123'})

print('member download:', s1.get(f'{api}/attachments/{att}?workspaceId={wsid}', allow_redirects=False).status_code)   # 302
print('non-member download:', s2.get(f'{api}/attachments/{att}?workspaceId={wsid}', allow_redirects=False).status_code)   # 403
print('anonymous download:', requests.get(f'{api}/attachments/{att}?workspaceId={wsid}', allow_redirects=False).status_code)  # 401
print('non-member delete:', s2.delete(f'{api}/attachments/{att}?workspaceId={wsid}').status_code)  # 403
```

Observed in this re-review:

```
member download: 302
non-member download: 403
anonymous download: 401
non-member delete: 403
```

## Notes

- `GET /workspaces` remains public when no session cookie is present and returns every workspace ID/name. This is an information-disclosure finding but is not a release blocker.
- The `/ask` endpoint returns grounded citations scoped to the requested workspace; the AI service still uses deterministic stub embeddings and a fixed fallback answer, which is acceptable for the walking-skeleton stage.
