import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, auth, payment, cookie;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  auth = await import('../app/api/auth/route.ts');
  payment = await import('../app/api/orders/[orderId]/payment/route.ts');
  const login = await auth.POST(
    new Request('https://test.local/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://test.local' },
      body: JSON.stringify({
        action: 'login',
        username: 'adminreparosm',
        password: 'TestAdminPassword123',
      }),
    }),
  );
  cookie = login.headers.get('set-cookie').split(';')[0];
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total, stage)
     VALUES ('order-ep-1', 'account-admin', 'OS-1', 'Ana', 'iPhone', 350, 'Retirada'),
            ('order-ep-free', 'account-admin', 'OS-2', 'Bruno', 'Moto', 0, 'Retirada'),
            ('order-ep-method', 'account-admin', 'OS-3', 'Carla', 'Samsung', 220, 'Retirada'),
            ('order-ep-race', 'account-admin', 'OS-4', 'Diego', 'Motorola', 480, 'Retirada')`,
  );
});
after(async () => db?.drop());

const charge = (orderId, body = {}) =>
  payment.POST(
    new Request(`https://test.local/api/orders/${orderId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://test.local', cookie },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orderId }) },
  );

test('records the order total, ignoring any value sent by the client', { skip }, async () => {
  const response = await charge('order-ep-1', { method: 'Pix', date: '2026-03-10', value: 10 });
  assert.equal(response.status, 201);
  const { payment: saved } = await response.json();
  assert.equal(saved.value, 350);
  assert.equal(saved.method, 'Pix');
});

test('answers 409 when the order already has a payment', { skip }, async () => {
  const response = await charge('order-ep-1', { method: 'Dinheiro' });
  assert.equal(response.status, 409);
});

test('requires a payment method', { skip }, async () => {
  assert.equal((await charge('order-ep-method', {})).status, 400);
});

test('turns simultaneous confirmations into one success and one conflict', { skip }, async () => {
  const responses = await Promise.all([
    charge('order-ep-race', { method: 'Pix' }),
    charge('order-ep-race', { method: 'Dinheiro' }),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort((a, b) => a - b),
    [201, 409],
  );
});

test('refuses an order with no value', { skip }, async () => {
  assert.equal((await charge('order-ep-free', { method: 'Pix' })).status, 400);
});

test('answers 404 for an order outside the account', { skip }, async () => {
  assert.equal((await charge('order-does-not-exist', { method: 'Pix' })).status, 404);
});

// A proteção do vínculo é por omissão: order_id não existe em cashColumns,
// então o CRUD genérico não consegue nem criar nem apagar o vínculo.
test('the generic payment CRUD can neither forge nor clear the link', { skip }, async () => {
  const payments = await import('../app/api/payments/route.ts');
  const post = (body) =>
    payments.POST(
      new Request('https://test.local/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'https://test.local', cookie },
        body: JSON.stringify(body),
      }),
    );

  // Não forja: um orderId no payload é ignorado.
  const created = await post({
    data: { description: 'Avulso', value: 10, orderId: 'order-ep-1' },
  });
  const { record } = await created.json();
  const [forged] = await db.migrationQuery(`SELECT order_id FROM cash_entries WHERE id = $1`, [
    record.id,
  ]);
  assert.equal(forged.order_id, null);

  // Não apaga: editar o recebimento vinculado preserva order_id.
  const [linked] = await db.migrationQuery(
    `SELECT id FROM cash_entries WHERE order_id = 'order-ep-1'`,
  );
  await post({ id: linked.id, data: { description: 'Editado', value: 350 } });
  const [kept] = await db.migrationQuery(`SELECT order_id FROM cash_entries WHERE id = $1`, [
    linked.id,
  ]);
  assert.equal(kept.order_id, 'order-ep-1');
});
