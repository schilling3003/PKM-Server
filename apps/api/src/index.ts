import 'dotenv/config';
import { createClient } from 'redis';
import { performance } from 'node:perf_hooks';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { buildApp } from './app.js';
import { registerAuthRoutes } from './auth.js';

const port = Number(process.env.API_PORT || 4000);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/0';
const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function checkPostgres() {
  const start = performance.now();
  await pool.query('SELECT 1');
  return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
}

async function checkRedis(client: ReturnType<typeof createClient>) {
  const start = performance.now();
  await client.ping();
  return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
}

async function checkAi() {
  const start = performance.now();
  try {
    const res = await fetch(`${aiUrl}/health`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    console.warn({ msg: 'ai health check failed', error: String(err) });
    return { status: 'error' as const, latencyMs: Math.round(performance.now() - start), message: 'unavailable' };
  }
}

async function main() {
  const app = await buildApp();
  await registerAuthRoutes(app);
  const redisClient = createClient({ url: redisUrl });
  redisClient.on('error', (err) => app.log.warn({ msg: 'redis client error', error: err.message }));

  app.get('/health', async () => {
    const services: Record<string, { status: 'ok' | 'error'; latencyMs: number; message?: string }> = {};
    try { services.postgres = await checkPostgres(); } catch (err) { app.log.warn({ msg: 'postgres health check failed', error: String(err) }); services.postgres = { status: 'error', latencyMs: 0, message: 'unavailable' }; }
    try { services.redis = await checkRedis(redisClient); } catch (err) { app.log.warn({ msg: 'redis health check failed', error: String(err) }); services.redis = { status: 'error', latencyMs: 0, message: 'unavailable' }; }
    services.ai = await checkAi();

    const degraded = Object.values(services).some((s) => s.status !== 'ok');
    return {
      status: degraded ? 'degraded' : 'ok',
      services,
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
