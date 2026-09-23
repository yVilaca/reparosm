import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, state, quoteRoute, A, B;

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
  state = await import('../app/api/state/route.ts');
  quoteRoute = await import('../app/api/public/quote/route.ts');
  A = await merchant('loja-a');
  B = await merchant('loja-b');
});
after(async () => db?.drop());

const base = 'https://test.local/api/state';
const headers = (who) => ({
  origin: 'https://test.local',
  cookie: who?.cookie ?? '',
  'Content-Type': 'application/json',
});
const save = async (who, type, data, id) => {
  const response = await state.POST(
    new Request(base, {
      method: 'POST',
      headers: headers(who),
      body: JSON.stringify({ type, data, id }),
    }),
  );
  return { status: response.status, body: await response.json() };
};
const list = async (who, type) =>
  (
    await (
      await state.GET(
        new Request(`${base}${type ? `?type=${type}` : ''}`, { headers: headers(who) }),
      )
    ).json()
  ).records;
const getOne = async (who, id) =>
  state.GET(new Request(`${base}?id=${encodeURIComponent(id)}`, { headers: headers(who) }));
const remove = async (who, id) =>
  state.DELETE(
    new Request(`${base}?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: headers(who),
    }),
  );
const answer = async (id, status) => {
  const response = await quoteRoute.POST(
    new Request('https://test.local/api/public/quote', {
      method: 'POST',
      body: JSON.stringify({ id, status }),
    }),
  );
  return { status: response.status, body: await response.json() };
};
const order = (extra = {}) => ({
  code: 'OS-100',
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

test(
  'saving an order creates its client and returns the record shape the app uses',
  { skip },
  async () => {
    const { status, body } = await save(A, 'order', order());
    assert.equal(status, 201);
    assert.match(body.record.id, /^order-/);
    assert.equal(body.record.data.profit, 170);
    assert.equal(body.record.data.total, 250);
    assert.deepEqual(body.record.data.pattern, [1, 2, 3]);
    assert.equal(body.record.data.password, '1234');
    assert.equal(body.client.data.name, 'Ana Souza');
    assert.equal(body.client.data.automatic, true);
    assert.equal(body.client.data.lastOrderId, body.record.id);
    assert.equal(body.notification.status, 'skipped');
  },
);

test('a second order with the same phone reuses the client', { skip }, async () => {
  const { body } = await save(
    A,
    'order',
    order({ code: 'OS-101', customer: 'Ana S.', phone: '11999998888' }),
  );
  const clients = await list(A, 'client');
  assert.equal(clients.length, 1);
  assert.equal(clients[0].data.name, 'Ana S.');
  assert.equal(clients[0].data.lastOrderCode, 'OS-101');
  assert.equal(body.client.id, clients[0].id);
});

test('accounts never see or change each other’s data', { skip }, async () => {
  const [mine] = await list(A, 'order');
  assert.deepEqual(await list(B, 'order'), []);
  assert.deepEqual(await list(B, 'client'), []);
  assert.equal((await getOne(B, mine.id)).status, 403);
  assert.equal((await save(B, 'order', order({ customer: 'Intrusa' }), mine.id)).status, 403);
  assert.equal((await remove(B, mine.id)).status, 403);
  assert.equal((await getOne(A, mine.id)).status, 200);
  assert.notEqual((await list(A, 'order')).find((o) => o.id === mine.id).data.customer, 'Intrusa');
});

test('each account keeps its own shop under the shared id', { skip }, async () => {
  assert.equal(
    (await save(A, 'shop', { name: 'Loja A', phone: '1100000000', instagram: '@a' }, 'shop-main'))
      .status,
    201,
  );
  assert.equal(
    (await save(B, 'shop', { name: 'Loja B', phone: '2100000000' }, 'shop-main')).status,
    201,
  );
  const [shopA] = await list(A, 'shop');
  assert.equal(shopA.id, 'shop-main');
  assert.equal(shopA.data.name, 'Loja A');
  assert.equal(shopA.data.instagram, '@a');
  assert.equal((await list(B, 'shop'))[0].data.name, 'Loja B');
  const vitrine = await (
    await state.GET(new Request(`${base}?public=1&type=shop&account=${A.id}`))
  ).json();
  assert.deepEqual(vitrine.records[0].data, { name: 'Loja A', phone: '1100000000' });
});

test(
  'approving a quote creates one order linked to the client, even when answered twice at once',
  { skip },
  async () => {
    const { body } = await save(A, 'quote', {
      code: 'ORC-12',
      customer: 'Bruno',
      phone: '11988887777',
      device: 'Galaxy S22',
      service: 'Troca de tela',
      labor: 100,
      parts: 200,
      status: 'Aguardando',
    });
    const quoteId = body.record.id;
    assert.equal(body.record.data.total, 300);
    const publicView = await (
      await quoteRoute.GET(new Request(`https://test.local/api/public/quote?id=${quoteId}`))
    ).json();
    assert.equal(publicView.record.data.total, 300);
    assert.equal(publicView.record.data.phone, undefined);

    const results = await Promise.all([answer(quoteId, 'Aprovado'), answer(quoteId, 'Aprovado')]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const orderId = results.find((r) => r.status === 200).body.orderId;

    const created = (await list(A, 'order')).find((o) => o.id === orderId);
    assert.equal(created.data.quoteId, quoteId);
    assert.equal(created.data.quoteCode, 'ORC-12');
    assert.equal(created.data.total, 300);
    assert.ok(created.data.clientId);
    const quote = (await list(A, 'quote')).find((q) => q.id === quoteId);
    assert.equal(quote.data.status, 'Aprovado');
    assert.equal(quote.data.orderId, orderId);
    assert.ok(quote.data.answeredAt);
  },
);

