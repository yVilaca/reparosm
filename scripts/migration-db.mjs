// Privileged database access for local/CI schema migrations only.
import pg from 'pg';
import { env } from '../lib/env.ts';

let connection;

function database() {
  if (connection) return connection;
  if (!env.databaseUrl) throw new Error('DATABASE_URL não está configurada.');
  connection = new pg.Pool({ connectionString: env.databaseUrl });
  connection.on('error', (error) => console.error('Migration database pool error', error));
  return connection;
}

export async function migrationQuery(text, params = []) {
  return (await database().query(text, params)).rows;
}

export async function migrationTransaction(fn) {
  const client = await database().connect();
  const run = async (text, params = []) => (await client.query(text, params)).rows;
  try {
    await client.query('BEGIN');
    const result = await fn(run);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closeMigrationDatabase() {
  const current = connection;
  connection = undefined;
  await current?.end();
}
