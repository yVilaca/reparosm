// Privileged database access for local/CI schema migrations only.
import { getDatabase } from '@netlify/database';
import { env } from '../lib/env.ts';

let connection;

function database() {
  if (connection) return connection;
  connection = env.databaseUrl ? getDatabase({ connectionString: env.databaseUrl }) : getDatabase();
  connection.pool.on('error', (error) => console.error('Migration database pool error', error));
  return connection;
}

export async function migrationQuery(text, params = []) {
  return (await database().pool.query(text, params)).rows;
}

export async function migrationTransaction(fn) {
  const client = await database().pool.connect();
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
  await current?.pool.end();
}
