import { getDatabase } from '@netlify/database';
import type { DataObject, RecordData, RecordType, StoredRecord } from '@/lib/types';

// Connect during requests, not while Next.js collects build metadata.
const database = () =>
  process.env.DATABASE_URL
    ? getDatabase({ connectionString: process.env.DATABASE_URL })
    : getDatabase();
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

export async function listRecords(type?: string): Promise<StoredRecord[]> {
  const db = database();
  const rows = type
    ? await db.sql<RecordRow>`SELECT id, type, data, created_at, updated_at FROM records WHERE type = ${type} ORDER BY updated_at DESC`
    : await db.sql<RecordRow>`SELECT id, type, data, created_at, updated_at FROM records ORDER BY updated_at DESC`;
  return rows.map(decode);
}

export async function getRecord(id: string): Promise<StoredRecord | null> {
  const rows = await database()
    .sql<RecordRow>`SELECT id, type, data, created_at, updated_at FROM records WHERE id = ${id}`;
  return rows[0] ? decode(rows[0]) : null;
}

export async function saveRecord<T extends RecordType>(
  id: string,
  type: T,
  data: RecordData[T],
): Promise<StoredRecord<T>>;
export async function saveRecord(id: string, type: string, data: unknown): Promise<StoredRecord>;
export async function saveRecord(id: string, type: string, data: unknown): Promise<StoredRecord> {
  await database()
    .sql`INSERT INTO records (id, type, data) VALUES (${id}, ${type}, ${JSON.stringify(data)})
    ON CONFLICT(id) DO UPDATE SET type = excluded.type, data = excluded.data,
    updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`;
  return { id, type: type as RecordType, data: data as RecordData[RecordType] } as StoredRecord;
}

export async function deleteRecord(id: string) {
  await database().sql`DELETE FROM records WHERE id = ${id}`;
}

export async function clearRecords() {
  await database().sql`DELETE FROM records`;
}
