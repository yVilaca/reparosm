import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db;
before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.query('CREATE TABLE notes (id text PRIMARY KEY, body text NOT NULL)');
});
after(async () => db?.drop());

test('migrations leave one table per entity and no records table', { skip }, async () => {
  const tables = (
    await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> 'notes' ORDER BY table_name`,
    )
  ).map((row) => row.table_name);
  assert.deepEqual(tables, [
    'accounts',
    'automations',
    'cash_entries',
    'clients',
    'films',
    'local_migrations',
    'login_failures',
    'messages',
    'orders',
    'parts',
    'password_requests',
    'quotes',
    'sessions',
    'shops',
    'tutorials',
    'whatsapp_configs',
  ]);
});

test('query binds parameters', { skip }, async () => {
  await db.query('INSERT INTO notes (id, body) VALUES ($1, $2)', ['a', "it's safe"]);
  assert.deepEqual(await db.query('SELECT body FROM notes WHERE id = $1', ['a']), [
    { body: "it's safe" },
  ]);
});

test('transaction rolls back every statement on error', { skip }, async () => {
  await assert.rejects(
    db.transaction(async (run) => {
      await run(`INSERT INTO notes (id, body) VALUES ('x', 'lost')`);
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.deepEqual(await db.query(`SELECT 1 FROM notes WHERE id = 'x'`), []);
});

test('transaction commits and returns the callback result', { skip }, async () => {
  const result = await db.transaction(async (run) => {
    await run(`INSERT INTO notes (id, body) VALUES ('y', 'kept')`);
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal((await db.query(`SELECT 1 FROM notes WHERE id = 'y'`)).length, 1);
});
