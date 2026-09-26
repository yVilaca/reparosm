import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db;
before(async () => {
  if (skip) return;
  db = await createTestDatabase({ migrate: false });
  await db.apply('0001_records');
  const legacy = [
    [
      'account-admin',
      'account',
      {
        username: 'adminreparosm',
        name: 'Administrador',
        role: 'admin',
        status: 'active',
        passwordHash: 'pbkdf2$1$aa$bb',
        createdAt: '2026-09-20T10:00:00.000Z',
        accessPolicy: 'admin-managed-v2',
      },
    ],
    [
      'account-loja',
      'account',
      {
        username: 'loja',
        name: '',
        role: 'merchant',
        status: 'weird',
        passwordHash: 'abc',
        dueDate: '31/12/2026',
        createdAt: 'garbage',
      },
    ],
    [
      'account-ok',
      'account',
      {
        username: 'ok',
        name: 'Loja OK',
        role: 'merchant',
        status: 'active',
        passwordHash: 'def',
        dueDate: '2026-12-31',
        plan: 'Anual',
      },
    ],
    ['account-broken', 'account', { name: 'sem usuário' }],
    [
      'session-raw-token',
      'session',
      { accountId: 'account-loja', expiresAt: '2030-01-01T00:00:00Z' },
    ],
    [
      'password-request-account-loja',
      'password-request',
      {
        accountId: 'account-loja',
        username: 'loja',
        status: 'pending',
        createdAt: '2026-09-21T10:00:00.000Z',
      },
    ],
    [
      'password-request-account-ghost',
      'password-request',
      { accountId: 'account-ghost', status: 'pending' },
    ],
    ['whatsapp-config-account-loja', 'whatsapp-config', { iv: 'x', cipher: 'y' }],
    [
      'order-1',
      'order',
      {
        code: 'OS-1',
        customer: 'Ana',
        phone: '(11) 99999-8888',
        device: 'iPhone',
        _accountId: 'account-loja',
        labor: '100',
        parts: 'abc',
        cost: 20,
        total: 250.5,
        pattern: [1, 'x', 5],
        quoteId: 'quote-1',
        password: '0000',
      },
    ],
    ['order-2', 'order', { code: '', customer: 'Admin', device: 'Moto' }],
    [
      'order-ghost',
      'order',
      { code: 'OS-9', customer: 'X', device: 'Y', _accountId: 'account-ghost' },
    ],
    [
      'client-1',
      'client',
      {
        name: 'Ana',
        phone: '11999998888',
        vip: true,
        birth: '1990-05-01',
        _accountId: 'account-loja',
        lastOrderId: 'stale',
      },
    ],
    [
      'client-2',
      'client',
      { name: '', phone: '', birth: '01/05/1990', _accountId: 'account-loja' },
    ],
    [
      'quote-1',
      'quote',
      {
        code: 'ORC-1',
        customer: 'Ana',
        phone: '11999998888',
        device: 'iPhone',
        service: 'Tela',
        total: '300',
        status: 'Aprovado',
        validUntil: 'amanhã',
        _accountId: 'account-loja',
      },
    ],
    [
      'shop-main',
      'shop',
      { name: 'Loja', phone: '11', instagram: '@loja', _accountId: 'account-loja' },
    ],
    ['payment-1', 'payment', { description: 'Sinal', value: 10, _accountId: 'account-loja' }],
    [
      'expense-1',
      'expense',
      { description: 'Aluguel', value: 'x', date: 'ontem', _accountId: 'account-loja' },
    ],
    [
      'part-1',
      'part',
      { name: 'Tela', stock: -2, price: '99.9', published: true, _accountId: 'account-loja' },
    ],
    [
      'message-1',
      'message',
      {
        orderId: 'order-1',
        customer: 'Ana',
        status: 'Enviado',
        sentAt: '2026-09-22T10:00:00.000Z',
        _accountId: 'account-loja',
      },
    ],
    ['message-2', 'message', { orderId: 'order-2', customer: 'Ana', _accountId: 'account-loja' }],
    [
      'film-1',
      'film',
      { brand: 'Apple', model: 'X', compatible: 'X, XS', _accountId: 'account-loja' },
    ],
    ['film-default-apple-x', 'film', { brand: 'Apple', model: 'X', compatible: 'X' }],
    [
      'automation-1',
      'automation',
      { name: 'Revisão', schedule: '30', message: 'Oi', enabled: true, _accountId: 'account-loja' },
    ],
    ['tutorial-1', 'tutorial', { title: 'Tela', url: 'https://x', _accountId: 'account-loja' }],
    ['mystery-1', 'mystery', { _accountId: 'account-loja' }],
  ];
  for (const [id, type, data] of legacy)
    await db.migrationQuery('INSERT INTO records (id, type, data) VALUES ($1, $2, $3)', [
      id,
      type,
      JSON.stringify(data),
    ]);
  await db.apply('0002_accounts');
});
after(async () => db?.drop());

