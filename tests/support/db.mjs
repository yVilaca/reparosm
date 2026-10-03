// Gives each test file its own throwaway database with every migration applied.
import pg from 'pg';

// lib/env.ts prefers DATABASE_URL_UNPOOLED over DATABASE_URL. Left set (e.g.
// after `vercel env pull`), app code under test would bypass the throwaway
// database below and write to whatever real database it points at.
delete process.env.DATABASE_URL_UNPOOLED;

export const hasDatabase = Boolean(process.env.DATABASE_URL);
export const skipWithoutDatabase = hasDatabase
  ? false
  : 'DATABASE_URL não definido: testes de banco ignorados (o CI sempre os executa).';

export async function createTestDatabase({ migrate: runMigrations = true } = {}) {
  const base = process.env.DATABASE_URL;
  const name = `reparosm_test_${process.pid}_${Date.now()}`;
  const admin = new pg.Pool({ connectionString: base });
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(base);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  const { migrate } = await import('../../scripts/migrate.mjs');
  const migrationDb = await import('../../scripts/migration-db.mjs');
  const db = await import('../../lib/db.ts');
  if (runMigrations) await migrate();
  return {
    ...db,
    migrationQuery: migrationDb.migrationQuery,
    migrationTransaction: migrationDb.migrationTransaction,
    /** Applies one migration file by name, e.g. '0002_accounts'. */
    async apply(name) {
      const { readFile } = await import('node:fs/promises');
      await migrationDb.migrationQuery(
        await readFile(
          new URL(`../../netlify/database/migrations/${name}.sql`, import.meta.url),
          'utf8',
        ),
      );
    },
    async drop() {
      await db.closeDatabase();
      await migrationDb.closeMigrationDatabase();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
      process.env.DATABASE_URL = base;
    },
  };
}
