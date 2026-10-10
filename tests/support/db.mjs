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

// Any fixed key: every test process takes it on the same base database.
const RUNTIME_ROLE_LOCK = 72_610;

/**
 * Roles are cluster-wide while each test file migrates its own database in
 * parallel. On a fresh cluster (CI), the first files raced to create
 * reparosm_runtime and collided on the catalog's unique index. Create the role
 * and the migrator's membership once, under a lock, before any migration; then
 * migration 0007 finds them and skips, as it does on a real database.
 */
async function ensureRuntimeRole(admin) {
  const exists = async (client) =>
    (await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'reparosm_runtime'`)).rows.length >
    0;
  if (await exists(admin)) return;
  const lock = await admin.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [RUNTIME_ROLE_LOCK]);
    if (await exists(lock)) return;
    await lock.query(
      `CREATE ROLE reparosm_runtime
         NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await lock.query('GRANT reparosm_runtime TO CURRENT_USER WITH SET TRUE');
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [RUNTIME_ROLE_LOCK]).catch(() => {});
    lock.release();
  }
}

export async function createTestDatabase({ migrate: runMigrations = true } = {}) {
  const base = process.env.DATABASE_URL;
  const name = `reparosm_test_${process.pid}_${Date.now()}`;
  const admin = new pg.Pool({ connectionString: base });
  await ensureRuntimeRole(admin);
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
