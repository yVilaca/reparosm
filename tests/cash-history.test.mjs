import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, cash;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-hist', 'hist', 'Hist', 'merchant', 'active', 'x')`,
  );
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total)
     VALUES ('order-hist', 'account-hist', 'OS-9', 'Ana', 'iPhone', 350)`,
  );
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date, order_id)
     VALUES ('hist-1', 'account-hist', 'in', 'OS-9', 350, 'Pix', DATE '2026-03-31', 'order-hist'),
            ('hist-2', 'account-hist', 'out', 'Aluguel', 900, 'Boleto', DATE '2026-03-02', NULL),
            ('hist-3', 'account-hist', 'in', 'Antigo', 70, 'Pix', DATE '2026-02-15', NULL)`,
  );
  cash = await import('../lib/repos/cash.ts');
});
after(async () => db?.drop());

test('returns only the entries of the chosen period', { skip }, async () => {
  const rows = await cash.history('account-hist', 'today', '2026-03-31');
  assert.deepEqual(
    rows.map((row) => row.id),
    ['hist-1'],
  );
  const month = await cash.history('account-hist', 'month', '2026-03-31');
  assert.deepEqual(month.map((row) => row.id).sort(), ['hist-1', 'hist-2']);
  const previous = await cash.history('account-hist', 'previous-month', '2026-03-31');
  assert.deepEqual(
    previous.map((row) => row.id),
    ['hist-3'],
  );
});

test('carries the originating order when there is one', { skip }, async () => {
  const [row] = await cash.history('account-hist', 'today', '2026-03-31');
  assert.deepEqual(row.order, { id: 'order-hist', code: 'OS-9' });
  const [expense] = await cash.history('account-hist', 'previous-month', '2026-03-31');
  assert.equal(expense.order, null);
});

test('keeps the free-text reference in the filtered history', { skip }, async () => {
  await db.migrationQuery(`UPDATE cash_entries SET reference = 'Balcão' WHERE id = 'hist-1'`);
  const [row] = await cash.history('account-hist', 'today', '2026-03-31');
  assert.equal(row.reference, 'Balcão');
});
