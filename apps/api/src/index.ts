import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Client } from 'pg';
import { createClient } from 'redis';
import { migrate } from './migrate.js';

const port = Number(process.env.API_PORT || 4000);
const databaseUrl = process.env.DATABASE_URL || 'postgresql://pkm:pkm@localhost:5432/pkm';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/0';
const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';

const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.WEB_URL || '*' });

const pgClient = new Client({ connectionString: databaseUrl });
pgClient.on('error', (err) => app.log.warn({ msg: 'postgres client error', error: err.message }));

const redisClient = createClient({ url: redisUrl });
redisClient.on('error', (err) => app.log.warn({ msg: 'redis client error', error: err.message }));

async function checkPostgres() {
  const start = performance.now();
  await pgClient.query('SELECT 1');
  return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
}

async function checkRedis() {
  const start = performance.now();
  await redisClient.ping();
  return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
}

async function checkAi() {
  const start = performance.now();
  try {
    const res = await fetch(`${aiUrl}/health`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return { status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return { status: 'error' as const, latencyMs: Math.round(performance.now() - start), message: String(err) };
  }
}

app.get('/health', async () => {
  const services: Record<string, { status: 'ok' | 'error'; latencyMs: number; message?: string }> = {};
  try { services.postgres = await checkPostgres(); } catch (err) { services.postgres = { status: 'error', latencyMs: 0, message: String(err) }; }
  try { services.redis = await checkRedis(); } catch (err) { services.redis = { status: 'error', latencyMs: 0, message: String(err) }; }
  services.ai = await checkAi();

  const degraded = Object.values(services).some((s) => s.status !== 'ok');
  return {
    status: degraded ? 'degraded' : 'ok',
    services,
    version: '0.1.0',
  };
});

async function main() {
  await pgClient.connect();
  await redisClient.connect();
  await migrate(pgClient);
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
