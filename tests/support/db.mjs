// Gives each test file its own throwaway database with every migration applied.
import { getDatabase } from '@netlify/database';

export const hasDatabase = Boolean(process.env.DATABASE_URL);
export const skipWithoutDatabase = hasDatabase
  ? false
  : 'DATABASE_URL não definido: testes de banco ignorados (o CI sempre os executa).';

export async function createTestDatabase() {
  const base = process.env.DATABASE_URL;
  const name = `reparosm_test_${process.pid}_${Date.now()}`;
  const admin = getDatabase({ connectionString: base });
  await admin.pool.query(`CREATE DATABASE ${name}`);
  const url = new URL(base);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  const { migrate } = await import('../../scripts/migrate.mjs');
  const db = await import('../../lib/db.ts');
  await migrate();
  return {
    ...db,
    async drop() {
      await db.closeDatabase();
      await admin.pool.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.pool.end();
      process.env.DATABASE_URL = base;
    },
  };
}
