import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, orderRoute, clientRoute, quoteRoute, publicQuoteRoute, A, B;

async function merchant(username) {
  const { createSession } = await import('../lib/repos/sessions.ts');
  const id = `account-${username}`;
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ($1, $2, $2, 'merchant', 'active', 'unused')`,
    [id, username],
  );
  return { id, cookie: `reparosm_session=${await createSession(username, id)}` };
}

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  orderRoute = await import('../app/api/orders/route.ts');
  clientRoute = await import('../app/api/clients/route.ts');
  quoteRoute = await import('../app/api/quotes/route.ts');
  publicQuoteRoute = await import('../app/api/public/quote/route.ts');
  A = await merchant('resource-flows');
  B = await merchant('resource-flows-other');
});

after(async () => db?.drop());

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
