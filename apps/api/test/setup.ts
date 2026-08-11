import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the repository root .env so tests use the same configuration as the
// package scripts regardless of the package working directory.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const baseDatabaseUrl = process.env.DATABASE_URL || 'postgresql://pkm:pkm@localhost:5432/pkm';

function databaseUrlWithName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL || databaseUrlWithName(baseDatabaseUrl, 'pkm_test');

// Create the isolated test database if it does not exist, then point all
// subsequent code at it. This prevents integration tests from truncating
// the developer's main database.
const adminUrl = databaseUrlWithName(testDatabaseUrl, 'postgres');
const adminClient = new Client({ connectionString: adminUrl });
await adminClient.connect();
try {
  const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', ['pkm_test']);
  if (exists.rowCount === 0) {
    await adminClient.query('CREATE DATABASE pkm_test');
  }
} finally {
  await adminClient.end();
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.TEST_DATABASE_URL = testDatabaseUrl;

// Start a minimal mock AI service so createDocument and ask can run without the
// real Python AI service. This keeps the test output free of connection warnings
// and provides deterministic 384-dimensional embeddings that match the schema.
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.url === '/embed' && req.method === 'POST') {
      // Return null so the API stores NULL embeddings and semantic search is
      // skipped, keeping tests deterministic without a real embedding model.
      res.writeHead(200);
      res.end(JSON.stringify({ embedding: null }));
      return;
    }
    if (req.url === '/ask' && req.method === 'POST') {
      res.writeHead(200);
      res.end(JSON.stringify({ answer: 'Mock answer based on provided notes.' }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
process.env.AI_SERVICE_URL = `http://127.0.0.1:${port}`;
