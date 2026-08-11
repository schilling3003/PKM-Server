#!/usr/bin/env node
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const urlArg = process.argv.find((a) => a.startsWith('--url='));
  const runsArg = process.argv.find((a) => a.startsWith('--runs='));
  const outputArg = process.argv.find((a) => a.startsWith('--output='));
  return {
    url: urlArg ? urlArg.split('=')[1] : 'http://localhost:3000',
    runs: runsArg ? Number(runsArg.split('=')[1]) : 3,
    output: outputArg ? outputArg.split('=')[1] : path.join(__dirname, '..', 'page-load-results.json'),
  };
}

async function runLighthouse(url, formFactor) {
  const chromeFlags = ['--headless', '--no-sandbox', '--disable-gpu'];
  if (process.env.CHROME_PATH) {
    chromeFlags.push(`--chromePath=${process.env.CHROME_PATH}`);
  }
  const chrome = await launch({ chromeFlags });
  try {
    const options = {
      logLevel: 'error',
      output: 'json',
      onlyCategories: ['performance'],
      port: chrome.port,
      ...(formFactor === 'desktop' ? { preset: 'desktop' } : {
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          disabled: false,
        },
        emulatedUserAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
      }),
    };
    const runnerResult = await lighthouse(url, options);
    if (!runnerResult || !runnerResult.lhr) {
      throw new Error('Lighthouse did not return a result');
    }
    const audits = runnerResult.lhr.audits;
    return {
      url,
      formFactor,
      firstContentfulPaintMs: audits['first-contentful-paint'].numericValue,
      largestContentfulPaintMs: audits['largest-contentful-paint'].numericValue,
      interactiveMs: audits['interactive'].numericValue,
      speedIndexMs: audits['speed-index'].numericValue,
      totalBlockingTimeMs: audits['total-blocking-time'].numericValue,
      performanceScore: Math.round((runnerResult.lhr.categories.performance.score ?? 0) * 100),
    };
  } finally {
    await chrome.kill();
  }
}

async function main() {
  const { url, runs, output } = parseArgs();

  console.log(`Benchmarking ${url} (${runs} runs each, desktop + mobile)`);
  const results = {
    url,
    runs,
    desktop: [],
    mobile: [],
  };

  for (let i = 0; i < runs; i++) {
    console.log(`  desktop run ${i + 1}/${runs}`);
    results.desktop.push(await runLighthouse(url, 'desktop'));
  }

  for (let i = 0; i < runs; i++) {
    console.log(`  mobile run ${i + 1}/${runs}`);
    results.mobile.push(await runLighthouse(url, 'mobile'));
  }

  function aggregate(runs, label, fcpBudget, lcpBudget) {
    const fcps = runs.map((r) => r.firstContentfulPaintMs).sort((a, b) => a - b);
    const lcps = runs.map((r) => r.largestContentfulPaintMs).sort((a, b) => a - b);
    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const p95 = (arr) => {
      const k = (arr.length - 1) * 0.95;
      const f = Math.floor(k);
      const c = Math.ceil(k);
      if (f === c) return arr[f];
      return arr[f] * (c - k) + arr[c] * (k - f);
    };
    return {
      label,
      fcpP95Ms: Math.round(p95(fcps)),
      fcpMeanMs: Math.round(mean(fcps)),
      fcpMinMs: Math.round(fcps[0]),
      fcpBudgetMs: fcpBudget,
      fcpPass: p95(fcps) < fcpBudget,
      lcpP95Ms: Math.round(p95(lcps)),
      lcpMeanMs: Math.round(mean(lcps)),
      lcpMinMs: Math.round(lcps[0]),
      lcpBudgetMs: lcpBudget,
      lcpPass: p95(lcps) < lcpBudget,
      runs,
    };
  }

  const summary = {
    url,
    desktop: aggregate(results.desktop, 'desktop initial page load', 2000, 2500),
    mobile: aggregate(results.mobile, 'mobile first contentful paint', 1500, 2500),
  };

  console.log(JSON.stringify(summary, null, 2));
  await fs.writeFile(output, JSON.stringify({ summary, raw: results }, null, 2), 'utf8');
  console.log(`Results written to ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
