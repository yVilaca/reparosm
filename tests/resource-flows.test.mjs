import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, orderRoute, clientRoute, quoteRoute, publicQuoteRoute, A;

async function merchant(username) {
  const { createAccount } = await import('../lib/repos/accounts.ts');
  const { createSession } = await import('../lib/repos/sessions.ts');
  const account = await createAccount({
    id: `account-${username}`,
    username,
    name: username,
    role: 'merchant',
    passwordHash: 'unused',
  });
  return { id: account.id, cookie: `reparosm_session=${await createSession(account.id)}` };
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

const answer = (id, status) =>
  publicQuoteRoute.POST(
    new Request('https://test.local/api/public/quote', {
      method: 'POST',
      body: JSON.stringify({ id, status }),
    }),
  );

test('orders use resource routes to create and reuse a client by phone', { skip }, async () => {
  const firstResponse = await orderRoute.POST(request('orders', A, 'POST', { data: order() }));
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 201);
  assert.equal(first.record.data.profit, 170);
  assert.equal(first.client.data.name, 'Ana Souza');
  assert.equal(first.client.data.automatic, true);

  const secondResponse = await orderRoute.POST(
    request('orders', A, 'POST', {
      data: order({ code: 'OS-FLOW-2', customer: 'Ana S.' }),
    }),
  );
  const second = await secondResponse.json();
  const clients = await (await clientRoute.GET(request('clients', A, 'GET'))).json();

  assert.equal(secondResponse.status, 201);
  assert.equal(clients.records.length, 1);
  assert.equal(clients.records[0].data.name, 'Ana S.');
  assert.equal(second.client.id, clients.records[0].id);
  assert.deepEqual(clients.records[0].data.lastOrderId, second.record.id);
});

test(
  'public quote approval creates one linked order when answered concurrently',
  { skip },
  async () => {
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
      answer(quote.record.id, 'Aprovado'),
      answer(quote.record.id, 'Aprovado'),
    ]);
    const statuses = results.map((result) => result.status).sort();
    const accepted = results.find((result) => result.status === 200);
    const orderId = (await accepted.json()).orderId;
    const orders = await (await orderRoute.GET(request('orders', A, 'GET'))).json();
    const quotes = await (await quoteRoute.GET(request('quotes', A, 'GET'))).json();
    const createdOrder = orders.records.find((record) => record.id === orderId);
    const answeredQuote = quotes.records.find((record) => record.id === quote.record.id);

    assert.deepEqual(statuses, [200, 409]);
    assert.equal(createdOrder.data.quoteId, quote.record.id);
    assert.equal(createdOrder.data.quoteCode, 'ORC-FLOW-1');
    assert.equal(createdOrder.data.total, 300);
    assert.ok(createdOrder.data.clientId);
    assert.equal(answeredQuote.data.status, 'Aprovado');
    assert.equal(answeredQuote.data.orderId, orderId);
    assert.ok(answeredQuote.data.answeredAt);
  },
);
