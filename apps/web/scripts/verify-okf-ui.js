#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.OKF_UI_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.OKF_UI_API_URL || 'http://localhost:4000';

function log(...args) {
  console.log('[okf-ui]', ...args);
}

async function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const home = process.env.HOME || '';
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/chrome',
    '/usr/local/bin/google-chrome',
    '/usr/local/bin/chromium',
    `${home}/.local/bin/google-chrome`,
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Chrome/Chromium executable not found. Set PUPPETEER_EXECUTABLE_PATH.');
}

async function registerUser() {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `okf-ui-${Date.now()}@example.com`, password: 'OkfUi123!' }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Register failed: ${res.status} ${text}`);
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/pkm_session=([^;\s]+)/);
  if (!match) throw new Error('No pkm_session cookie from register response');
  return match[1];
}

async function createWorkspace(sessionValue) {
  const res = await fetch(`${API_URL}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `pkm_session=${sessionValue}` },
    body: JSON.stringify({ name: 'OKF UI Test' }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Create workspace failed: ${res.status} ${text}`);
  return JSON.parse(text).id;
}

async function createDocument(sessionValue, workspaceId) {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `pkm_session=${sessionValue}` },
    body: JSON.stringify({
      path: 'existing.md',
      content: '---\ntype: Note\n---\n\nExisting note for export.',
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Create document failed: ${res.status} ${text}`);
}

function listDownloadFiles(downloadPath) {
  try {
    return fs.readdirSync(downloadPath).filter((f) => f.endsWith('.json') && !f.endsWith('.crdownload'));
  } catch {
    return [];
  }
}

async function waitForDownload(downloadPath, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const files = listDownloadFiles(downloadPath);
    if (files.length > 0) return path.join(downloadPath, files[0]);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

async function main() {
  const chromePath = await findChrome();
  const sessionValue = await registerUser();
  const workspaceId = await createWorkspace(sessionValue);
  await createDocument(sessionValue, workspaceId);

  const downloadPath = path.join(os.tmpdir(), `okf-ui-downloads-${Date.now()}`);
  fs.mkdirSync(downloadPath, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
    });
    await page.setCookie({
      name: 'pkm_session',
      value: sessionValue,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    });

    const okfUrl = `${BASE_URL}/workspaces/${workspaceId}/okf`;
    log(`Navigating to ${okfUrl}`);
    await page.goto(okfUrl, { waitUntil: 'networkidle2' });

    const title = await page.title();
    if (!title.includes('OKF')) {
      throw new Error(`Unexpected page title: ${title}`);
    }

    log('Clicking export');
    await page.click('button[aria-label="Export OKF bundle"]');

    const exportFile = await waitForDownload(downloadPath);
    if (!exportFile) throw new Error('Export download did not complete');

    const exportBundle = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
    if (exportBundle.okfVersion !== '0.2' && exportBundle.version !== '0.2') {
      throw new Error(`Unexpected export version: ${JSON.stringify(exportBundle.okfVersion || exportBundle.version)}`);
    }
    if (!Array.isArray(exportBundle.concepts) || exportBundle.concepts.length === 0) {
      throw new Error('Export did not return any concepts');
    }
    log(`Export downloaded to ${exportFile} with ${exportBundle.concepts.length} concept(s)`);
    fs.rmSync(exportFile);

    const importBundle = {
      okfVersion: '0.2',
      version: '0.2',
      workspace: 'OKF UI Test',
      concepts: [
        {
          path: 'imported.md',
          metadata: { type: 'Note' },
          document: { frontmatter: { type: 'Note' }, body: 'Imported via UI test.' },
        },
      ],
    };

    log('Selecting import file');
    await page.evaluate((bundle) => {
      const input = document.getElementById('okf-import');
      if (!input) throw new Error('Import file input not found');
      const file = new File([JSON.stringify(bundle)], 'import-bundle.json', { type: 'application/json' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, importBundle);

    log('Clicking import');
    await page.click('button[aria-label="Import selected OKF bundle"]');
    await page.waitForFunction(
      () => document.body.innerText.includes('Imported'),
      { timeout: 5000 }
    );

    const successText = await page.evaluate(() => {
      const el = document.querySelector('[role="status"]');
      return el ? el.textContent : '';
    });
    if (!successText || !successText.includes('Imported 1 concept')) {
      throw new Error(`Import success message not found: ${successText}`);
    }
    log(`Import succeeded: ${successText.trim()}`);
  } finally {
    await browser.close();
    try {
      fs.rmSync(downloadPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }

  log('PASSED: OKF export/import UI flow');
}

main().catch((err) => {
  console.error('[okf-ui] FAILED:', err.message);
  process.exit(1);
});
