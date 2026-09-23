import { getDatabase, type DatabaseConnection } from '@netlify/database';
import type { DataObject, RecordData, RecordType, StoredRecord } from '@/lib/types';

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

type RecordRow = {
  id: string;
  type: string;
  data: string;
  created_at: string;
  updated_at: string;
};

const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decode = (row: RecordRow): StoredRecord => {
  const data = JSON.parse(row.data) as unknown;
  if (!isObject(data)) throw new Error(`Registro ${row.id} contém dados inválidos.`);
  return {
    id: row.id,
    type: row.type as RecordType,
    data: data as RecordData[RecordType],
    created_at: row.created_at,
    updated_at: row.updated_at,
  } as StoredRecord;
};

const recordColumns = 'SELECT id, type, data, created_at, updated_at FROM records';

export async function listRecords(type?: string): Promise<StoredRecord[]> {
  const rows = type
    ? await query<RecordRow>(`${recordColumns} WHERE type = $1 ORDER BY updated_at DESC`, [type])
    : await query<RecordRow>(`${recordColumns} ORDER BY updated_at DESC`);
  return rows.map(decode);
}

export async function getRecord(id: string): Promise<StoredRecord | null> {
  const [row] = await query<RecordRow>(`${recordColumns} WHERE id = $1`, [id]);
  return row ? decode(row) : null;
}

export async function saveRecord<T extends RecordType>(
  id: string,
  type: T,
  data: RecordData[T],
): Promise<StoredRecord<T>>;
export async function saveRecord(id: string, type: string, data: unknown): Promise<StoredRecord>;
export async function saveRecord(id: string, type: string, data: unknown): Promise<StoredRecord> {
  await query(
    `INSERT INTO records (id, type, data) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET type = excluded.type, data = excluded.data,
     updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`,
    [id, type, JSON.stringify(data)],
  );
  return { id, type: type as RecordType, data: data as RecordData[RecordType] } as StoredRecord;
}

export async function deleteRecord(id: string) {
  await query('DELETE FROM records WHERE id = $1', [id]);
}
