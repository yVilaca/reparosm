import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, cash;

const order = (id, code, total, stage, status = 'Aberto') =>
  db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total, stage, status)
     VALUES ($1, 'account-rec', $2, 'Ana', 'iPhone', $3, $4, $5)`,
    [id, code, total, stage, status],
  );
const paid = (id, orderId, value) =>
  db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, order_id)
     VALUES ($1, 'account-rec', 'in', 'OS', $2, $3)`,
    [id, value, orderId],
  );

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ('account-rec', 'rec', 'Rec', 'merchant', 'active')`,
  );
  await order('order-ready', 'OS-1', 350, 'Retirada', 'Concluído');
  await order('order-done-early', 'OS-8', 120, 'Teste final', 'Concluído');
  await order('order-working', 'OS-2', 200, 'Em reparo');
  await order('order-free', 'OS-3', 0, 'Retirada');
  await order('order-cancelled', 'OS-4', 180, 'Retirada', 'Cancelado');
  await order('order-divergent', 'OS-5', 400, 'Retirada');
  await paid('payment-divergent', 'order-divergent', 350);
  await order('order-overpaid', 'OS-6', 100, 'Retirada');
  await paid('payment-overpaid', 'order-overpaid', 100.01);
  await order('order-cancelled-paid', 'OS-7', 250, 'Retirada', 'Cancelado');
  await paid('payment-cancelled', 'order-cancelled-paid', 250);
  cash = await import('../lib/repos/cash.ts');
});
after(async () => db?.drop());

// A cobrança dispara na conclusão: OS concluída e não paga está pronta para
// cobrar em qualquer etapa; o que ainda está em serviço é a previsão.
test('splits receivables into completed and still in service', { skip }, async () => {
  const result = await cash.receivables('account-rec');
  assert.equal(result.ready.orders, 2);
  assert.equal(result.ready.amount, 470);
  assert.deepEqual(result.ready.list.map((item) => item.code).sort(), ['OS-1', 'OS-8']);
  assert.equal(result.inProgress.orders, 1);
  assert.equal(result.inProgress.amount, 200);
});

test(
  'lists all unpaid orders with an amount to collect, including work in progress',
  { skip },
  async () => {
    const result = await cash.receivables('account-rec');
    assert.equal(result.pending.orders, 3);
    assert.equal(result.pending.amount, 670);
    assert.deepEqual(result.pending.list.map((item) => item.code).sort(), ['OS-1', 'OS-2', 'OS-8']);
    const working = result.pending.list.find((item) => item.code === 'OS-2');
    assert.equal(working.status, 'Aberto');
    assert.equal(working.device, 'iPhone');
  },
);

// Review Focus: a diferença é de 1 centavo; comparar em float no JavaScript
// erraria.
test('separates directional differences without netting them', { skip }, async () => {
  const result = await cash.review('account-rec');
  assert.equal(result.divergent.orders, 2);
  assert.equal(result.divergent.toCollect, 50);
  assert.equal(result.divergent.overpaid, 0.01);
});

test('lists a cancelled order that holds a payment', { skip }, async () => {
  const result = await cash.review('account-rec');
  assert.equal(result.cancelledPaid.orders, 1);
  assert.equal(result.cancelledPaid.amount, 250);
});
