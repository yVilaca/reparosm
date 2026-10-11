import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';
import { sessionCookie } from './support/session.mjs';

// O link de acompanhamento: só o hash no banco, lista fechada de campos e
// nenhuma porta para outra OS ou outra loja.
const skip = skipWithoutDatabase;
let db, tracking, publicRoute, shopRoute, cookie;
const A = 'account-track';
const B = 'account-track-other';
const sha = (token) => createHash('sha256').update(token).digest('hex');
const tokenOf = (url) => url.split('#t=')[1];

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  tracking = await import('../lib/repos/order-tracking.ts');
  publicRoute = await import('../app/api/public/tracking/route.ts');
  shopRoute = await import('../app/api/orders/[orderId]/tracking/route.ts');
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ($1, 'track', 'Loja do Zé', 'merchant', 'active'),
            ($2, 'track-other', 'Outra', 'merchant', 'active')`,
    [A, B],
  );
  await db.migrationQuery(
    `INSERT INTO shops (account_id, name, phone, profile) VALUES ($1, 'Loja do Zé', '11988887777',
       '{"address": "Rua A, 10", "hours": "Seg a sáb, 9h às 18h", "warranty": "90",
         "logo": "/api/public/shops/logo?loja=account-track&v=1", "document": "12345678000199",
         "internalPhone": "1133334444"}')`,
    [A],
  );
  // Como a aplicação grava: papel restrito, no contexto da loja.
  await db.tenantQuery(
    A,
    `INSERT INTO orders (id, account_id, code, customer, phone, device, imei, device_password,
       pattern, problem, service, notes, technician, total, cost, stage, warranty_days)
     VALUES ('order-track', $1, 'OS-12', 'Ana Maria Souza', '11999990000', 'iPhone 11',
       '123456789012345', '0012', '{1,5,9}', 'Tela quebrada', 'Troca de tela',
       'Cliente pediu película', 'João Técnico', 350, 120, 'Recebido', 90)`,
    [A],
  );
  await db.tenantQuery(
    B,
    `INSERT INTO orders (id, account_id, code, customer, device, total)
     VALUES ('order-track-other', $1, 'OS-1', 'Bia', 'Moto G', 100)`,
    [B],
  );
  cookie = await sessionCookie(db, 'track', A);
});
after(async () => db?.drop());

test('stage and status changes are recorded with their time', { skip }, async () => {
  const events = () =>
    db.tenantQuery(
      A,
      `SELECT stage, status FROM order_events WHERE order_id = 'order-track' ORDER BY created_at, id`,
    );
  assert.deepEqual(await events(), [{ stage: 'Recebido', status: 'Aberto' }]);
  await db.tenantQuery(A, `UPDATE orders SET notes = 'outra nota' WHERE id = 'order-track'`);
  assert.equal((await events()).length, 1, 'editar outros campos não vira histórico');
  await db.tenantQuery(A, `UPDATE orders SET stage = 'Em serviço' WHERE id = 'order-track'`);
  await db.tenantQuery(
    A,
    `UPDATE orders SET stage = 'Em serviço', status = 'Aberto' WHERE id = 'order-track'`,
  );
  assert.deepEqual(await events(), [
    { stage: 'Recebido', status: 'Aberto' },
    { stage: 'Em serviço', status: 'Aberto' },
  ]);
});

test('a link keeps only its hash and opens a closed list of fields', { skip }, async () => {
  const issued = await tracking.issue(A, 'order-track', 'user-track');
  assert.match(issued.url, /\/acompanhar#t=[A-Za-z0-9_-]{43}$/);
  const token = tokenOf(issued.url);
  const rows = await db.migrationQuery('SELECT * FROM order_tracking_links');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, sha(token));
  assert.ok(!JSON.stringify(rows).includes(token), 'o token não fica no banco');

  const opened = await tracking.openPublic(token);
  assert.deepEqual(Object.keys(opened).sort(), ['events', 'order', 'shop']);
  assert.deepEqual(opened.shop, {
    name: 'Loja do Zé',
    phone: '11988887777',
    address: 'Rua A, 10',
    hours: 'Seg a sáb, 9h às 18h',
    logoUrl: '/api/public/shops/logo?loja=account-track&v=1',
  });
  assert.deepEqual(
    { ...opened.order, createdAt: undefined },
    {
      code: 'OS-12',
      firstName: 'Ana',
      device: 'iPhone 11',
      problem: 'Tela quebrada',
      service: 'Troca de tela',
      stage: 'Em serviço',
      status: 'Aberto',
      createdAt: undefined,
      total: 350,
      paid: 0,
      deliveredAt: undefined,
      warrantyUntil: undefined,
    },
  );
  assert.deepEqual(
    opened.events.map((event) => event.stage),
    ['Recebido', 'Em serviço'],
  );
  const json = JSON.stringify(opened);
  for (const secret of [
    '0012',
    '123456789012345',
    '11999990000',
    'Souza',
    'outra nota',
    'João',
    '12345678000199',
    '1133334444',
    'account-track"',
    'order-track',
  ])
    assert.ok(!json.includes(secret), `não pode sair: ${secret}`);
});

test('opening counts a visit and the shop sees it', { skip }, async () => {
  const summary = await tracking.summary(A, 'order-track');
  assert.equal(summary.active, 1);
  assert.equal(summary.views, 1);
  assert.ok(summary.lastViewedAt && summary.lastSentAt);
  const other = await tracking.summary(B, 'order-track');
  assert.equal(other.active + other.views, 0, 'outra loja não vê os links');
});

