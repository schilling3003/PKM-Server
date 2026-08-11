import http from 'node:http';

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
