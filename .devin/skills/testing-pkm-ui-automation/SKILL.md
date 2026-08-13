---
name: testing-pkm-ui-automation
description: Reliable browser automation notes for testing the PKM web UI via the Devin Chrome CDP endpoint.
---

# Testing PKM v1 UI with Puppeteer over Devin Chrome

## Devin Secrets Needed
- None for the local walking-skeleton flow.
- The test account and workspace/note should be seeded through the API; browser login with `computer` typing is unreliable due to display scaling.

## Launching the browser for automation

Devin provides Chrome for Testing with CDP on `http://localhost:29229`. The `google-chrome` wrapper only opens a *tab* in that remote browser, while passing flags (e.g. `--remote-debugging-port=...`) launches the real binary directly. For consistent UI testing:

```bash
/opt/.devin/google-chrome.sh \
  --user-data-dir=/tmp/pkm-ui-test \
  --no-first-run \
  --start-maximized \
  --remote-debugging-port=29229 \
  http://localhost:3000/login
```

Verify CDP is reachable:
```bash
curl -s http://localhost:29229/json/version
```

## Authenticating the browser

Native `computer` clicks/type often miss because the `computer` tool uses a 1024x768 coordinate space while the actual display is 1600x1200, and browser chrome (tabs/address bar) shifts viewport coordinates. The most reliable approach is:

1. Seed a user and workspace/note with `curl` against `http://localhost:4000`.
2. Set the session cookie by calling `/api/auth/login` from within the browser context (Puppeteer `page.evaluate` or `fetch`), then navigate to the target workspace.

The `pkm_session` cookie is `httpOnly` and cannot be set via JavaScript, but a same-origin `fetch('/api/auth/login', {method:'POST', ...})` will store it automatically.

## Driving the UI with puppeteer-core

`@pkm/web` already depends on `puppeteer-core`, so no extra install is needed:

```js
import puppeteer from '/home/ubuntu/repos/PKM-Server/apps/web/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:29229' });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
await page.bringToFront();
```

Use `page.type`, `page.click`, `page.select`, and keyboard shortcuts (`page.keyboard.down('Control')...`) instead of `computer` coordinates for reliable interaction.

## Common selectors

- Login form: `input#email`, `input#password`, `form button[type="submit"]`
- Workspace header: `a[title*="Ask workspace"]`, `a[title*="Propose edit"]`
- Ask page: `input#ask-question`, `form button[type="submit"]`, `section h2` (Answer/Sources)
- Diff page: `select#diff-doc`, `input#diff-instruction`, `form button[type="submit"]`

## Known caveats

- With no LLM configured, `/ask` returns a safe no-LLM answer with citations. `POST /propose` returns `200 OK` with `originalContent === proposedContent`, a `warning` such as `No LLM is configured...`, and `citations` pointing at the most relevant notes. The UI should surface the warning and disable **Apply** when no changes were proposed.
- The Diff page pre-selects the note when opened from the workspace **Propose** button or `Ctrl+Shift+D` (`/workspaces/[id]/diff?documentId=...`); the instruction input remains editable so the user can type an instruction and click **Propose edit**.
- Auto-running `/propose` only happens when **both** `documentId` and `instruction` query parameters are present (`/workspaces/[id]/diff?documentId=...&instruction=...`). In that case the select/input/button are disabled while the request is in flight, then the diff/apply UI appears.
