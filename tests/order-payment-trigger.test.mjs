import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, saveOrder;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-trigger', 'trigger', 'Trigger', 'merchant', 'active', 'x')`,
  );
  ({ saveOrder } = await import('../lib/orders.ts'));
});
after(async () => db?.drop());

const base = { customer: 'Ana', device: 'iPhone', labor: 350, parts: 0, total: 350 };
const save = (id, data) => saveOrder('account-trigger', id, { ...base, ...data });

test('asks for payment when the order becomes Concluído', { skip }, async () => {
  await save('order-t1', { stage: 'Em reparo' });
  const result = await save('order-t1', { stage: 'Retirada', status: 'Concluído' });
  assert.deepEqual(result.paymentDue, { orderId: 'order-t1', total: 350 });
});

test('asks for payment when a new API order starts as Concluído', { skip }, async () => {
  const result = await save('order-t-direct', { stage: 'Retirada', status: 'Concluído' });
  assert.deepEqual(result.paymentDue, { orderId: 'order-t-direct', total: 350 });
});

test('does not ask again while it stays Concluído', { skip }, async () => {
  const result = await save('order-t1', { stage: 'Retirada', status: 'Concluído' });
  assert.equal(result.paymentDue, null);
});

test('does not ask when the total is zero', { skip }, async () => {
  await save('order-t2', { stage: 'Em reparo', labor: 0, total: 0 });
  const result = await save('order-t2', {
    stage: 'Retirada',
    status: 'Concluído',
    labor: 0,
    total: 0,
  });
  assert.equal(result.paymentDue, null);
});

test('does not ask when a payment is already linked', { skip }, async () => {
  await save('order-t3', { stage: 'Em reparo' });
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, order_id)
     VALUES ('payment-t3', 'account-trigger', 'in', 'OS', 350, 'order-t3')`,
  );
  const result = await save('order-t3', { stage: 'Retirada', status: 'Concluído' });
  assert.equal(result.paymentDue, null);
});

// Regressão: a comparação usava a etapa crua do cliente, então salvar sem o
// campo disparava transição onde não houve nenhuma.
test('treats a missing stage as no transition', { skip }, async () => {
  await save('order-t4', { stage: 'Recebido' });
  const result = await save('order-t4', { stage: undefined });
  assert.equal(result.paymentDue, null);
  assert.equal(result.notification, null);
});
