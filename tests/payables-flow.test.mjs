import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { todayInSaoPaulo } from '../lib/warranty.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, payables, expenses, A, B;

async function merchant(username) {
  const { sessionCookie } = await import('./support/session.mjs');
  const id = `account-${username}`;
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ($1, $2, $2, 'merchant', 'active', 'unused')`,
    [id, username],
  );
  return { id, cookie: await sessionCookie(db, username, id) };
}

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  payables = await import('../app/api/payables/route.ts');
  expenses = await import('../app/api/expenses/route.ts');
  A = await merchant('payables-a');
  B = await merchant('payables-b');
});
after(async () => db?.drop());

const request = (path, who, method, body, id) =>
  new Request(`https://test.local/api/${path}${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
    method,
    headers: {
      origin: 'https://test.local',
      cookie: who.cookie,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const create = async (data, who = A) => {
  const response = await payables.POST(request('payables', who, 'POST', { data }));
  return { status: response.status, body: await response.json() };
};
const patch = async (body, who = A) => {
  const response = await payables.PATCH(request('payables', who, 'PATCH', body));
  return { status: response.status, body: await response.json() };
};
const rowsOf = (description) =>
  db.migrationQuery(
    `SELECT id, status, due_date::text AS due_date, amount::text AS amount
     FROM payables WHERE account_id = $1 AND description = $2 ORDER BY due_date`,
    [A.id, description],
  );
const cashOf = (description) =>
  db.migrationQuery(
    `SELECT kind, value::text AS value, method, date::text AS date FROM cash_entries
     WHERE account_id = $1 AND description LIKE $2 || '%' ORDER BY date`,
    [A.id, description],
  );

test('a purchase in installments becomes one payable per month', { skip }, async () => {
  const { status, body } = await create({
    description: 'Lote de telas',
    supplier: 'Distribuidora Tech',
    source: 'purchase',
    amount: 1000,
    dueDate: '2027-01-31',
    installments: 3,
  });
  assert.equal(status, 201);
  assert.equal(body.records.length, 3);
  assert.deepEqual(
    body.records.map((record) => [
      record.data.installmentNumber,
      record.data.installmentCount,
      record.data.amount,
      record.data.dueDate,
    ]),
    [
      [1, 3, 333.33, '2027-01-31'],
      [2, 3, 333.33, '2027-02-28'],
      [3, 3, 333.34, '2027-03-31'],
    ],
  );
  assert.equal(new Set(body.records.map((record) => record.data.seriesId)).size, 1);
});

test('rejects repeating and installments together, and repeating purchases', { skip }, async () => {
  const base = { description: 'Inválida', amount: 300, dueDate: '2026-11-10' };
  assert.equal((await create({ ...base, recurrence: 'monthly', installments: 3 })).status, 400);
  assert.equal((await create({ ...base, source: 'purchase', recurrence: 'monthly' })).status, 400);
  assert.equal((await create({ ...base, installments: 1 })).status, 400);
});

test('paying records the amount, date and method actually used', { skip }, async () => {
  const { body } = await create({
    description: 'Conta de energia',
    supplier: 'Enel',
    amount: 412.35,
    dueDate: '2026-10-01',
    paymentCode: '83690000004 12350000000 00000000000 00000000000',
  });
  const id = body.record.id;
  assert.equal(body.record.data.paymentCode, '83690000004 12350000000 00000000000 00000000000');
  const paid = await patch({
    id,
    action: 'pay',
    amount: 420.1,
    paidOn: '2026-10-02',
    method: 'Pix',
  });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.record.data.status, 'paid');
  assert.equal(paid.body.record.data.paidAmount, 420.1);
  assert.equal(paid.body.record.data.paidOn, '2026-10-02');
  assert.deepEqual(await cashOf('Conta de energia'), [
    { kind: 'out', value: '420.10', method: 'Pix', date: '2026-10-02' },
  ]);
});

test(
  'refuses a future payment date, an unknown method or a non-positive amount',
  { skip },
  async () => {
    const { body } = await create({ description: 'Internet', amount: 120, dueDate: '2026-10-10' });
    const id = body.record.id;
    const future = new Date(Date.parse(`${todayInSaoPaulo()}T12:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    assert.equal((await patch({ id, action: 'pay', method: 'Pix', paidOn: future })).status, 400);
    assert.equal((await patch({ id, action: 'pay', method: 'pix ' })).status, 400);
    assert.equal((await patch({ id, action: 'pay', method: 'Pix', amount: 0 })).status, 400);
  },
);

test('undoing a payment reopens the bill and removes the cash outflow', { skip }, async () => {
  const { body } = await create({ description: 'Contador', amount: 250, dueDate: '2026-10-05' });
  const id = body.record.id;
  await patch({ id, method: 'Dinheiro' });
  const undone = await patch({ id, action: 'undo' });
  assert.equal(undone.status, 200);
  assert.equal(undone.body.record.data.status, 'pending');
  assert.equal(undone.body.record.data.paidOn, undefined);
  assert.deepEqual(await cashOf('Contador'), []);
});

test('undoing a repeating bill also removes the next one it created', { skip }, async () => {
  const { body } = await create({
    description: 'Aluguel da loja',
    recurrence: 'monthly',
    amount: 1800,
    dueDate: '2026-10-05',
  });
  const first = body.record.id;
  const paid = await patch({ id: first, method: 'Pix' });
  assert.equal(paid.body.nextRecord.data.dueDate, '2026-11-05');
  assert.equal((await rowsOf('Aluguel da loja')).length, 2);
  assert.equal((await patch({ id: first, action: 'undo' })).status, 200);
  assert.deepEqual(
    (await rowsOf('Aluguel da loja')).map((row) => [row.status, row.due_date]),
    [['pending', '2026-10-05']],
  );
  assert.deepEqual(await cashOf('Aluguel da loja'), []);
});

test('refuses to undo when the following occurrence was already paid', { skip }, async () => {
  const { body } = await create({
    description: 'Sistema de gestão',
    recurrence: 'monthly',
    amount: 99.9,
    dueDate: '2026-08-10',
  });
  const first = body.record.id;
  const second = (await patch({ id: first, method: 'Pix' })).body.nextRecord.id;
  await patch({ id: second, method: 'Pix' });
  const refused = await patch({ id: first, action: 'undo' });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /seguinte/i);
  assert.equal((await patch({ id: second, action: 'undo' })).status, 200);
});

test('a paid bill cannot be edited until the payment is undone', { skip }, async () => {
  const { body } = await create({ description: 'Água', amount: 80, dueDate: '2026-10-08' });
  const id = body.record.id;
  await patch({ id, method: 'Pix' });
  const edit = await payables.POST(
    request('payables', A, 'POST', { id, data: { description: 'Água', amount: 1 } }),
  );
  assert.equal(edit.status, 409);
});

test('another shop cannot pay, undo or delete the bill', { skip }, async () => {
  const { body } = await create({ description: 'Privada', amount: 10, dueDate: '2026-10-08' });
  const id = body.record.id;
  assert.equal((await patch({ id, method: 'Pix' }, B)).status, 403);
  assert.equal((await patch({ id, action: 'undo' }, B)).status, 403);
  const removed = await payables.DELETE(request('payables', B, 'DELETE', null, id));
  assert.equal(removed.status, 403);
});

test('the cash tab refuses to edit or delete the outflow of a paid bill', { skip }, async () => {
  const { body } = await create({ description: 'Gás', amount: 30, dueDate: '2026-10-08' });
  await patch({ id: body.record.id, method: 'Pix' });
  const [entry] = await db.migrationQuery(
    `SELECT id FROM cash_entries WHERE account_id = $1 AND description = 'Gás'`,
    [A.id],
  );
  const removed = await expenses.DELETE(request('expenses', A, 'DELETE', null, entry.id));
  assert.equal(removed.status, 409);
  assert.match((await removed.json()).error, /Receber e pagar/);
  const edited = await expenses.POST(
    request('expenses', A, 'POST', { id: entry.id, data: { description: 'Gás', value: 1 } }),
  );
  assert.equal(edited.status, 409);
  // E o banco segura mesmo se alguém tentar por fora da API.
  await assert.rejects(() =>
    db.migrationQuery('DELETE FROM cash_entries WHERE id = $1', [entry.id]),
  );
});
