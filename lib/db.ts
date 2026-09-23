import { getDatabase, type DatabaseConnection } from '@netlify/database';

export type Row = Record<string, unknown>;
export type Query = <R extends Row = Row>(text: string, params?: unknown[]) => Promise<R[]>;

// getDatabase() builds a new pool on every call, so keep one connection per server instance.
// Connect lazily: Next.js imports this module while collecting build metadata.
let connection: DatabaseConnection | undefined;
const database = () => {
  if (connection) return connection;
  connection = process.env.DATABASE_URL
    ? getDatabase({ connectionString: process.env.DATABASE_URL })
    : getDatabase();
  // An idle pooled client can drop (e.g. a frozen function); don't let that crash the process.
  connection.pool.on('error', (error: Error) => console.error('Database pool error', error));
  return connection;
};

/** Runs one parameterized statement (`$1`, `$2`…) and returns its rows. */
export const query: Query = async <R extends Row>(text: string, params: unknown[] = []) => {
  const db = database();
  if (db.driver === 'serverless') return (await db.httpClient.query(text, params)) as R[];
  return (await db.pool.query(text, params)).rows as R[];
};

/** Runs `fn` inside BEGIN/COMMIT on a single connection; any error rolls everything back. */
export async function transaction<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  const client = await database().pool.connect();
  const run: Query = async <R extends Row>(text: string, params: unknown[] = []) =>
    (await client.query(text, params)).rows as R[];
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

/** Closes the pool so scripts and tests can exit. */
export async function closeDatabase() {
  const current = connection;
  connection = undefined;
  await current?.pool.end();
}
