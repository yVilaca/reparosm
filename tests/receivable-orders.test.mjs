import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, repo;
const A = 'account-agenda';
const asOf = '2026-10-03';

const order = (id, { total = 100, stage = 'Em reparo', status = 'Aberto', updated = asOf } = {}) =>
  db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, phone, device, stage, status, total, updated_at)
     VALUES ($1, $2, $3, $4, '11987650000', 'iPhone 13', $5, $6, $7, ($8::date + time '15:00') AT TIME ZONE 'America/Sao_Paulo')`,
    [id, A, `OS-${id}`, `Cliente ${id}`, stage, status, total, updated],
  );

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-agenda', 'agenda', 'Agenda', 'merchant', 'active', 'x'),
            ('account-other', 'other', 'Other', 'merchant', 'active', 'x')`,
  );
  await order('charge', {
    total: 520,
    stage: 'Retirada',
    status: 'Concluído',
    updated: '2026-10-01',
  });
  await order('pickup', { total: 280, stage: 'Retirada', updated: '2026-10-02' });
  await order('bench', { total: 650, stage: 'Diagnóstico' });
  await order('paid', { total: 180, stage: 'Retirada', status: 'Concluído' });
  await order('cancelled', { total: 300, status: 'Cancelado' });
  await order('free', { total: 0, stage: 'Retirada', status: 'Concluído' });
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, stage, status, total)
     VALUES ('foreign', 'account-other', 'OS-9', 'Intruso', 'Moto', 'Retirada', 'Concluído', 999)`,
  );
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date, order_id) VALUES
       ('in-paid', $1, 'in', 'Recebimento da OS', 180, 'Pix', '2026-10-02', 'paid'),
       ('in-old', $1, 'in', 'Recebimento da OS', 75, 'Dinheiro', '2026-07-31', 'cancelled'),
       ('in-loose', $1, 'in', 'Venda avulsa', 40, 'Pix', '2026-10-02', NULL),
       ('out-bill', $1, 'out', 'Energia', 90, 'Pix', '2026-10-02', NULL)`,
    [A],
  );
  repo = await import('../lib/repos/receivable-orders.ts');
});
after(async () => db?.drop());

test('lists unpaid orders with a value, with stage, status and age', { skip }, async () => {
  const rows = await repo.open(A, asOf);
  assert.deepEqual(
    rows.map((row) => [row.id, row.total, row.stage, row.status, row.days]),
    [
      ['charge', 520, 'Retirada', 'Concluído', 2],
      ['pickup', 280, 'Retirada', 'Aberto', 1],
      ['bench', 650, 'Diagnóstico', 'Aberto', 0],
    ],
  );
  assert.equal(rows[0].phone, '11987650000');
});

test('each shop sees only its own orders and receipts', { skip }, async () => {
  assert.deepEqual(
    (await repo.open('account-other', asOf)).map((row) => row.id),
    ['foreign'],
  );
  assert.deepEqual(await repo.received('account-other', '2026-01-01'), []);
});

test('lists order receipts from the start of the window, newest first', { skip }, async () => {
  const receipts = await repo.received(A, repo.historyStart(asOf));
  assert.equal(repo.historyStart(asOf), '2026-08-01');
  assert.deepEqual(
    receipts.map((row) => [row.id, row.code, row.value, row.method, row.date]),
    [['in-paid', 'OS-paid', 180, 'Pix', '2026-10-02']],
  );
  assert.equal((await repo.received(A, '2026-07-01')).length, 2);
});
