import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ('account-link-a', 'link-a', 'Link A', 'merchant', 'active'),
            ('account-link-b', 'link-b', 'Link B', 'merchant', 'active')`,
  );
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total)
     VALUES ('order-link-1', 'account-link-a', 'OS-1', 'Ana', 'iPhone', 350),
            ('order-link-2', 'account-link-b', 'OS-1', 'Bruno', 'Moto', 200)`,
  );
});
after(async () => db?.drop());

const entry = (id, accountId, kind, orderId, value = 350) =>
  db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, order_id)
     VALUES ($1, $2, $3, 'Recebimento', $4, $5)`,
    [id, accountId, kind, value, orderId],
  );

test('links an income entry to an order of the same account', { skip }, async () => {
  await entry('payment-link-1', 'account-link-a', 'in', 'order-link-1');
  const rows = await db.migrationQuery(
    `SELECT order_id FROM cash_entries WHERE id = 'payment-link-1'`,
  );
  assert.equal(rows[0].order_id, 'order-link-1');
});

test('rejects an expense linked to an order', { skip }, async () => {
  await assert.rejects(() => entry('expense-link-1', 'account-link-a', 'out', 'order-link-1'));
});

test('rejects a link to an order from another account', { skip }, async () => {
  await assert.rejects(() => entry('payment-link-2', 'account-link-b', 'in', 'order-link-1'));
});

test('rejects a second income for the same order', { skip }, async () => {
  await assert.rejects(() => entry('payment-link-3', 'account-link-a', 'in', 'order-link-1'));
});

test('keeps the entry and clears the link when the order is deleted', { skip }, async () => {
  await db.migrationQuery(`DELETE FROM orders WHERE id = 'order-link-1'`);
  const rows = await db.migrationQuery(
    `SELECT order_id FROM cash_entries WHERE id = 'payment-link-1'`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].order_id, null);
});
