import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL || 'postgresql://pkm:pkm@localhost:5432/pkm';

export const pool = new Pool({ connectionString: databaseUrl, max: 10 });

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected Postgres pool error', err);
});

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export async function transaction<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
