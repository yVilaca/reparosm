import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db,
  orderRoute,
  clientRoute,
  quoteRoute,
  publicQuoteRoute,
  shopRoute,
  partRoute,
  payableRoute,
  A,
  B;

async function merchant(username) {
  const { sessionCookie } = await import('./support/session.mjs');
  const id = `account-${username}`;
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ($1, $2, $2, 'merchant', 'active')`,
    [id, username],
  );
  return { id, cookie: await sessionCookie(db, username, id) };
}

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  orderRoute = await import('../app/api/orders/route.ts');
  clientRoute = await import('../app/api/clients/route.ts');
  quoteRoute = await import('../app/api/quotes/route.ts');
  shopRoute = await import('../app/api/shops/route.ts');
  partRoute = await import('../app/api/parts/route.ts');
  payableRoute = await import('../app/api/payables/route.ts');
  publicQuoteRoute = await import('../app/api/public/quote/route.ts');
  A = await merchant('resource-flows');
  B = await merchant('resource-flows-other');
});

after(async () => db?.drop());

test('a quick sale goes directly to received without creating an order', { skip }, async () => {
  const payments = await import('../app/api/payments/route.ts');
  const receipts = await import('../lib/repos/receivable-orders.ts');
  const response = await payments.POST(
    request('payments', A, 'POST', {
      data: {
        description: 'Película balcão',
        value: 35,
        method: 'Pix',
        date: '2026-10-04',
      },
    }),
  );
  assert.equal(response.status, 201);
  const { record } = await response.json();
  const sale = (await receipts.received(A.id, '2026-10-01')).find((row) => row.id === record.id);
  assert.equal(sale.customer, 'Película balcão');
  assert.equal(sale.orderId, null);
  assert.equal(sale.value, 35);
  assert.equal(sale.method, 'Pix');
  assert.equal(sale.date, '2026-10-04');
  assert.ok(!(await receipts.received(B.id, '2026-10-01')).some((row) => row.id === record.id));
  const removed = await payments.DELETE(request('payments', A, 'DELETE', null, record.id));
  assert.equal(removed.status, 200);
  assert.ok(!(await receipts.received(A.id, '2026-10-01')).some((row) => row.id === record.id));
});

const request = (path, who, method, body, id) =>
  new Request(`https://test.local/api/${path}${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
    method,
    headers: {
      origin: 'https://test.local',
      cookie: who?.cookie || '',
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const order = (extra = {}) => ({
  code: 'OS-FLOW-1',
  customer: 'Ana Souza',
  phone: '(11) 99999-8888',
  device: 'iPhone 13',
  labor: 100,
  parts: 150,
  cost: 80,
  total: 250,
  stage: 'Recebido',
  status: 'Aberto',
  pattern: [1, 2, 3],
  password: '1234',
  ...extra,
});

const answer = (id, status, extra = {}) =>
  publicQuoteRoute.POST(
    new Request('https://test.local/api/public/quote', {
      method: 'POST',
      body: JSON.stringify({ id, status, ...extra }),
    }),
  );

test('orders use resource routes to create and reuse a client by phone', { skip }, async () => {
  const firstResponse = await orderRoute.POST(request('orders', A, 'POST', { data: order() }));
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 201);
  assert.equal(first.record.data.profit, 170);
  assert.equal(first.client.data.name, 'Ana Souza');
  assert.equal(first.client.data.automatic, true);

  // The client still sends the same code it always did; the server must ignore it and
  // assign its own, so two orders can never collide on the same display code.
  const secondResponse = await orderRoute.POST(
    request('orders', A, 'POST', {
      data: order({ customer: 'Ana S.' }),
    }),
  );
  const second = await secondResponse.json();
  const clients = await (await clientRoute.GET(request('clients', A, 'GET'))).json();

  assert.equal(secondResponse.status, 201);
  assert.notEqual(second.record.data.code, first.record.data.code);
  assert.equal(clients.records.length, 1);
  assert.equal(clients.records[0].data.name, 'Ana S.');
  assert.equal(second.client.id, clients.records[0].id);
  assert.deepEqual(clients.records[0].data.lastOrderId, second.record.id);
});

test('orders keep the selected stock products as sale snapshots', { skip }, async () => {
  const partResponse = await partRoute.POST(
    request('parts', A, 'POST', {
      data: { name: 'Tela OLED', stock: 4, cost: 80, price: 180, published: true },
    }),
  );
  const part = await partResponse.json();
  assert.equal(partResponse.status, 201);

  const createdResponse = await orderRoute.POST(
    request('orders', A, 'POST', {
      data: order({
        customer: 'Produto Cliente',
        phone: '11911112222',
        items: [{ partId: part.record.id, quantity: 2, name: 'valor ignorado', unitPrice: 1 }],
      }),
    }),
  );
  const created = await createdResponse.json();
  assert.equal(createdResponse.status, 201);
  assert.equal(created.record.data.parts, 360);
  assert.deepEqual(created.record.data.items, [
    { partId: part.record.id, name: 'Tela OLED', quantity: 2, unitPrice: 180, unitCost: 80 },
  ]);
});

test('paying a payable creates one linked cash outflow', { skip }, async () => {
  const createdResponse = await payableRoute.POST(
    request('payables', A, 'POST', {
      data: {
        description: 'Compra de componentes',
        supplier: 'Fornecedor A',
        category: 'Material',
        source: 'purchase',
        amount: 245.5,
        dueDate: '2026-10-05',
      },
    }),
  );
  const created = await createdResponse.json();
  assert.equal(createdResponse.status, 201);

  const paidResponse = await payableRoute.PATCH(
    request('payables', A, 'PATCH', { id: created.record.id, method: 'Pix' }),
  );
  const paid = await paidResponse.json();
  assert.equal(paidResponse.status, 200);
  assert.equal(paid.record.data.status, 'paid');
  const [cash] = await db.migrationQuery(
    `SELECT kind, value::text AS value, method FROM cash_entries
     WHERE account_id = $1 AND description = 'Compra de componentes'`,
    [A.id],
  );
  assert.deepEqual(cash, { kind: 'out', value: '245.50', method: 'Pix' });
});

test(
  'recurring accounts keep one open occurrence and create the next only after payment',
  { skip },
  async () => {
    const data = {
      description: 'Aluguel recorrente',
      source: 'fixed',
      recurrence: 'monthly',
      amount: 900,
      dueDate: '2027-01-31',
    };
    const createdResponse = await payableRoute.POST(request('payables', A, 'POST', { data }));
    assert.equal(createdResponse.status, 201);
    const { record } = await createdResponse.json();
    assert.equal(record.data.recurrence, 'monthly');
    const count = async () =>
      db.migrationQuery(
        'SELECT status, due_date::text AS due_date FROM payables WHERE account_id = $1 AND description = $2 ORDER BY due_date',
        [A.id, data.description],
      );
    assert.deepEqual(await count(), [{ status: 'pending', due_date: '2027-01-31' }]);
    const cashCount = async () =>
      (
        await db.migrationQuery(
          'SELECT count(*)::int AS count FROM cash_entries WHERE account_id = $1 AND description = $2',
          [A.id, data.description],
        )
      )[0].count;
    assert.equal(await cashCount(), 0);
    const denied = await payableRoute.PATCH(
      request('payables', B, 'PATCH', { id: record.id, method: 'Pix' }),
    );
    assert.equal(denied.status, 403);
    const responses = await Promise.all(
      [1, 2].map(() =>
        payableRoute.PATCH(request('payables', A, 'PATCH', { id: record.id, method: 'Pix' })),
      ),
    );
    assert.ok(responses.every((response) => response.status === 200));
    const answers = await Promise.all(responses.map((response) => response.json()));
    const next = answers.find((answer) => answer.nextRecord).nextRecord;
    assert.equal(next.data.dueDate, '2027-02-28');
    assert.equal(next.data.recurrence, 'monthly');
    assert.equal(next.data.status, 'pending');
    assert.equal(await cashCount(), 1);
    assert.deepEqual(await count(), [
      { status: 'paid', due_date: '2027-01-31' },
      { status: 'pending', due_date: '2027-02-28' },
    ]);
    // Updating the amount keeps the original day (31), even during February.
    const edit = await payableRoute.POST(
      request('payables', A, 'POST', { id: next.id, data: { ...next.data, amount: 950 } }),
    );
    assert.equal(edit.status, 201);
    const paidNext = await (
      await payableRoute.PATCH(request('payables', A, 'PATCH', { id: next.id, method: 'Pix' }))
    ).json();
    assert.equal(paidNext.nextRecord.data.dueDate, '2027-03-31');
    assert.equal(paidNext.nextRecord.data.amount, 950);
    // Stop repeating on the current open account without affecting payment history.
    const stop = await payableRoute.POST(
      request('payables', A, 'POST', {
        id: paidNext.nextRecord.id,
        data: { ...paidNext.nextRecord.data, recurrence: undefined },
      }),
    );
    assert.equal(stop.status, 201);
    const last = await payableRoute.PATCH(
      request('payables', A, 'PATCH', { id: paidNext.nextRecord.id, method: 'Pix' }),
    );
    assert.equal(last.status, 200);
    assert.equal((await last.json()).nextRecord, undefined);
    assert.equal((await count()).length, 3);
    assert.equal(await cashCount(), 3);
  },
);

test('payables reject invalid recurrence configuration and dates', { skip }, async () => {
  for (const extra of [
    { recurrence: 'daily' },
    { source: 'purchase', recurrence: 'monthly' },
    { recurrence: 'monthly', dueDate: '' },
    { dueDate: '2026-02-31' },
    { recurrence: 'monthly', dueDate: '9999-12-31' },
  ]) {
    const response = await payableRoute.POST(
      request('payables', A, 'POST', {
        data: {
          description: 'Inválida',
          amount: 50,
          source: 'fixed',
          dueDate: '2026-10-03',
          ...extra,
        },
      }),
    );
    assert.equal(response.status, 400);
  }
});

test(
  'orders snapshot the shop warranty and the server records the delivery date',
  { skip },
  async () => {
    const { todayInSaoPaulo } = await import('../lib/warranty.ts');
    const shopResponse = await shopRoute.POST(
      request('shops', A, 'POST', {
        data: { name: 'Loja A', phone: '11911112222', warranty: '30 dias' },
      }),
    );
    assert.equal(shopResponse.status, 201);

    const createdResponse = await orderRoute.POST(
      request('orders', A, 'POST', {
        data: order({
          customer: 'Warranty Client',
          phone: '11333334444',
          deliveredAt: '2000-01-01',
        }),
      }),
    );
    const created = await createdResponse.json();
    assert.equal(createdResponse.status, 201);
    assert.equal(created.record.data.warrantyDays, 30);
    assert.equal(created.record.data.deliveredAt, undefined);

    const deliveredResponse = await orderRoute.POST(
      request('orders', A, 'POST', {
        id: created.record.id,
        data: { ...created.record.data, stage: 'Concluído', deliveredAt: '2000-01-01' },
      }),
    );
    const delivered = await deliveredResponse.json();
    assert.equal(deliveredResponse.status, 201);
    assert.equal(delivered.record.data.deliveredAt, todayInSaoPaulo());

    await shopRoute.POST(
      request('shops', A, 'POST', {
        data: { name: 'Loja A', phone: '11911112222', warranty: '180 dias' },
      }),
    );
    const editedResponse = await orderRoute.POST(
      request('orders', A, 'POST', {
        id: created.record.id,
        data: { ...delivered.record.data, notes: 'Revisado' },
      }),
    );
    const edited = await editedResponse.json();
    assert.equal(edited.record.data.warrantyDays, 30);
    assert.equal(edited.record.data.deliveredAt, delivered.record.data.deliveredAt);

    // The UI sends warrantyDays: 0 when the field is cleared; that must not 400
    // and discard the rest of the edit — it should fall back to the shop default.
    const clearedResponse = await orderRoute.POST(
      request('orders', A, 'POST', {
        id: created.record.id,
        data: { ...edited.record.data, warrantyDays: 0, notes: 'Garantia limpa' },
      }),
    );
    const cleared = await clearedResponse.json();
    assert.equal(clearedResponse.status, 201);
    assert.equal(cleared.record.data.notes, 'Garantia limpa');
    assert.equal(cleared.record.data.warrantyDays, 180);
  },
);

test(
  'public quote approval creates one linked order when answered concurrently',
  { skip },
  async () => {
    assert.equal((await answer('', 'Aprovado')).status, 400);
    const quoteResponse = await quoteRoute.POST(
      request('quotes', A, 'POST', {
        data: {
          code: 'ORC-FLOW-1',
          customer: 'Bruno',
          phone: '11988887777',
          device: 'Galaxy S22',
          service: 'Troca de tela',
          labor: 100,
          parts: 200,
          status: 'Aguardando',
        },
      }),
    );
    const quote = await quoteResponse.json();
    assert.equal(quoteResponse.status, 201);
    assert.equal(quote.record.data.total, 300);

    const publicView = await (
      await publicQuoteRoute.GET(
        new Request(`https://test.local/api/public/quote?id=${quote.record.id}`),
      )
    ).json();
    assert.equal(publicView.record.data.total, 300);
    assert.equal(publicView.record.data.phone, undefined);

    const results = await Promise.all([
      answer(quote.record.id, 'Aprovado', { accountId: B.id }),
      answer(quote.record.id, 'Aprovado'),
    ]);
    const statuses = results.map((result) => result.status).sort();
    const accepted = results.find((result) => result.status === 200);
    assert.ok(
      accepted,
      JSON.stringify({
        statuses,
        responses: await Promise.all(results.map((result) => result.clone().json())),
      }),
    );
    const orderId = (await accepted.json()).orderId;
    const orders = await (await orderRoute.GET(request('orders', A, 'GET'))).json();
    const otherOrders = await (await orderRoute.GET(request('orders', B, 'GET'))).json();
    const quotes = await (await quoteRoute.GET(request('quotes', A, 'GET'))).json();
    const createdOrder = orders.records.find((record) => record.id === orderId);
    const answeredQuote = quotes.records.find((record) => record.id === quote.record.id);

    assert.deepEqual(statuses, [200, 409]);
    assert.equal(createdOrder.data.quoteId, quote.record.id);
    assert.equal(createdOrder.data.quoteCode, 'ORC-FLOW-1');
    assert.equal(createdOrder.data.total, 300);
    assert.ok(createdOrder.data.clientId);
    assert.equal(otherOrders.records.length, 0);
    assert.equal(answeredQuote.data.status, 'Aprovado');
    assert.equal(answeredQuote.data.orderId, orderId);
    assert.ok(answeredQuote.data.answeredAt);
  },
);

test(
  'public quote approval fails if another tenant already owns its fallback order ID',
  { skip },
  async () => {
    const quoteResponse = await quoteRoute.POST(
      request('quotes', A, 'POST', {
        data: {
          customer: 'Carla',
          phone: '11977776666',
          device: 'Moto G',
          service: 'Conector de carga',
          labor: 80,
          parts: 40,
          status: 'Aguardando',
        },
      }),
    );
    const quote = await quoteResponse.json();
    const fallbackOrderId = `order-from-${quote.record.id}`;
    const conflictResponse = await orderRoute.POST(
      request('orders', B, 'POST', {
        id: fallbackOrderId,
        data: order({ customer: 'Cliente da loja B' }),
      }),
    );

    assert.equal(quoteResponse.status, 201);
    assert.equal(conflictResponse.status, 201);
    const [counterBefore] = await db.migrationQuery(
      `SELECT COALESCE((SELECT next_seq FROM order_code_counters WHERE account_id = $1), 0)
       AS next_seq`,
      [A.id],
    );
    assert.equal((await answer(quote.record.id, 'Aprovado')).status, 409);

    const [otherOrder] = (
      await (await orderRoute.GET(request('orders', B, 'GET'))).json()
    ).records.filter((record) => record.id === fallbackOrderId);
    const [stillWaiting] = (
      await (await quoteRoute.GET(request('quotes', A, 'GET'))).json()
    ).records.filter((record) => record.id === quote.record.id);
    const [counterAfter] = await db.migrationQuery(
      `SELECT COALESCE((SELECT next_seq FROM order_code_counters WHERE account_id = $1), 0)
       AS next_seq`,
      [A.id],
    );
    assert.equal(otherOrder.data.customer, 'Cliente da loja B');
    assert.equal(stillWaiting.data.status, 'Aguardando');
    assert.equal(counterAfter.next_seq, counterBefore.next_seq);
  },
);
