import { env } from 'cloudflare:workers';
import { schemaStatements } from '@/db/schema';

type RuntimeEnv = { DB: D1Database };
const database = () => (env as unknown as RuntimeEnv).DB;

export async function ensureDatabase() {
  const db = database();
  await db.batch(schemaStatements.map((sql) => db.prepare(sql)));
  return db;
}

export async function listRecords(type?: string) {
  const db = await ensureDatabase();
  const query = type
    ? db.prepare('SELECT id, type, data, created_at, updated_at FROM records WHERE type = ? ORDER BY updated_at DESC').bind(type)
    : db.prepare('SELECT id, type, data, created_at, updated_at FROM records ORDER BY updated_at DESC');
  const result = await query.all();
  return result.results.map((row) => ({ ...row, data: JSON.parse(String(row.data)) }));
}

export async function getRecord(id: string) {
  const db = await ensureDatabase();
  const row = await db.prepare('SELECT id, type, data, created_at, updated_at FROM records WHERE id = ?').bind(id).first();
  return row ? { ...row, data: JSON.parse(String(row.data)) } : null;
}

export async function saveRecord(id: string, type: string, data: unknown) {
  const db = await ensureDatabase();
  await db.prepare(`INSERT INTO records (id, type, data) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET type = excluded.type, data = excluded.data, updated_at = CURRENT_TIMESTAMP`)
    .bind(id, type, JSON.stringify(data)).run();
  return { id, type, data };
}

export async function deleteRecord(id: string) {
  const db = await ensureDatabase();
  await db.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
}

export async function clearRecords() {
  const db = await ensureDatabase();
  await db.prepare('DELETE FROM records').run();
}
