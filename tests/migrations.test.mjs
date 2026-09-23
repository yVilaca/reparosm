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
      { code: 'OS-1', customer: 'Ana', device: 'iPhone', _accountId: 'account-loja' },
    ],
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

test('0002 drops raw-token sessions and moved rows from records', { skip }, async () => {
  assert.equal((await db.query('SELECT 1 FROM sessions')).length, 0);
  assert.deepEqual(
    (await db.query('SELECT id FROM records ORDER BY id')).map((r) => r.id),
    ['order-1'],
  );
});