test('expired and unknown quotes are refused', { skip }, async () => {
  const { body } = await save(A, 'quote', {
    customer: 'Carla',
    phone: '11977776666',
    device: 'Moto G',
    service: 'Bateria',
    validUntil: '2020-01-01',
  });
  assert.equal((await answer(body.record.id, 'Recusado')).status, 410);
  assert.equal((await answer('quote-missing', 'Aprovado')).status, 400);
});

test('deleting a client keeps its orders', { skip }, async () => {
  const [client] = await list(A, 'client');
  assert.equal((await remove(A, client.id)).status, 200);
  const orders = await list(A, 'order');
  assert.ok(orders.length >= 2);
  assert.ok(orders.every((o) => o.data.clientId !== client.id));
});

test('payments and expenses share a table but stay separate types', { skip }, async () => {
  const payment = await save(A, 'payment', {
    description: 'Sinal',
    value: '50.5',
    date: '2026-09-23',
  });
  const expense = await save(A, 'expense', { description: 'Aluguel', value: 900, method: 'Pix' });
  assert.equal(payment.status, 201);
  assert.deepEqual(
    (await list(A, 'payment')).map((r) => [r.id, r.data.value, r.data.date]),
    [[payment.body.record.id, 50.5, '2026-09-23']],
  );
  assert.deepEqual(
    (await list(A, 'expense')).map((r) => r.id),
    [expense.body.record.id],
  );
  assert.equal(
    (await save(A, 'expense', { description: 'x', value: 1 }, payment.body.record.id)).status,
    400,
  );
  assert.deepEqual(await list(B, 'payment'), []);
  assert.equal((await remove(B, payment.body.record.id)).status, 403);
});

test(
  'parts: stock must be a whole number and the vitrine shows only published stock',
  { skip },
  async () => {
    assert.equal((await save(A, 'part', { name: 'Tela', stock: -1, price: 10 })).status, 400);
    assert.equal((await save(A, 'part', { name: 'Tela', stock: 1.5, price: 10 })).status, 400);
    await save(A, 'part', { name: 'Tela', stock: 3, cost: 80, price: 200, published: true });
    await save(A, 'part', { name: 'Oculta', stock: 3, price: 50, published: false });
    await save(A, 'part', { name: 'Esgotada', stock: 0, price: 50, published: true });
    const vitrine = await (
      await state.GET(new Request(`${base}?public=1&type=part&account=${A.id}`))
    ).json();
    assert.deepEqual(
      vitrine.records.map((r) => r.data),
      [{ name: 'Tela', price: 200, stock: 3, published: true }],
    );
  },
);

test('messages keep an order link only for the same account', { skip }, async () => {
  const [mine] = await list(A, 'order');
  const ok = await save(A, 'message', {
    orderId: mine.id,
    customer: 'Ana',
    phone: '11999998888',
    kind: 'Contato',
    message: 'Oi',
    status: 'Enviado',
    sentAt: '2026-09-23T12:00:00.000Z',
  });
  assert.equal(ok.body.record.data.orderId, mine.id);
  assert.equal(ok.body.record.data.sentAt, '2026-09-23T12:00:00.000Z');
  const foreign = await save(B, 'message', {
    orderId: mine.id,
    customer: 'X',
    phone: '1',
    kind: 'Contato',
    message: 'Oi',
    status: 'Enviado',
  });
  assert.equal(foreign.body.record.data.orderId, undefined);
});

test('films, automations and tutorials are stored per account', { skip }, async () => {
  await save(A, 'film', {
    brand: 'Apple',
    model: 'iPhone 15',
    compatible: 'iPhone 15',
    size: 'Frontal',
  });
  const films = await list(A, 'film');
  assert.ok(films.some((f) => f.data.model === 'iPhone 15'));
  assert.ok(films.some((f) => f.id.startsWith('film-default-')));
  assert.equal(
    (await remove(A, films.find((f) => f.id.startsWith('film-default-')).id)).status,
    403,
  );
  const auto = await save(A, 'automation', {
    name: 'Revisão',
    schedule: '30 dias',
    message: 'Olá',
    enabled: true,
  });
  await save(
    A,
    'automation',
    { name: 'Revisão', schedule: '30 dias', message: 'Olá', enabled: false },
    auto.body.record.id,
  );
  assert.equal((await list(A, 'automation'))[0].data.enabled, false);
  await save(A, 'tutorial', { title: 'Troca de tela', url: 'https://exemplo.com' });
  assert.equal((await list(A, 'tutorial')).length, 1);
  assert.deepEqual(await list(B, 'tutorial'), []);
});
