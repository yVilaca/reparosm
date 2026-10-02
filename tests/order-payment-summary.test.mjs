import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, orders;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-pay', 'pay', 'Pay', 'merchant', 'active', 'x')`,
  );
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total, stage)
     VALUES ('order-paid', 'account-pay', 'OS-1', 'Ana', 'iPhone', 350, 'Retirada'),
            ('order-unpaid', 'account-pay', 'OS-2', 'Bruno', 'Moto', 200, 'Em reparo')`,
  );
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date, order_id)
     VALUES ('payment-1', 'account-pay', 'in', 'OS-1', 350, 'Pix', DATE '2026-03-10', 'order-paid')`,
  );
  orders = await import('../lib/repos/orders.ts');
});
after(async () => db?.drop());

test('exposes the linked payment as a read-only summary', { skip }, async () => {
  const record = await orders.get('account-pay', 'order-paid');
  assert.deepEqual(record.data.payment, {
    id: 'payment-1',
    value: 350,
    method: 'Pix',
    date: '2026-03-10',
  });
});

test('reports no payment for an unpaid order', { skip }, async () => {
  const record = await orders.get('account-pay', 'order-unpaid');
  assert.equal(record.data.payment, null);
});

// Review Focus: a condição kind = 'in' precisa estar no ON, não no WHERE —
// no WHERE o LEFT JOIN vira INNER e some com toda OS não paga da listagem.
test('keeps unpaid orders in the list', { skip }, async () => {
  const ids = (await orders.list('account-pay')).map((record) => record.id);
  assert.deepEqual(ids.sort(), ['order-paid', 'order-unpaid']);
});
