import './load-env.js';
import { performance } from 'node:perf_hooks';
import { getDocument, getDocumentByPath } from '../../src/documents.js';
import { pool } from '../../src/db.js';
import { ensureWorkspace, insertNote, makeNote, printSummary, summarize } from './lib.js';

const WORD_COUNT = 100_000;
const RUNS = 50;

async function main() {
  const workspaceId = await ensureWorkspace('perf-note');
  const note = makeNote(WORD_COUNT, 1);

  const existing = await pool.query<{ id: string }>(
    'SELECT id FROM documents WHERE workspace_id = $1 AND path = $2',
    [workspaceId, note.path]
  );

  let docId: string;
  if (existing.rows.length === 0) {
    console.log(`Inserting one ${WORD_COUNT.toLocaleString()}-word note...`);
    docId = await insertNote(workspaceId, note);
  } else {
    docId = existing.rows[0].id;
    console.log(`Using existing ${WORD_COUNT.toLocaleString()}-word note ${docId}`);
  }

  console.log(`Measuring note open time over ${RUNS} runs...`);
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const doc = await getDocument(workspaceId, docId);
    const elapsed = performance.now() - start;
    if (!doc) throw new Error('document disappeared');
    times.push(elapsed);
  }

  const byIdResult = summarize(times, 200, `note open time (${WORD_COUNT.toLocaleString()} words)`);
  printSummary(byIdResult);

  // Also verify by-path lookup for the same note.
  const pathTimes: number[] = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const doc = await getDocumentByPath(workspaceId, note.path);
    const elapsed = performance.now() - start;
    if (!doc) throw new Error('document not found by path');
    pathTimes.push(elapsed);
  }

  const byPathResult = summarize(pathTimes, 200, `note open by path (${WORD_COUNT.toLocaleString()} words)`);
  printSummary(byPathResult);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
