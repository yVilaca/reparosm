import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';
import { sessionCookie } from './support/session.mjs';

// Checklist de entrada: gravação por partes, isolamento entre lojas e o link do
// teste pelo aparelho, que só grava o que o navegador testa e não passa por
// cima do que a loja respondeu.
const skip = skipWithoutDatabase;
let db, checklists, publicRoute, shopRoute, deviceRoute, cookie;
const A = 'account-check';
const B = 'account-check-other';
const sha = (token) => createHash('sha256').update(token).digest('hex');
const tokenOf = (url) => url.split('#t=')[1];

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  checklists = await import('../lib/repos/order-checklist.ts');
  publicRoute = await import('../app/api/public/device-test/route.ts');
  shopRoute = await import('../app/api/orders/[orderId]/checklist/route.ts');
  deviceRoute = await import('../app/api/orders/[orderId]/checklist/device/route.ts');
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ($1, 'check', 'Loja do Zé', 'merchant', 'active'),
            ($2, 'check-other', 'Outra', 'merchant', 'active')`,
    [A, B],
  );
  await db.migrationQuery(`INSERT INTO shops (account_id, name) VALUES ($1, 'Loja do Zé')`, [A]);
  await db.tenantQuery(
    A,
    `INSERT INTO orders (id, account_id, code, customer, phone, device, device_password, total)
     VALUES ('order-check', $1, 'OS-7', 'Ana Maria Souza', '11999990000', 'Galaxy A54', '0012', 300)`,
    [A],
  );
  await db.tenantQuery(
    B,
    `INSERT INTO orders (id, account_id, code, customer, device, total)
     VALUES ('order-check-other', $1, 'OS-1', 'Bia', 'Moto G', 100)`,
    [B],
  );
  cookie = await sessionCookie(db, 'check', A);
});
after(async () => db?.drop());

test('the shop saves only what changed and reads it back', { skip }, async () => {
  const empty = await checklists.get(A, 'order-check');
  assert.deepEqual(empty, { checklist: { items: {}, marks: [] }, session: { active: false } });
  await checklists.update(
    A,
    'order-check',
    { powersOn: true, items: { touch: { state: 'ok' } } },
    'user-check',
  );
  const saved = await checklists.update(
    A,
    'order-check',
    { items: { buttons: { state: 'fail', note: 'volume +' } } },
    'user-check',
  );
  assert.equal(saved.checklist.powersOn, true);
  assert.equal(saved.checklist.items.touch.state, 'ok', 'a gravação anterior continua');
  assert.equal(saved.checklist.items.buttons.note, 'volume +');
  const [row] = await db.migrationQuery(
    `SELECT updated_by FROM order_checklists WHERE order_id = 'order-check'`,
  );
  assert.equal(row.updated_by, 'user-check');
});

test('another shop sees nothing and changes nothing', { skip }, async () => {
  assert.equal(await checklists.get(B, 'order-check'), null);
  assert.equal(await checklists.update(B, 'order-check', { powersOn: false }, null), null);
  assert.equal(await checklists.startDeviceTest(B, 'order-check', null), null);
  assert.deepEqual(await db.tenantQuery(B, 'SELECT order_id FROM order_checklists'), []);
  assert.deepEqual(
    await db.query('SELECT order_id FROM order_checklists'),
    [],
    'sem contexto, nada',
  );
});

test(
  'the device link keeps only a hash, lasts two hours and is one per order',
  { skip },
  async () => {
    const first = await checklists.startDeviceTest(A, 'order-check', 'user-check');
    assert.match(first.url, /\/testar#t=[A-Za-z0-9_-]{43}$/);
    assert.equal(first.session.active, true);
    const token = tokenOf(first.url);
    const [link] = await db.migrationQuery(
      `SELECT token_hash, round(extract(epoch FROM expires_at - created_at) / 60)::int AS minutes
     FROM order_device_tests WHERE revoked_at IS NULL`,
    );
    assert.deepEqual(link, { token_hash: sha(token), minutes: 120 });
    assert.ok(await checklists.openDeviceTest(token));
    const second = tokenOf((await checklists.startDeviceTest(A, 'order-check', null)).url);
    assert.equal(await checklists.openDeviceTest(token), null, 'o link anterior deixa de valer');
    assert.ok(await checklists.openDeviceTest(second));
    const ended = await checklists.endDeviceTest(A, 'order-check');
    assert.deepEqual(ended, { active: false });
    assert.equal(await checklists.openDeviceTest(second), null);
  },
);

test(
  'the device page sees the shop, the order number and the model, nothing else',
  { skip },
  async () => {
    const token = tokenOf((await checklists.startDeviceTest(A, 'order-check', null)).url);
    const test = await checklists.openDeviceTest(token);
    assert.deepEqual(test, {
      shop: 'Loja do Zé',
      order: { code: 'OS-7', device: 'Galaxy A54' },
      answered: ['touch', 'buttons'],
    });
    const text = JSON.stringify(test);
    for (const secret of ['Ana', 'Souza', '11999990000', '0012', '300'])
      assert.ok(!text.includes(secret), `não vaza ${secret}`);
    const { session } = await checklists.get(A, 'order-check');
    assert.ok(session.openedAt && session.lastSeenAt, 'a loja vê que o aparelho abriu');
  },
);

test('device results fill only what the shop did not answer', { skip }, async () => {
  const token = tokenOf((await checklists.startDeviceTest(A, 'order-check', null)).url);
  assert.equal(
    await checklists.recordDeviceTest(token, {
      results: [
        { key: 'touch', state: 'fail', note: 'canto' },
        { key: 'speaker', state: 'ok' },
      ],
      device: { platform: 'Android 14', screen: '1080×2400', battery: 64 },
    }),
    true,
  );
  const { checklist } = await checklists.get(A, 'order-check');
  assert.deepEqual(checklist.items.touch.state, 'ok', 'a loja tinha marcado o toque à mão');
  assert.equal(checklist.items.speaker.by, 'device');
  assert.equal(checklist.device.battery, 64);
  const [row] = await db.migrationQuery(
    `SELECT updated_by FROM order_checklists WHERE order_id = 'order-check'`,
  );
  assert.equal(row.updated_by, 'device');
});

test('expired, malformed and suspended-shop links write nothing', { skip }, async () => {
  const report = { results: [{ key: 'vibration', state: 'ok' }] };
  const expired = tokenOf((await checklists.startDeviceTest(A, 'order-check', null)).url);
  await db.migrationQuery(
    `UPDATE order_device_tests SET expires_at = now() - interval '1 minute' WHERE token_hash = $1`,
    [sha(expired)],
  );
  assert.equal(await checklists.recordDeviceTest(expired, report), false);
  assert.equal(await checklists.recordDeviceTest('curto', report), false);
  assert.equal(await checklists.recordDeviceTest('A'.repeat(43), report), false);
  const live = tokenOf((await checklists.startDeviceTest(A, 'order-check', null)).url);
  await db.migrationQuery(`UPDATE accounts SET status = 'suspended' WHERE id = $1`, [A]);
  try {
    assert.equal(await checklists.recordDeviceTest(live, report), false);
    assert.equal(await checklists.openDeviceTest(live), null);
  } finally {
    await db.migrationQuery(`UPDATE accounts SET status = 'active' WHERE id = $1`, [A]);
  }
  assert.equal((await checklists.get(A, 'order-check')).checklist.items.vibration, undefined);
});

test('the link context sees its own link row and nothing else', { skip }, async () => {
  const token = tokenOf((await checklists.startDeviceTest(A, 'order-check', null)).url);
  const seen = await db.publicDeviceTestTransaction(sha(token), async (run) => ({
    links: await run('SELECT order_id FROM order_device_tests'),
    checklists: await run('SELECT order_id FROM order_checklists'),
    orders: await run('SELECT id FROM orders'),
  }));
  assert.deepEqual(seen, { links: [{ order_id: 'order-check' }], checklists: [], orders: [] });
  await assert.rejects(
    db.publicDeviceTestTransaction(sha(token), (run) =>
      run(`UPDATE order_device_tests SET expires_at = now() + interval '9 years'`),
    ),
    /row-level security/,
    'o link não estica a própria validade',
  );
});

test('the public route answers the same way for every link failure', { skip }, async () => {
  const post = (body) =>
    publicRoute.POST(
      new Request('https://test.local/api/public/device-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
    );
  const token = tokenOf((await checklists.startDeviceTest(A, 'order-check', null)).url);
  const opened = await post(JSON.stringify({ token }));
  assert.equal(opened.status, 200);
  assert.equal(opened.headers.get('cache-control'), 'no-store');
  assert.equal(opened.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal((await opened.json()).test.order.code, 'OS-7');
  const recorded = await post(JSON.stringify({ token, results: [{ key: 'motion', state: 'ok' }] }));
  assert.deepEqual(await recorded.json(), { ok: true });
  const wrong = await post(JSON.stringify({ token, results: [{ key: 'buttons', state: 'ok' }] }));
  assert.equal(wrong.status, 400, 'teste que o navegador não faz');
  for (const body of [
    JSON.stringify({ token: 'B'.repeat(43) }),
    JSON.stringify({ token: 'B'.repeat(43), results: [{ key: 'motion', state: 'ok' }] }),
    JSON.stringify({}),
    'não é json',
  ]) {
    const failed = await post(body);
    assert.equal(failed.status, 404);
    assert.deepEqual(await failed.json(), { error: 'Link inválido ou expirado.' });
  }
});

test(
  'the shop routes need a session, the same origin and an order of the shop',
  { skip },
  async () => {
    const call = (route, method, orderId, { headers = {}, body } = {}) =>
      route[method](
        new Request(`https://test.local/api/orders/${orderId}/checklist`, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body,
        }),
        { params: Promise.resolve({ orderId }) },
      );
    const same = { cookie, origin: 'https://test.local' };
    assert.equal((await call(shopRoute, 'GET', 'order-check')).status, 401);
    assert.equal(
      (
        await call(shopRoute, 'PATCH', 'order-check', {
          headers: { cookie, origin: 'https://golpe.example' },
          body: JSON.stringify({ powersOn: true }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(shopRoute, 'PATCH', 'order-check', {
          headers: same,
          body: JSON.stringify({ items: { x: 1 } }),
        })
      ).status,
      400,
    );
    const patched = await call(shopRoute, 'PATCH', 'order-check', {
      headers: same,
      body: JSON.stringify({ notes: 'Película trincada' }),
    });
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).checklist.notes, 'Película trincada');
    assert.equal(
      (await call(shopRoute, 'PATCH', 'order-check-other', { headers: same, body: '{}' })).status,
      404,
    );
    assert.equal(
      (
        await call(deviceRoute, 'POST', 'order-check', {
          headers: { cookie, origin: 'https://golpe.example' },
        })
      ).status,
      403,
    );
    const started = await call(deviceRoute, 'POST', 'order-check', { headers: same });
    assert.equal(started.status, 201);
    assert.match((await started.json()).url, /#t=/);
    assert.equal(
      (await call(deviceRoute, 'POST', 'order-check-other', { headers: same })).status,
      404,
    );
    const ended = await call(deviceRoute, 'DELETE', 'order-check', { headers: same });
    assert.deepEqual(await ended.json(), { session: { active: false } });
    const read = await call(shopRoute, 'GET', 'order-check', { headers: { cookie } });
    assert.equal((await read.json()).session.active, false);
  },
);

test('deleting the order deletes its checklist and device links', { skip }, async () => {
  await db.tenantQuery(A, `DELETE FROM orders WHERE id = 'order-check'`);
  assert.deepEqual(
    await db.migrationQuery(
      `SELECT (SELECT count(*) FROM order_checklists)::int AS checklists,
              (SELECT count(*) FROM order_device_tests)::int AS links`,
    ),
    [{ checklists: 0, links: 0 }],
  );
});