async function runtimeRoleBootstrap(role) {
  const migration = await readFile(
    new URL('../netlify/database/migrations/0007_tenant_rls.sql', import.meta.url),
    'utf8',
  );
  const end = migration.indexOf('\nGRANT USAGE ON SCHEMA public');
  assert.notEqual(end, -1);
  return migration.slice(0, end).replaceAll('reparosm_runtime', role);
}

async function revokeRuntimeFromCurrentUser(role) {
  const [membership] = await db.migrationQuery(
    `SELECT EXISTS (
       SELECT 1 FROM pg_auth_members
       WHERE roleid = (SELECT oid FROM pg_roles WHERE rolname = $1)
         AND member = (SELECT oid FROM pg_roles WHERE rolname = CURRENT_USER)
     ) AS granted`,
    [role],
  );
  if (membership.granted) await db.migrationQuery(`REVOKE ${role} FROM CURRENT_USER`);
}

test('0002 copies accounts, coercing values that break the new constraints', { skip }, async () => {
  const rows = await db.migrationQuery(
    `SELECT id, username, name, role, status, plan, due_date::text AS due_date, access_policy
     FROM accounts ORDER BY id`,
  );
  assert.deepEqual(rows, [
    {
      id: 'account-admin',
      username: 'adminreparosm',
      name: 'Administrador',
      role: 'admin',
      status: 'active',
      plan: null,
      due_date: null,
      access_policy: 'admin-managed-v2',
    },
    {
      id: 'account-loja',
      username: 'loja',
      name: 'loja',
      role: 'merchant',
      status: 'suspended',
      plan: null,
      due_date: null,
      access_policy: null,
    },
    {
      id: 'account-ok',
      username: 'ok',
      name: 'Loja OK',
      role: 'merchant',
      status: 'active',
      plan: 'Anual',
      due_date: '2026-12-31',
      access_policy: null,
    },
  ]);
});

test('0002 keeps requests and settings of existing accounts only', { skip }, async () => {
  assert.deepEqual(await db.migrationQuery('SELECT account_id, status FROM password_requests'), [
    { account_id: 'account-loja', status: 'pending' },
  ]);
  assert.deepEqual(await db.migrationQuery('SELECT account_id, iv, cipher FROM whatsapp_configs'), [
    { account_id: 'account-loja', iv: 'x', cipher: 'y' },
  ]);
});

test('0002 drops raw-token sessions and only its rows from records', { skip }, async () => {
  assert.equal((await db.migrationQuery('SELECT 1 FROM sessions')).length, 0);
  assert.deepEqual(
    (await db.migrationQuery('SELECT id FROM records ORDER BY id')).map((r) => r.id),
    [
      'automation-1',
      'client-1',
      'client-2',
      'expense-1',
      'film-1',
      'film-default-apple-x',
      'message-1',
      'message-2',
      'mystery-1',
      'order-1',
      'order-2',
      'order-ghost',
      'part-1',
      'payment-1',
      'quote-1',
      'shop-main',
      'tutorial-1',
    ],
  );
});

