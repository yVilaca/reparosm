import assert from 'node:assert/strict';
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
  ];
  for (const [id, type, data] of legacy)
    await db.query('INSERT INTO records (id, type, data) VALUES ($1, $2, $3)', [
      id,
      type,
      JSON.stringify(data),
    ]);
  await db.apply('0002_accounts');
});
after(async () => db?.drop());

test('0002 copies accounts, coercing values that break the new constraints', { skip }, async () => {
  const rows = await db.query(
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
  assert.deepEqual(await db.query('SELECT account_id, status FROM password_requests'), [
    { account_id: 'account-loja', status: 'pending' },
  ]);
  assert.deepEqual(await db.query('SELECT account_id, iv, cipher FROM whatsapp_configs'), [
    { account_id: 'account-loja', iv: 'x', cipher: 'y' },
  ]);
});

test('0002 drops raw-token sessions and only its rows from records', { skip }, async () => {
  assert.equal((await db.query('SELECT 1 FROM sessions')).length, 0);
  assert.deepEqual(
    (await db.query('SELECT id FROM records ORDER BY id')).map((r) => r.id),
    [
      'client-1',
      'client-2',
      'order-1',
      'order-2',
      'order-ghost',
      'payment-1',
      'quote-1',
      'shop-main',
    ],
  );
});

test('0003 copies shops, clients, quotes and orders with safe conversions', { skip }, async () => {
  await db.apply('0003_core');
  assert.deepEqual(await db.query('SELECT account_id, name, phone, profile FROM shops'), [
    { account_id: 'account-loja', name: 'Loja', phone: '11', profile: { instagram: '@loja' } },
  ]);
  assert.deepEqual(
    await db.query('SELECT id, name, vip, birth::text AS birth FROM clients ORDER BY id'),
    [
      { id: 'client-1', name: 'Ana', vip: true, birth: '1990-05-01' },
      { id: 'client-2', name: 'Sem nome', vip: false, birth: null },
    ],
  );
  assert.deepEqual(
    await db.query(`SELECT id, total::text AS total, status, valid_until, client_id FROM quotes`),
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
  const orders = await db.query(
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
    (await db.query('SELECT id FROM records ORDER BY id')).map((r) => r.id),
    ['payment-1'],
  );
  assert.equal(
    (await db.query(`SELECT 1 FROM pg_proc WHERE proname LIKE 'migration_%'`)).length,
    0,
  );
});