test('revoked, expired, malformed and unknown links all fail the same way', { skip }, async () => {
  const revoked = tokenOf((await tracking.issue(A, 'order-track', null)).url);
  assert.ok(await tracking.openPublic(revoked));
  assert.equal(await tracking.revokeAll(A, 'order-track'), 2);
  assert.equal(await tracking.openPublic(revoked), null);

  const expired = tokenOf((await tracking.issue(A, 'order-track', null)).url);
  await db.migrationQuery(
    `UPDATE order_tracking_links SET expires_at = now() - interval '1 second'
     WHERE token_hash = $1`,
    [sha(expired)],
  );
  assert.equal(await tracking.openPublic(expired), null);
  assert.equal(await tracking.openPublic('curto'), null);
  assert.equal(await tracking.openPublic('A'.repeat(43)), null);
});

test('a suspended shop takes its links down at once', { skip }, async () => {
  const token = tokenOf((await tracking.issue(A, 'order-track', null)).url);
  await db.migrationQuery(`UPDATE accounts SET status = 'suspended' WHERE id = $1`, [A]);
  try {
    assert.equal(await tracking.openPublic(token), null);
  } finally {
    await db.migrationQuery(`UPDATE accounts SET status = 'active' WHERE id = $1`, [A]);
  }
  assert.ok(await tracking.openPublic(token));
});

test('at most ten links stay active per order', { skip }, async () => {
  for (let i = 0; i < 11; i++) await tracking.issue(A, 'order-track', null);
  assert.equal((await tracking.summary(A, 'order-track')).active, 10);
  assert.equal(await tracking.issue(A, 'order-track-other', null), null, 'OS de outra loja');
});

test('the link context sees one link row and nothing else', { skip }, async () => {
  const token = tokenOf((await tracking.issue(A, 'order-track', null)).url);
  const seen = await db.publicTrackingTransaction(sha(token), async (run) => ({
    links: await run('SELECT order_id FROM order_tracking_links'),
    orders: await run('SELECT id FROM orders'),
    events: await run('SELECT id FROM order_events'),
    shops: await run('SELECT account_id FROM shops'),
  }));
  assert.deepEqual(seen, {
    links: [{ order_id: 'order-track' }],
    orders: [],
    events: [],
    shops: [],
  });
  await assert.rejects(
    db.publicTrackingTransaction(sha(token), (run) =>
      run(
        `UPDATE order_tracking_links SET revoked_at = NULL, expires_at = now() + interval '9 years'`,
      ),
    ),
    /row-level security/,
    'o link não muda a si mesmo sem o contexto da loja',
  );
  assert.deepEqual(
    await db.publicTrackingTransaction(sha('outro'), (run) =>
      run('SELECT order_id FROM order_tracking_links'),
    ),
    [],
  );
  assert.deepEqual(await db.tenantQuery(B, 'SELECT order_id FROM order_tracking_links'), []);
  assert.deepEqual(await db.query('SELECT order_id FROM order_tracking_links'), []);
});

test('the public route answers the same way for every failure', { skip }, async () => {
  const open = (body) =>
    publicRoute.POST(
      new Request('https://test.local/api/public/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
    );
  const token = tokenOf((await tracking.issue(A, 'order-track', null)).url);
  const ok = await open(JSON.stringify({ token }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal(ok.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal((await ok.json()).tracking.order.code, 'OS-12');
  for (const body of [
    JSON.stringify({ token: 'B'.repeat(43) }),
    JSON.stringify({}),
    'não é json',
  ]) {
    const failed = await open(body);
    assert.equal(failed.status, 404);
    assert.deepEqual(await failed.json(), { error: 'Link inválido ou expirado.' });
  }
});

test(
  'the shop route needs a session, the same origin and an order of the shop',
  { skip },
  async () => {
    const call = (method, orderId, headers = {}) =>
      shopRoute[method](
        new Request(`https://test.local/api/orders/${orderId}/tracking`, { method, headers }),
        { params: Promise.resolve({ orderId }) },
      );
    assert.equal((await call('GET', 'order-track')).status, 401);
    assert.equal(
      (await call('POST', 'order-track', { cookie, origin: 'https://golpe.example' })).status,
      403,
      'outra origem',
    );
    const created = await call('POST', 'order-track', { cookie, origin: 'https://test.local' });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.match(body.url, /#t=[A-Za-z0-9_-]{43}$/);
    assert.equal(body.summary.active, 10);
    assert.equal(
      (await call('POST', 'order-track-other', { cookie, origin: 'https://test.local' })).status,
      404,
    );
    const removed = await call('DELETE', 'order-track', { cookie, origin: 'https://test.local' });
    assert.equal((await removed.json()).revoked, 10);
    assert.equal((await (await call('GET', 'order-track', { cookie })).json()).summary.active, 0);
  },
);

test('deleting the order deletes its links and history', { skip }, async () => {
  await db.tenantQuery(A, `DELETE FROM orders WHERE id = 'order-track'`);
  assert.deepEqual(
    await db.migrationQuery(
      `SELECT (SELECT count(*) FROM order_tracking_links)::int AS links,
              (SELECT count(*) FROM order_events WHERE order_id = 'order-track')::int AS events`,
    ),
    [{ links: 0, events: 0 }],
  );
});
