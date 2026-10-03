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
    'order_items',
    'order_photos',
    'orders',
    'parts',
    'password_requests',
    'payables',
    'quotes',
    'sessions',
    'shops',
    'tutorials',
    'whatsapp_configs',
  ]);
});

test('every table with account_id forces RLS', { skip }, async () => {
  const unprotectedAccountTables = () =>
    db.migrationQuery(
      `SELECT c.relname
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'f')
         AND EXISTS (
           SELECT 1 FROM pg_attribute a
           WHERE a.attrelid = c.oid AND a.attname = 'account_id' AND NOT a.attisdropped
         )
         AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
       ORDER BY c.relname`,
    );

  assert.deepEqual(await unprotectedAccountTables(), []);

  await db.migrationQuery('CREATE TABLE p1_rls_inventory_probe (account_id text)');
  try {
    assert.deepEqual(await unprotectedAccountTables(), [{ relname: 'p1_rls_inventory_probe' }]);
  } finally {
    await db.migrationQuery('DROP TABLE p1_rls_inventory_probe');
  }
  assert.deepEqual(await unprotectedAccountTables(), []);
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

test(
  'P1 references cannot cross accounts and unlink only the foreign key column',
  { skip },
  async () => {
    await db.migrationQuery(
      `INSERT INTO accounts (id, username, name, role, status, password_hash)
       VALUES ('p1-fk-a', 'p1-fk-a', 'A', 'merchant', 'active', 'test'),
              ('p1-fk-b', 'p1-fk-b', 'B', 'merchant', 'active', 'test')`,
    );
    await db.migrationQuery(
      `INSERT INTO clients (id, account_id, name)
       VALUES ('p1-client-a', 'p1-fk-a', 'Client A'), ('p1-client-b', 'p1-fk-b', 'Client B')`,
    );
    await db.migrationQuery(
      `INSERT INTO quotes (id, account_id, client_id, customer, device, service)
       VALUES ('p1-quote-a', 'p1-fk-a', 'p1-client-a', 'A', 'Device A', 'Repair'),
              ('p1-quote-b', 'p1-fk-b', 'p1-client-b', 'B', 'Device B', 'Repair')`,
    );
    await db.migrationQuery(
      `INSERT INTO orders (id, account_id, client_id, quote_id, code, customer, device)
       VALUES ('p1-order-a', 'p1-fk-a', 'p1-client-a', 'p1-quote-a', 'OS-1', 'A', 'Device A'),
              ('p1-order-b', 'p1-fk-b', 'p1-client-b', 'p1-quote-b', 'OS-1', 'B', 'Device B')`,
    );
    await db.migrationQuery(
      `INSERT INTO messages (id, account_id, order_id)
       VALUES ('p1-message-a', 'p1-fk-a', 'p1-order-a')`,
    );

    const invalidReferences = [
      `INSERT INTO quotes (id, account_id, client_id, customer, device, service)
       VALUES ('p1-cross-quote-client', 'p1-fk-a', 'p1-client-b', 'A', 'B', 'C')`,
      `INSERT INTO orders (id, account_id, client_id, code, customer, device)
       VALUES ('p1-cross-order-client', 'p1-fk-a', 'p1-client-b', 'OS-2', 'A', 'B')`,
      `INSERT INTO orders (id, account_id, quote_id, code, customer, device)
       VALUES ('p1-cross-order-quote', 'p1-fk-a', 'p1-quote-b', 'OS-3', 'A', 'B')`,
      `INSERT INTO messages (id, account_id, order_id)
       VALUES ('p1-cross-message-order', 'p1-fk-a', 'p1-order-b')`,
    ];
    for (const sql of invalidReferences)
      await assert.rejects(db.migrationQuery(sql), { code: '23503' });

    await db.migrationQuery("DELETE FROM clients WHERE id = 'p1-client-a'");
    assert.deepEqual(
      await db.migrationQuery(
        `SELECT account_id, client_id FROM quotes WHERE id = 'p1-quote-a'
         UNION ALL
         SELECT account_id, client_id FROM orders WHERE id = 'p1-order-a'`,
      ),
      [
        { account_id: 'p1-fk-a', client_id: null },
        { account_id: 'p1-fk-a', client_id: null },
      ],
    );

    await db.migrationQuery("DELETE FROM quotes WHERE id = 'p1-quote-a'");
    assert.deepEqual(
      await db.migrationQuery("SELECT account_id, quote_id FROM orders WHERE id = 'p1-order-a'"),
      [{ account_id: 'p1-fk-a', quote_id: null }],
    );

    await db.migrationQuery("DELETE FROM orders WHERE id = 'p1-order-a'");
    assert.deepEqual(
      await db.migrationQuery(
        "SELECT account_id, order_id FROM messages WHERE id = 'p1-message-a'",
      ),
      [{ account_id: 'p1-fk-a', order_id: null }],
    );
  },
);

test('P1 auth controls force RLS and require matching scoped capabilities', { skip }, async () => {
  const tokenHashA = 'a'.repeat(64);
  const tokenHashB = 'b'.repeat(64);
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
       VALUES ('p1-auth-a', 'p1-auth-a', 'A', 'merchant', 'active', 'test'),
              ('p1-auth-b', 'p1-auth-b', 'B', 'merchant', 'active', 'test'),
              ('p1-auth-admin', 'p1-auth-admin', 'Admin', 'admin', 'active', 'test')`,
  );
  await db.migrationQuery(
    `INSERT INTO sessions (token_hash, account_id, expires_at)
       VALUES ($1, 'p1-auth-a', now() + interval '1 hour'),
              ($2, 'p1-auth-b', now() + interval '1 hour')`,
    [tokenHashA, tokenHashB],
  );
  await db.migrationQuery(
    `INSERT INTO password_requests (account_id, status) VALUES ('p1-auth-a', 'pending')`,
  );
  await db.migrationQuery(
    `INSERT INTO login_failures (username, ip)
       VALUES ('p1-auth-a', '10.2.0.1'), ('p1-auth-a', '10.2.0.2'), ('p1-auth-b', '10.2.0.1')`,
  );

  const tables = ['accounts', 'sessions', 'password_requests', 'login_failures'];
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

  for (const table of tables) assert.deepEqual(await db.query(`SELECT 1 FROM ${table}`), []);
  await assert.rejects(
    db.query(
      `INSERT INTO accounts (id, username, name, role, status, password_hash)
         VALUES ('p1-auth-unscoped', 'unscoped', 'No context', 'merchant', 'active', 'test')`,
    ),
    { code: '42501' },
  );
  await assert.rejects(
    db.query(
      `INSERT INTO sessions (token_hash, account_id, expires_at)
         VALUES ($1, 'p1-auth-a', now() + interval '1 hour')`,
      ['c'.repeat(64)],
    ),
    { code: '42501' },
  );
  await assert.rejects(
    db.query(`INSERT INTO password_requests (account_id, status) VALUES ('p1-auth-b', 'pending')`),
    { code: '42501' },
  );
  await assert.rejects(
    db.query(`INSERT INTO login_failures (username, ip) VALUES ('p1-auth-a', '10.3.0.1')`),
    { code: '42501' },
  );

  assert.deepEqual(await db.authQuery('p1-auth-a', 'SELECT id FROM accounts ORDER BY id'), [
    { id: 'p1-auth-a' },
  ]);
  await assert.rejects(
    db.authQuery('p1-auth-a', 'SELECT password_hash FROM accounts WHERE id = $1', ['p1-auth-a']),
    { code: '42501' },
  );
  assert.deepEqual(
    await db.authQuery('p1-auth-a', 'SELECT account_password_hash($1) AS hash', ['p1-auth-a']),
    [{ hash: 'test' }],
  );
  const [publicCredential] = await db.publicStoreTransaction('p1-auth-a', (run) =>
    run('SELECT account_password_hash($1) AS hash', ['p1-auth-a']),
  );
  assert.equal(publicCredential.hash, null);
  const sessionAccount = await db.sessionTransaction(tokenHashA, async (run) => {
    assert.deepEqual(await run('SELECT token_hash FROM sessions ORDER BY token_hash'), [
      { token_hash: tokenHashA },
    ]);
    const [session] = await run('SELECT account_id FROM sessions WHERE token_hash = $1', [
      tokenHashA,
    ]);
    await db.setSessionAccountContext(run, session.account_id);
    const [credential] = await run('SELECT account_password_hash($1) AS hash', ['p1-auth-a']);
    assert.equal(credential.hash, null);
    return run('SELECT id FROM accounts ORDER BY id');
  });
  assert.deepEqual(sessionAccount, [{ id: 'p1-auth-a' }]);
  await assert.rejects(
    db.sessionTransaction(tokenHashA, (run) => db.setSessionAccountContext(run, 'p1-auth-b')),
    /session account mismatch/i,
  );
  assert.deepEqual(
    await db.loginFailureQuery(
      'p1-auth-a',
      '10.2.0.1',
      'SELECT ip FROM login_failures ORDER BY ip',
    ),
    [{ ip: '10.2.0.1' }],
  );
  assert.deepEqual(
    await db.adminQuery(
      { id: 'p1-auth-admin', role: 'admin' },
      "SELECT id FROM accounts WHERE id LIKE 'p1-auth-%' ORDER BY id",
    ),
    [{ id: 'p1-auth-a' }, { id: 'p1-auth-admin' }, { id: 'p1-auth-b' }],
  );
  await assert.rejects(
    db.adminQuery({ id: 'p1-auth-a', role: 'merchant' }, 'SELECT id FROM accounts'),
    /admin actor required/i,
  );
  await assert.rejects(
    db.adminQuery({ id: 'p1-auth-a', role: 'admin' }, 'SELECT id FROM accounts'),
    /admin actor required/i,
  );

  const [after] = await db.query(
    `SELECT COALESCE(NULLIF(current_setting('app.auth_username', true), ''), 'none') AS username,
              COALESCE(NULLIF(current_setting('app.session_token_hash', true), ''), 'none') AS token_hash,
              COALESCE(NULLIF(current_setting('app.session_account_id', true), ''), 'none') AS account_id,
              COALESCE(NULLIF(current_setting('app.login_ip', true), ''), 'none') AS ip,
              COALESCE(NULLIF(current_setting('app.admin_account_id', true), ''), 'none') AS admin_id`,
  );
  assert.deepEqual(after, {
    username: 'none',
    token_hash: 'none',
    account_id: 'none',
    ip: 'none',
    admin_id: 'none',
  });
});
