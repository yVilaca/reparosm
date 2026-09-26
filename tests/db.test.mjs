import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db;
before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery('CREATE TABLE notes (id text PRIMARY KEY, body text NOT NULL)');
  await db.migrationQuery('GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO reparosm_runtime');
});
after(async () => db?.drop());

test('migrations leave one table per entity and no records table', { skip }, async () => {
  const tables = (
    await db.migrationQuery(
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

test('application queries run as the restricted database role', { skip }, async () => {
  const [identity] = await db.query('SELECT current_user');
  assert.equal(identity.current_user, 'reparosm_runtime');
});

test(
  'tenant context is transaction-local and cannot leak into a later query',
  { skip },
  async () => {
    const [scoped] = await db.tenantQuery(
      'rls-a',
      "SELECT current_setting('app.account_id', true) AS account_id, current_user",
    );
    assert.deepEqual(scoped, { account_id: 'rls-a', current_user: 'reparosm_runtime' });

    const [afterCommit] = await db.query(
      "SELECT COALESCE(NULLIF(current_setting('app.account_id', true), ''), 'none') AS account_id",
    );
    assert.equal(afterCommit.account_id, 'none');
  },
);

test('tenant context resets when its transaction rolls back', { skip }, async () => {
  let transactionPid;
  await assert.rejects(
    db.tenantTransaction('rls-rollback', async (run) => {
      const [beforeRollback] = await run(
        `SELECT pg_backend_pid() AS pid,
                current_setting('app.account_id', true) AS account_id,
                current_user`,
      );
      transactionPid = beforeRollback.pid;
      assert.equal(beforeRollback.account_id, 'rls-rollback');
      assert.equal(beforeRollback.current_user, 'reparosm_runtime');
      throw new Error('rollback scoped transaction');
    }),
    /rollback scoped transaction/,
  );

  const [afterRollback] = await db.query(
    `SELECT pg_backend_pid() AS pid,
            COALESCE(NULLIF(current_setting('app.account_id', true), ''), 'none') AS account_id,
            current_user`,
  );
  assert.equal(afterRollback.pid, transactionPid);
  assert.equal(afterRollback.account_id, 'none');
  assert.equal(afterRollback.current_user, 'reparosm_runtime');
});

test(
  'RLS isolates tenant rows and rejects writes without the matching account context',
  { skip },
  async () => {
    await db.migrationQuery(
      `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('rls-a', 'rls-a', 'RLS A', 'merchant', 'active', 'test'),
            ('rls-b', 'rls-b', 'RLS B', 'merchant', 'active', 'test')`,
    );
    await db.migrationQuery(
      `INSERT INTO parts (id, account_id, name, stock, published)
     VALUES ('rls-part-a', 'rls-a', 'A', 2, true), ('rls-part-b', 'rls-b', 'B', 3, true)`,
    );

    const visible = await db.tenantTransaction('rls-a', (run) =>
      run('SELECT id FROM parts ORDER BY id'),
    );
    assert.deepEqual(visible, [{ id: 'rls-part-a' }]);

    const withoutContext = await db.transaction((run) =>
      run("SELECT id FROM parts WHERE id = 'rls-part-a'"),
    );
    assert.deepEqual(withoutContext, []);

    const crossTenantUpdate = await db.tenantTransaction('rls-a', (run) =>
      run("UPDATE parts SET name = 'stolen' WHERE id = 'rls-part-b' RETURNING id"),
    );
    assert.deepEqual(crossTenantUpdate, []);

    await assert.rejects(
      db.tenantTransaction('rls-a', (run) =>
        run(
          `INSERT INTO parts (id, account_id, name) VALUES ('rls-cross-write', 'rls-b', 'invalid')`,
        ),
      ),
      { code: '42501' },
    );
  },
);

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
    `SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolcanlogin, rolinherit
     FROM pg_roles WHERE rolname = 'reparosm_runtime'`,
  );
  assert.deepEqual(role, {
    rolsuper: false,
    rolbypassrls: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolreplication: false,
    rolcanlogin: false,
    rolinherit: false,
  });
  const [membership] = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_auth_members m
       JOIN pg_roles granted ON granted.oid = m.roleid
       JOIN pg_roles grantee ON grantee.oid = m.member
       WHERE granted.rolname = 'reparosm_runtime' AND grantee.rolname = session_user
     ) AS granted`,
  );
  assert.equal(membership.granted, true);

  const [identity] = await db.transaction((run) => run('SELECT current_user'));
  assert.equal(identity.current_user, 'reparosm_runtime');
});

test(
  'public-store and quote policies reveal only their explicit capability',
  { skip },
  async () => {
    await db.migrationQuery(
      `INSERT INTO shops (account_id, name) VALUES ('rls-a', 'Loja A'), ('rls-b', 'Loja B')`,
    );
    await db.migrationQuery(
      `INSERT INTO parts (id, account_id, name, stock, published)
     VALUES ('rls-hidden', 'rls-a', 'Hidden', 1, false),
            ('rls-sold', 'rls-a', 'Sold', 0, true)`,
    );
    await db.migrationQuery(
      `INSERT INTO quotes (id, account_id, customer, device, service)
     VALUES ('rls-quote-a', 'rls-a', 'A', 'Device A', 'Repair'),
            ('rls-quote-b', 'rls-b', 'B', 'Device B', 'Repair')`,
    );

    const storefront = await db.publicStoreTransaction('rls-a', async (run) => ({
      shops: await run('SELECT account_id FROM shops ORDER BY account_id'),
      parts: await run('SELECT id FROM parts ORDER BY id'),
    }));
    assert.deepEqual(storefront.shops, [{ account_id: 'rls-a' }]);
    assert.deepEqual(storefront.parts, [{ id: 'rls-part-a' }]);

    const quote = await db.publicQuoteTransaction('rls-quote-b', (run) =>
      run('SELECT id FROM quotes ORDER BY id'),
    );
    assert.deepEqual(quote, [{ id: 'rls-quote-b' }]);
  },
);