test('0003 copies shops, clients, quotes and orders with safe conversions', { skip }, async () => {
  await db.apply('0003_core');
  assert.deepEqual(await db.migrationQuery('SELECT account_id, name, phone, profile FROM shops'), [
    { account_id: 'account-loja', name: 'Loja', phone: '11', profile: { instagram: '@loja' } },
  ]);
  assert.deepEqual(
    await db.migrationQuery('SELECT id, name, vip, birth::text AS birth FROM clients ORDER BY id'),
    [
      { id: 'client-1', name: 'Ana', vip: true, birth: '1990-05-01' },
      { id: 'client-2', name: 'Sem nome', vip: false, birth: null },
    ],
  );
  assert.deepEqual(
    await db.migrationQuery(
      `SELECT id, total::text AS total, status, valid_until, client_id FROM quotes`,
    ),
    [
      {
        id: 'quote-1',
        total: '300.00',
        status: 'Aprovado',
        valid_until: null,
        client_id: 'client-1',
      },
    ],
  );
  const orders = await db.migrationQuery(
    `SELECT id, account_id, code, labor::text AS labor, parts::text AS parts, total::text AS total,
            pattern, quote_id, client_id, device_password FROM orders ORDER BY id`,
  );
  assert.deepEqual(orders, [
    {
      id: 'order-1',
      account_id: 'account-loja',
      code: 'OS-1',
      labor: '100.00',
      parts: '0.00',
      total: '250.50',
      pattern: [1, 5],
      quote_id: 'quote-1',
      client_id: 'client-1',
      device_password: '0000',
    },
    {
      id: 'order-2',
      account_id: 'account-admin',
      code: 'OS-der-2',
      labor: '0.00',
      parts: '0.00',
      total: '0.00',
      pattern: null,
      quote_id: null,
      client_id: null,
      device_password: null,
    },
  ]);
  assert.deepEqual(
    (await db.migrationQuery('SELECT id FROM records ORDER BY id')).map((r) => r.id),
    [
      'automation-1',
      'expense-1',
      'film-1',
      'film-default-apple-x',
      'message-1',
      'message-2',
      'mystery-1',
      'part-1',
      'payment-1',
      'tutorial-1',
    ],
  );
  assert.equal(
    (await db.migrationQuery(`SELECT 1 FROM pg_proc WHERE proname LIKE 'migration_%'`)).length,
    0,
  );
});

test(
  '0004 copies inventory, cash, messages, films, automations and tutorials',
  { skip },
  async () => {
    await db.apply('0004_rest');
    assert.deepEqual(
      await db.migrationQuery('SELECT id, stock, price::text AS price, published FROM parts'),
      [{ id: 'part-1', stock: 0, price: '99.90', published: true }],
    );
    assert.deepEqual(
      await db.migrationQuery(
        'SELECT id, kind, value::text AS value, date FROM cash_entries ORDER BY id',
      ),
      [
        { id: 'expense-1', kind: 'out', value: '0.00', date: null },
        { id: 'payment-1', kind: 'in', value: '10.00', date: null },
      ],
    );
    assert.deepEqual(await db.migrationQuery('SELECT id, order_id FROM messages ORDER BY id'), [
      { id: 'message-1', order_id: 'order-1' },
      { id: 'message-2', order_id: null },
    ]);
    assert.deepEqual(
      (await db.migrationQuery('SELECT id FROM films')).map((r) => r.id),
      ['film-1'],
    );
    assert.equal((await db.migrationQuery('SELECT 1 FROM automations WHERE enabled')).length, 1);
    assert.equal((await db.migrationQuery('SELECT 1 FROM tutorials')).length, 1);
    assert.deepEqual(
      (await db.migrationQuery('SELECT id FROM records ORDER BY id')).map((r) => r.id),
      ['mystery-1'],
    );
  },
);

test('0005 drops the records table', { skip }, async () => {
  await db.apply('0005_drop_records');
  assert.deepEqual(await db.migrationQuery(`SELECT to_regclass('records') AS name`), [
    { name: null },
  ]);
});

