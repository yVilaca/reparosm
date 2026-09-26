// Applies netlify/database/migrations/*.sql in order to DATABASE_URL (local development and CI).
// Production migrations are applied by Netlify on deploy; never point this at production.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { closeMigrationDatabase, migrationQuery, migrationTransaction } from './migration-db.mjs';
import { env } from '../lib/env.ts';

const directory = new URL('../netlify/database/migrations/', import.meta.url);

export async function migrate() {
  await migrationQuery(`CREATE TABLE IF NOT EXISTS local_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = new Set(
    (await migrationQuery('SELECT name FROM local_migrations')).map((r) => r.name),
  );
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  const ran = [];
  for (const file of files) {
    const name = file.replace(/\.sql$/, '');
    if (applied.has(name)) continue;
    const sql = await readFile(new URL(file, directory), 'utf8');
    await migrationTransaction(async (run) => {
      await run(sql);
      await run('INSERT INTO local_migrations (name) VALUES ($1)', [name]);
    });
    ran.push(name);
  }
  return ran;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!env.databaseUrl) {
    console.error('Defina DATABASE_URL apontando para o Postgres local.');
    process.exit(1);
  }
  const ran = await migrate();
  await closeMigrationDatabase();
  console.log(ran.length ? `Aplicadas: ${ran.join(', ')}` : 'Nenhuma migração pendente.');
}
