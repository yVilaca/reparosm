import { getDatabase } from '@netlify/database';

// Connect during requests, not while Next.js collects build metadata.
const database = () =>
  process.env.DATABASE_URL
    ? getDatabase({ connectionString: process.env.DATABASE_URL })
    : getDatabase();
type RecordRow = { id: string; type: string; data: string; created_at: string; updated_at: string };
const decode = (row: RecordRow) => ({ ...row, data: JSON.parse(row.data) });

export async function listRecords(type?: string) {
  const db = database();
  const rows = type
    ? await db.sql<RecordRow>`SELECT id, type, data, created_at, updated_at FROM records WHERE type = ${type} ORDER BY updated_at DESC`
    : await db.sql<RecordRow>`SELECT id, type, data, created_at, updated_at FROM records ORDER BY updated_at DESC`;
  return rows.map(decode);
}

export async function getRecord(id: string) {
  const rows = await database()
    .sql<RecordRow>`SELECT id, type, data, created_at, updated_at FROM records WHERE id = ${id}`;
  return rows[0] ? decode(rows[0]) : null;
}

export async function saveRecord(id: string, type: string, data: unknown) {
  await database()
    .sql`INSERT INTO records (id, type, data) VALUES (${id}, ${type}, ${JSON.stringify(data)})
    ON CONFLICT(id) DO UPDATE SET type = excluded.type, data = excluded.data,
    updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`;
  return { id, type, data };
}

export async function deleteRecord(id: string) {
  await database().sql`DELETE FROM records WHERE id = ${id}`;
}

export async function clearRecords() {
  await database().sql`DELETE FROM records`;
}
