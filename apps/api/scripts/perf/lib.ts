import './load-env.js';
import { pool } from '../../src/db.js';
import { parseCanonical, serializeCanonical } from '@pkm/markdown';

export const VOCAB = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet',
  'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango',
  'uniform', 'victor', 'whiskey', 'xray', 'yankee', 'zulu', 'apple', 'banana', 'cherry', 'date',
  'elderberry', 'fig', 'grape', 'honeydew', 'kiwi', 'lemon', 'mango', 'nectarine', 'orange', 'papaya',
  'quince', 'raspberry', 'strawberry', 'tangerine', 'ugli', 'vanilla', 'watermelon', 'yam', 'zucchini',
  'amber', 'blue', 'crimson', 'denim', 'emerald', 'fuchsia', 'gold', 'hazel', 'ivory', 'jade',
  'khaki', 'lavender', 'maroon', 'navy', 'olive', 'plum', 'rose', 'silver', 'teal', 'violet',
  'azure', 'beige', 'coral', 'dusk', 'ebony', 'flax', 'grey', 'heather', 'indigo', 'jet',
  'lake', 'moss', 'nude', 'ochre', 'pearl', 'quartz', 'rust', 'sage', 'taupe', 'umber',
  'vermilion', 'wheat', 'xanadu', 'yellow', 'zaffre', 'arch', 'bridge', 'castle', 'dune', 'ember',
  'fjord', 'grove', 'harbor', 'isle', 'jetty', 'knoll', 'lagoon', 'meadow', 'oasis', 'prairie',
  'quarry', 'reef', 'summit', 'tundra', 'upland', 'valley', 'waterfall', 'woodland', 'yonder', 'zenith',
  'atom', 'beam', 'current', 'density', 'energy', 'force', 'gravity', 'heat', 'inertia', 'joule',
  'kinetic', 'light', 'mass', 'neutron', 'orbit', 'photon', 'quantum', 'radiant', 'spectrum', 'torque',
  'ultraviolet', 'vacuum', 'watt', 'xenon', 'yield', 'zinc', 'algebra', 'binary', 'calculus', 'dimension',
  'equation', 'factor', 'geometry', 'hypotenuse', 'integer', 'junction', 'kernel', 'logarithm', 'matrix', 'node',
  'origin', 'parabola', 'quaternion', 'radius', 'scalar', 'tangent', 'unit', 'vector', 'wave', 'xintercept',
  'asymptote', 'boundary', 'cluster', 'dataset', 'entropy', 'feature', 'gradient', 'heuristic', 'iteration', 'json',
  'latent', 'metric', 'normal', 'outlier', 'parameter', 'quantile', 'regression', 'sample', 'token', 'update',
  'variance', 'weight', 'xavier', 'yintercept', 'zero', 'actor', 'binder', 'compiler', 'debugger', 'exception',
  'framework', 'gateway', 'handler', 'interface', 'json', 'kernel', 'library', 'module', 'namespace', 'object',
  'protocol', 'queue', 'router', 'service', 'thread', 'utility', 'variable', 'widget', 'xml', 'yield',
  'zip', 'aggregate', 'buffer', 'cache', 'daemon', 'epoch', 'fifo', 'garbage', 'heap', 'index',
  'journal', 'key', 'latency', 'mutex', 'namespace', 'opcode', 'packet', 'query', 'record', 'schema',
  'table', 'union', 'view', 'warehouse', 'xml', 'yard', 'zone', 'absolute', 'baseline', 'cipher',
  'decimal', 'entropy', 'flag', 'glyph', 'hash', 'index', 'junction', 'key', 'link', 'map',
  'nonce', 'opcode', 'payload', 'query', 'route', 'salt', 'token', 'uuid', 'vector', 'witness',
  'x509', 'yardstick', 'zipf', 'algorithm', 'bandwidth', 'cipher', 'domain', 'endpoint', 'firewall', 'gateway',
  'host', 'ingress', 'jwt', 'keystore', 'lan', 'mesh', 'namespace', 'overlay', 'packet', 'queue',
  'replica', 'subnet', 'topology', 'upstream', 'vlan', 'wan', 'xdr', 'yield', 'zone', 'access',
];

export const SEARCH_TERMS = VOCAB.slice(0, 30);

export function generateWords(wordCount: number, seed = 0): string {
  const words: string[] = [];
  let state = seed >>> 0;
  for (let i = 0; i < wordCount; i++) {
    // LCG constants from Numerical Recipes (glibc rand)
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    words.push(VOCAB[state % VOCAB.length]);
  }
  return words.join(' ');
}

export function makeNote(wordCount: number, seed: number) {
  const title = `perf-note-${seed}`;
  const body = generateWords(wordCount, seed);
  const content = serializeCanonical({
    frontmatter: { type: 'Note', title },
    body,
  });
  const parsed = parseCanonical(content);
  return {
    title,
    body,
    content,
    hash: parsed.hash,
    path: `${title}.md`,
  };
}

export async function ensureWorkspace(name: string) {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO workspaces (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id',
    [name]
  );
  if (rows[0]) return rows[0].id;
  const { rows: existing } = await pool.query<{ id: string }>(
    'SELECT id FROM workspaces WHERE name = $1',
    [name]
  );
  return existing[0].id;
}

export async function insertNote(workspaceId: string, note: ReturnType<typeof makeNote>) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO documents (workspace_id, path, title, content, frontmatter, content_hash, search_vector)
     VALUES ($1, $2, $3, $4, $5, $6, to_tsvector('english', coalesce($3, '') || ' ' || $4))
     RETURNING id`,
    [workspaceId, note.path, note.title, note.content, JSON.stringify({ type: 'Note', title: note.title }), note.hash]
  );
  return rows[0].id;
}

export async function bulkInsertDocuments(
  workspaceId: string,
  count: number,
  wordsPerDoc: number,
  startSeed = 0
) {
  const batchSize = 500;
  for (let i = 0; i < count; i += batchSize) {
    const batch = Math.min(batchSize, count - i);
    const notes = Array.from({ length: batch }, (_, j) => makeNote(wordsPerDoc, startSeed + i + j));
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const n of notes) {
      placeholders.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, to_tsvector('english', coalesce($${p - 4}, '') || ' ' || $${p - 3}))`
      );
      values.push(workspaceId, n.path, n.title, n.content, JSON.stringify({ type: 'Note', title: n.title }), n.hash);
    }
    await pool.query(
      `INSERT INTO documents (workspace_id, path, title, content, frontmatter, content_hash, search_vector) VALUES ${placeholders.join(',')}`,
      values
    );
  }
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const k = (sorted.length - 1) * p;
  const f = Math.floor(k);
  const c = Math.ceil(k);
  if (f === c) return sorted[f];
  return sorted[f] * (c - k) + sorted[c] * (k - f);
}

export function summarize(times: number[], budgetMs: number, label: string) {
  const sorted = times.slice().sort((a, b) => a - b);
  const p95 = percentile(sorted, 0.95);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    label,
    count: sorted.length,
    min: sorted[0],
    mean: Math.round(mean * 100) / 100,
    p95: Math.round(p95 * 100) / 100,
    max: sorted[sorted.length - 1],
    budgetMs,
    pass: p95 < budgetMs,
  };
}

export function printSummary(result: ReturnType<typeof summarize>) {
  console.log(JSON.stringify(result, null, 2));
}
