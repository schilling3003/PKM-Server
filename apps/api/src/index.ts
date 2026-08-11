import './env.js';
import { createClient } from 'redis';
import { performance } from 'node:perf_hooks';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { buildApp } from './app.js';
import { registerAuthRoutes } from './auth.js';
import { registerAttachmentRoutes } from './attachments.js';
import { registerGraphRoutes } from './graph.js';

const port = Number(process.env.API_PORT || 4000);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/0';
const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const s3Url = process.env.S3_ENDPOINT || 'http://localhost:9000';

async function withTimeout<T>(label: string, promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);
}

async function checkPostgres() {
  const start = performance.now();
  await withTimeout('postgres', pool.query('SELECT 1'), 5_000);
  return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
}

async function checkRedis() {
  const start = performance.now();
  const testClient = createClient({ url: redisUrl });
  testClient.on('error', () => {});
  try {
    await withTimeout('redis', testClient.connect(), 5_000);
    await withTimeout('redis', testClient.ping(), 5_000);
    return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    throw err;
  } finally {
    testClient.disconnect().catch(() => {});
  }
}

async function checkAi() {
  const start = performance.now();
  try {
    const res = await fetch(`${aiUrl}/health`, { headers: aiHeaders(), signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    console.warn({ msg: 'ai health check failed', error: String(err) });
    return { status: 'error' as const, latencyMs: Math.round(performance.now() - start), message: 'unavailable' };
  }
}

async function checkMinIO() {
  const start = performance.now();
  try {
    const res = await fetch(`${s3Url}/minio/health/live`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    console.warn({ msg: 'minio health check failed', error: String(err) });
    return { status: 'error' as const, latencyMs: Math.round(performance.now() - start), message: 'unavailable' };
  }
}

function aiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const key = process.env.AI_SERVICE_API_KEY;
  if (key) headers['X-API-Key'] = key;
  return headers;
}

async function main() {
  const app = await buildApp();
  const redisClient = createClient({ url: redisUrl });
  redisClient.on('error', (err) => app.log.warn({ msg: 'redis client error', error: err.message }));

  await registerAuthRoutes(app, { redisClient });
  await registerAttachmentRoutes(app);
  await registerGraphRoutes(app);

  app.get('/health', async () => {
    const services: { status: 'ok' | 'error' }[] = [];
    try { services.push(await checkPostgres()); } catch (err) { app.log.warn({ msg: 'postgres health check failed', error: String(err) }); services.push({ status: 'error' }); }
    try { services.push(await checkRedis()); } catch (err) { app.log.warn({ msg: 'redis health check failed', error: String(err) }); services.push({ status: 'error' }); }
    services.push(await checkAi());
    services.push(await checkMinIO());

    const degraded = services.some((s) => s.status !== 'ok');
    return {
      status: degraded ? 'degraded' : 'ok',
      version: '0.1.0',
    };
  });

  await redisClient.connect();
  await migrate(pool);
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
