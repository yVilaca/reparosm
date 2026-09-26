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
    'order_code_counters',
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

test('RLS isolates tenant rows and rejects writes without the matching account context', { skip }, async () => {
  await db.query(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('rls-a', 'rls-a', 'RLS A', 'merchant', 'active', 'test'),
            ('rls-b', 'rls-b', 'RLS B', 'merchant', 'active', 'test')`,
  );
  await db.query(
    `INSERT INTO parts (id, account_id, name, stock, published)
     VALUES ('rls-part-a', 'rls-a', 'A', 2, true), ('rls-part-b', 'rls-b', 'B', 3, true)`,
  );

  const visible = await db.transaction(async (run) => {
    await run('SET LOCAL ROLE reparosm_runtime');
    await run("SELECT set_config('app.account_id', 'rls-a', true)");
    return run('SELECT id FROM parts ORDER BY id');
  });
  assert.deepEqual(visible, [{ id: 'rls-part-a' }]);

  const withoutContext = await db.transaction(async (run) => {
    await run('SET LOCAL ROLE reparosm_runtime');
    return run("SELECT id FROM parts WHERE id = 'rls-part-a'");
  });
  assert.deepEqual(withoutContext, []);

  const crossTenantUpdate = await db.transaction(async (run) => {
    await run('SET LOCAL ROLE reparosm_runtime');
    await run("SELECT set_config('app.account_id', 'rls-a', true)");
    return run("UPDATE parts SET name = 'stolen' WHERE id = 'rls-part-b' RETURNING id");
  });
  assert.deepEqual(crossTenantUpdate, []);

  await assert.rejects(
    db.transaction(async (run) => {
      await run('SET LOCAL ROLE reparosm_runtime');
      await run("SELECT set_config('app.account_id', 'rls-a', true)");
      await run(
        `INSERT INTO parts (id, account_id, name) VALUES ('rls-cross-write', 'rls-b', 'invalid')`,
      );
    }),
    { code: '42501' },
  );
});

test('P0 business tables force RLS and the runtime role cannot bypass it', { skip }, async () => {
  const tables = [
    'shops',
    'clients',
    'quotes',
    'orders',
    'parts',
    'cash_entries',
    'messages',
    'films',
    'automations',
    'tutorials',
    'whatsapp_configs',
    'order_code_counters',
  ];
  const secured = await db.query(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
     ORDER BY c.relname`,
    [tables],
  );
  assert.deepEqual(
    secured.map((row) => row.relname),
    [...tables].sort(),
  );
  assert.ok(secured.every((row) => row.relrowsecurity && row.relforcerowsecurity));

  const [role] = await db.query(
    `SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
     FROM pg_roles WHERE rolname = 'reparosm_runtime'`,
  );
  assert.deepEqual(role, {
    rolsuper: false,
    rolbypassrls: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolcanlogin: false,
  });

  const [identity] = await db.transaction((run) =>
    run('SET LOCAL ROLE reparosm_runtime').then(() => run('SELECT current_user')),
  );
  assert.equal(identity.current_user, 'reparosm_runtime');
});

test('public-store and quote policies reveal only their explicit capability', { skip }, async () => {
  await db.query(
    `INSERT INTO shops (account_id, name) VALUES ('rls-a', 'Loja A'), ('rls-b', 'Loja B')`,
  );
  await db.query(
    `INSERT INTO parts (id, account_id, name, stock, published)
     VALUES ('rls-hidden', 'rls-a', 'Hidden', 1, false),
            ('rls-sold', 'rls-a', 'Sold', 0, true)`,
  );
  await db.query(
    `INSERT INTO quotes (id, account_id, customer, device, service)
     VALUES ('rls-quote-a', 'rls-a', 'A', 'Device A', 'Repair'),
            ('rls-quote-b', 'rls-b', 'B', 'Device B', 'Repair')`,
  );

  const storefront = await db.transaction(async (run) => {
    await run('SET LOCAL ROLE reparosm_runtime');
    await run("SELECT set_config('app.public_store_account_id', 'rls-a', true)");
    return {
      shops: await run('SELECT account_id FROM shops ORDER BY account_id'),
      parts: await run('SELECT id FROM parts ORDER BY id'),
    };
  });
  assert.deepEqual(storefront.shops, [{ account_id: 'rls-a' }]);
  assert.deepEqual(storefront.parts, [{ id: 'rls-part-a' }]);

  const quote = await db.transaction(async (run) => {
    await run('SET LOCAL ROLE reparosm_runtime');
    await run("SELECT set_config('app.public_quote_id', 'rls-quote-b', true)");
    return run('SELECT id FROM quotes ORDER BY id');
  });
  assert.deepEqual(quote, [{ id: 'rls-quote-b' }]);
});
