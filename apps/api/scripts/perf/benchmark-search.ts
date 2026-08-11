import './load-env.js';
import { performance } from 'node:perf_hooks';
import { fullTextSearch } from '../../src/search.js';
import { pool } from '../../src/db.js';
import {
  bulkInsertDocuments,
  ensureWorkspace,
  printSummary,
  SEARCH_TERMS,
  summarize,
} from './lib.js';

const DEFAULT_COUNT = 10_000;
const DEFAULT_QUERIES = 100;

function parseArgs() {
  const countArg = process.argv.find((a) => a.startsWith('--count='));
  const queryArg = process.argv.find((a) => a.startsWith('--queries='));
  const cleanup = !process.argv.includes('--no-cleanup');
  return {
    count: countArg ? Number(countArg.split('=')[1]) : DEFAULT_COUNT,
    queries: queryArg ? Number(queryArg.split('=')[1]) : DEFAULT_QUERIES,
    cleanup,
  };
}

async function main() {
  const { count, queries, cleanup } = parseArgs();
  const workspaceId = await ensureWorkspace('perf-search');

  const existing = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM documents WHERE workspace_id = $1 AND path LIKE 'perf-note-%'",
    [workspaceId]
  );
  const existingCount = existing.rows[0].count;

  if (cleanup && existingCount > 0) {
    console.log(`Cleaning up ${existingCount} existing perf notes...`);
    await pool.query(
      "DELETE FROM documents WHERE workspace_id = $1 AND path LIKE 'perf-note-%'",
      [workspaceId]
    );
  }

  const toInsert = cleanup ? count : Math.max(0, count - existingCount);
  if (toInsert > 0) {
    console.log(`Inserting ${toInsert} generated notes...`);
    await bulkInsertDocuments(workspaceId, toInsert, 80, cleanup ? 0 : existingCount);
  }

  console.log(`Warming up full-text search...`);
  await fullTextSearch(workspaceId, SEARCH_TERMS[0], 20);

  const times: number[] = [];
  for (let i = 0; i < queries; i++) {
    const term = SEARCH_TERMS[i % SEARCH_TERMS.length];
    const start = performance.now();
    const rows = await fullTextSearch(workspaceId, term, 20);
    const elapsed = performance.now() - start;
    times.push(elapsed);
    if (i % 10 === 0) {
      console.log(`query ${i} (${term}): ${rows.length} results in ${elapsed.toFixed(2)} ms`);
    }
  }

  const result = summarize(times, 150, 'full-text search p95');
  printSummary(result);

  if (cleanup) {
    await pool.query(
      "DELETE FROM documents WHERE workspace_id = $1 AND path LIKE 'perf-note-%'",
      [workspaceId]
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
