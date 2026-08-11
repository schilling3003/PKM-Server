#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const axeSource = require('axe-core').source;

const DEFAULT_PORT = process.env.PORT || 3456;
const AXE_AUDIT_URL = process.env.AXE_AUDIT_URL;
const API_URL = process.env.AXE_API_URL || 'http://localhost:3001';
const SERVE = process.env.AXE_SERVE === '1';
const PUBLIC_ONLY = process.env.AXE_PUBLIC_ONLY === '1' || SERVE;
const EMAIL = process.env.AXE_EMAIL || `axe-audit-${Date.now()}@example.com`;
const PASSWORD = process.env.AXE_PASSWORD || 'AxeAudit123!';
const REPORT_FILE = process.env.AXE_REPORT_FILE;

let baseUrl = AXE_AUDIT_URL || 'http://localhost:3000';
let webServer;
let browser;
let totalCritical = 0;
let totalSerious = 0;
const allViolations = [];

function log(...args) {
  console.log('[axe-audit]', ...args);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeout = 120000) {
  const start = Date.now();
  const parsed = new URL(url);
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(
          { hostname: parsed.hostname, port: parsed.port || 80, path: parsed.pathname || '/', timeout: 2000 },
          (res) => {
            res.resume();
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
              resolve();
            } else {
              reject(new Error(`status ${res.statusCode}`));
            }
          }
        );
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return;
    } catch {
      await wait(500);
    }
  }
  throw new Error(`Server not ready at ${url} after ${timeout}ms`);
}

async function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.platform === 'darwin') {
    const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(p)) return p;
  }
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
  throw new Error(
    'Chrome/Chromium executable not found. Set PUPPETEER_EXECUTABLE_PATH to the Chrome binary.'
  );
}

function startWebServer(port) {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  log(`Starting Next.js dev server on port ${port}...`);
  const proc = spawn('pnpm', ['--filter', '@pkm/web', 'dev'], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: 'pipe',
  });
  if (process.env.AXE_VERBOSE) {
    proc.stdout.on('data', (d) => process.stdout.write(d));
    proc.stderr.on('data', (d) => process.stderr.write(d));
  }
  return proc;
}

async function stopWebServer() {
  if (!webServer) return;
  log('Stopping Next.js dev server...');
  webServer.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => webServer.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (!webServer.killed) webServer.kill('SIGKILL');
}

async function registerUser() {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Register failed: ${res.status} ${text}`);
  }
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/pkm_session=([^;\s]+)/);
  if (!match) {
    throw new Error('No pkm_session cookie from register response');
  }
  return match[1];
}

async function createWorkspace(sessionValue) {
  const res = await fetch(`${API_URL}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `pkm_session=${sessionValue}` },
    body: JSON.stringify({ name: 'Axe Audit Workspace' }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Create workspace failed: ${res.status} ${text}`);
  }
  const body = JSON.parse(text);
  return body.id;
}

async function createDocument(sessionValue, workspaceId) {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `pkm_session=${sessionValue}` },
    body: JSON.stringify({ path: 'hello.md', content: '# Audit note\n\nA sample note for accessibility testing.' }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Create document failed: ${res.status} ${text}`);
  }
}

async function runAxe(page) {
  await page.evaluate(axeSource);
  return page.evaluate(() => {
    return new Promise((resolve, reject) => {
      window.axe.run(
        document,
        { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } },
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });
  });
}

async function auditRoute(page, route, label) {
  const url = `${baseUrl}${route}`;
  log(`Auditing ${label}: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await wait(800);
  const results = await runAxe(page);

  const serious = results.violations.filter((v) => v.impact === 'serious');
  const critical = results.violations.filter((v) => v.impact === 'critical');
  const other = results.violations.filter((v) => v.impact && v.impact !== 'serious' && v.impact !== 'critical');

  totalCritical += critical.length;
  totalSerious += serious.length;

  const violationSummary = [
    ...critical.map((v) => ({ route: label, impact: 'critical', help: v.help, id: v.id, nodes: v.nodes.length })),
    ...serious.map((v) => ({ route: label, impact: 'serious', help: v.help, id: v.id, nodes: v.nodes.length })),
    ...other.map((v) => ({ route: label, impact: v.impact, help: v.help, id: v.id, nodes: v.nodes.length })),
  ];
  allViolations.push(...violationSummary);

  for (const v of critical) {
    log(`  CRITICAL: ${v.help} (${v.nodes.length} nodes)`);
  }
  for (const v of serious) {
    const node = v.nodes[0];
    const detail = node ? `target=${node.target.join(' ')}` : '';
    log(`  SERIOUS: ${v.help} (${v.nodes.length} nodes) ${detail}`);
  }
  for (const v of other) {
    log(`  ${v.impact?.toUpperCase() || 'INFO'}: ${v.help} (${v.nodes.length} nodes)`);
  }

  if (critical.length + serious.length === 0) {
    log(`  OK: no critical or serious violations`);
  }

  return results;
}

async function main() {
  const chromePath = await findChrome();

  if (SERVE) {
    baseUrl = `http://localhost:${DEFAULT_PORT}`;
    webServer = startWebServer(DEFAULT_PORT);
    await waitForServer(`${baseUrl}/login`, 120000);
  } else {
    try {
      await waitForServer(`${baseUrl}/login`, 10000);
    } catch {
      log(`No server found at ${baseUrl}. Set AXE_AUDIT_URL or AXE_SERVE=1 to start one.`);
      process.exit(0);
    }
  }

  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  let routes;
  let publicOnly = PUBLIC_ONLY;

  if (!publicOnly) {
    try {
      const sessionValue = await registerUser();
      const workspaceId = await createWorkspace(sessionValue);
      await createDocument(sessionValue, workspaceId);
      const parsed = new URL(baseUrl);
      await page.setCookie({
        name: 'pkm_session',
        value: sessionValue,
        domain: parsed.hostname,
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      });
      routes = [
        { route: '/', label: 'workspace-list' },
        { route: `/workspaces/${workspaceId}`, label: 'editor' },
        { route: `/workspaces/${workspaceId}/attachments`, label: 'attachments' },
        { route: `/workspaces/${workspaceId}/graph`, label: 'graph' },
      ];
    } catch (e) {
      log('API setup failed, falling back to public routes:', e.message);
      publicOnly = true;
    }
  }

  if (publicOnly) {
    routes = [
      { route: '/login', label: 'login' },
      { route: '/', label: 'workspace-list-public' },
    ];
  }

  for (const { route, label } of routes) {
    await auditRoute(page, route, label);
  }

  if (browser) await browser.close();
  await stopWebServer();

  if (REPORT_FILE) {
    fs.writeFileSync(REPORT_FILE, JSON.stringify({ baseUrl, totalCritical, totalSerious, violations: allViolations }, null, 2));
  }

  if (totalCritical > 0 || totalSerious > 0) {
    log(`FAILED: ${totalCritical} critical, ${totalSerious} serious violations`);
    process.exit(1);
  }
  log('PASSED: no critical or serious violations found');
}

main().catch(async (err) => {
  console.error('[axe-audit] Error:', err);
  if (browser) await browser.close();
  await stopWebServer();
  process.exit(1);
});