test(
  '0006 disambiguates repeated order codes within an account and enforces uniqueness',
  { skip },
  async () => {
    await db.migrationQuery(
      `INSERT INTO accounts (id, username, name, role, status, password_hash)
       VALUES ('account-dup-a', 'dup-a', 'Dup A', 'merchant', 'active', 'x'),
              ('account-dup-b', 'dup-b', 'Dup B', 'merchant', 'active', 'x')`,
    );
    await db.migrationQuery(
      `INSERT INTO orders (id, account_id, code, customer, device, created_at) VALUES
         ('order-dup-1', 'account-dup-a', 'OS-1', 'Ana', 'iPhone', '2026-09-20T10:00:00Z'),
         ('order-dup-2', 'account-dup-a', 'OS-1', 'Beto', 'iPhone', '2026-09-21T10:00:00Z'),
         ('order-dup-3', 'account-dup-b', 'OS-1', 'Carla', 'Android', '2026-09-20T10:00:00Z')`,
    );

    await db.apply('0006_order_code_sequence');

    assert.deepEqual(
      await db.migrationQuery(
        `SELECT id, account_id, code FROM orders
         WHERE account_id IN ('account-dup-a', 'account-dup-b') ORDER BY id`,
      ),
      [
        { id: 'order-dup-1', account_id: 'account-dup-a', code: 'OS-1' },
        { id: 'order-dup-2', account_id: 'account-dup-a', code: 'OS-1-dup2' },
        { id: 'order-dup-3', account_id: 'account-dup-b', code: 'OS-1' },
      ],
    );

    await assert.rejects(
      db.migrationQuery(
        `INSERT INTO orders (id, account_id, code, customer, device)
         VALUES ('order-dup-4', 'account-dup-a', 'OS-1', 'Duda', 'iPhone')`,
      ),
    );
  },
);

test(
  '0007 rejects an existing runtime role that is a member of another role',
  { skip },
  async () => {
    const runtime = `reparosm_test_runtime_${process.pid}_${Date.now()}`;
    const parent = `${runtime}_parent`;
    const bootstrap = await runtimeRoleBootstrap(runtime);
    let runtimeCreated = false;
    let parentCreated = false;
    let parentGranted = false;

    try {
      await db.migrationQuery(
        `CREATE ROLE ${runtime} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
       NOREPLICATION NOBYPASSRLS`,
      );
      runtimeCreated = true;
      await db.migrationQuery(`CREATE ROLE ${parent} NOLOGIN`);
      parentCreated = true;
      await db.migrationQuery(`GRANT ${parent} TO ${runtime}`);
      parentGranted = true;

      await assert.rejects(db.migrationQuery(bootstrap), /must not be a member of another role/);
    } finally {
      try {
        if (parentGranted) await db.migrationQuery(`REVOKE ${parent} FROM ${runtime}`);
      } finally {
        try {
          if (runtimeCreated) {
            await revokeRuntimeFromCurrentUser(runtime);
            await db.migrationQuery(`DROP ROLE ${runtime}`);
          }
        } finally {
          if (parentCreated) await db.migrationQuery(`DROP ROLE ${parent}`);
        }
      }
    }
  },
);

test('0007 rejects an existing runtime role that owns an application table', { skip }, async () => {
  const runtime = `reparosm_test_runtime_${process.pid}_${Date.now()}`;
  const bootstrap = await runtimeRoleBootstrap(runtime);
  let runtimeCreated = false;
  let ownsShop = false;

  try {
    await db.migrationQuery(
      `CREATE ROLE ${runtime} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
       NOREPLICATION NOBYPASSRLS`,
    );
    runtimeCreated = true;
    await db.migrationQuery(`ALTER TABLE shops OWNER TO ${runtime}`);
    ownsShop = true;

    await assert.rejects(db.migrationQuery(bootstrap), /must not own application tables/);
  } finally {
    try {
      if (ownsShop) await db.migrationQuery('ALTER TABLE shops OWNER TO CURRENT_USER');
    } finally {
      if (runtimeCreated) {
        await revokeRuntimeFromCurrentUser(runtime);
        await db.migrationQuery(`DROP ROLE ${runtime}`);
      }
    }
  }
});
