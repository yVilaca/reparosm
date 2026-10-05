import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { todayInSaoPaulo } from '../lib/warranty.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, route, paymentRoute, repo, A, B;

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
  route = await import('../app/api/quick-sales/route.ts');
  paymentRoute = await import('../app/api/payments/route.ts');
  repo = await import('../lib/repos/quick-sales.ts');
  A = await merchant('quick-a');
  B = await merchant('quick-b');
});
after(async () => db?.drop());

const sell = async (data, who = A) => {
  const response = await route.POST(
    new Request('https://test.local/api/quick-sales', {
      method: 'POST',
      headers: {
        origin: 'https://test.local',
        cookie: who.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }),
  );
  return { status: response.status, body: await response.json() };
};

test(
  'the cash receives the price minus the discount, keeping cost and discount',
  { skip },
  async () => {
    const { status, body } = await sell({
      description: '  Película 3D iPhone 15 ',
      price: 60,
      discount: 6,
      cost: 12,
      method: 'Pix',
    });
    assert.equal(status, 201);
    assert.deepEqual(
      { ...body.sale, id: undefined },
      {
        id: undefined,
        description: 'Película 3D iPhone 15',
        value: 54,
        discount: 6,
        cost: 12,
        quantity: 1,
        method: 'Pix',
        date: todayInSaoPaulo(),
      },
    );
    const [entry] = await db.migrationQuery(
      `SELECT kind, value::text AS value, discount::text AS discount, cost::text AS cost, order_id
     FROM cash_entries WHERE id = $1`,
      [body.sale.id],
    );
    assert.deepEqual(entry, {
      kind: 'in',
      value: '54.00',
      discount: '6.00',
      cost: '12.00',
      order_id: null,
    });
  },
);

test('a stock product sale uses its catalog cost and decrements inventory', { skip }, async () => {
  await db.migrationQuery(
    `INSERT INTO parts (id, account_id, name, stock, cost, price)
     VALUES ('part-quick-stock', $1, 'Película', 2, 10, 30)`,
    [A.id],
  );
  const { status, body } = await sell({
    description: 'Outro nome enviado pelo navegador',
    price: 30,
    discount: 3,
    cost: 999,
    partId: 'part-quick-stock',
    method: 'Pix',
  });
  assert.equal(status, 201);
  assert.equal(body.sale.value, 27);
  assert.equal(body.sale.cost, 10);
  assert.equal(body.sale.quantity, 1);
  assert.equal(body.sale.partId, 'part-quick-stock');
  const [part] = await db.migrationQuery('SELECT stock FROM parts WHERE id = $1', [
    'part-quick-stock',
  ]);
  assert.equal(part.stock, 1);
  const [entry] = await db.migrationQuery(
    `SELECT kind, part_id, value::text AS value, cost::text AS cost
     FROM cash_entries WHERE id = $1`,
    [body.sale.id],
  );
  assert.deepEqual(entry, {
    kind: 'in',
    part_id: 'part-quick-stock',
    value: '27.00',
    cost: '10.00',
  });
  const [{ count }] = await db.migrationQuery(
    `SELECT count(*)::int AS count FROM cash_entries
     WHERE account_id = $1 AND kind = 'out' AND description = 'Outro nome enviado pelo navegador'`,
    [A.id],
  );
  assert.equal(count, 0);
});

test('a multi-unit stock sale decrements and restores the exact quantity', { skip }, async () => {
  await db.migrationQuery(
    `INSERT INTO parts (id, account_id, name, stock, cost, price)
     VALUES ('part-quick-quantity', $1, 'Cabo USB-C', 3, 10, 30)`,
    [A.id],
  );
  const { status, body } = await sell({
    description: 'Cabo USB-C',
    price: 30,
    discount: 5,
    cost: 999,
    quantity: 2,
    partId: 'part-quick-quantity',
    method: 'Pix',
  });
  assert.equal(status, 201);
  assert.equal(body.sale.value, 55);
  assert.equal(body.sale.cost, 20);
  assert.equal(body.sale.quantity, 2);
  const [afterSale] = await db.migrationQuery('SELECT stock FROM parts WHERE id = $1', [
    'part-quick-quantity',
  ]);
  assert.equal(afterSale.stock, 1);

  const response = await paymentRoute.DELETE(
    new Request(`https://test.local/api/payments?id=${body.sale.id}`, {
      method: 'DELETE',
      headers: { origin: 'https://test.local', cookie: A.cookie },
    }),
  );
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  const [afterUndo] = await db.migrationQuery('SELECT stock FROM parts WHERE id = $1', [
    'part-quick-quantity',
  ]);
  assert.equal(afterUndo.stock, 3);
});

test('undoing a stock product sale restores its inventory', { skip }, async () => {
  await db.migrationQuery(
    `INSERT INTO parts (id, account_id, name, stock, cost, price)
     VALUES ('part-quick-undo', $1, 'Capa', 1, 8, 20)`,
    [A.id],
  );
  const { body } = await sell({
    description: 'Capa',
    price: 20,
    partId: 'part-quick-undo',
    method: 'Dinheiro',
  });
  const [before] = await db.migrationQuery(
    'SELECT kind, part_id, order_id FROM cash_entries WHERE id = $1',
    [body.sale.id],
  );
  assert.deepEqual(before, { kind: 'in', part_id: 'part-quick-undo', order_id: null });
  const response = await paymentRoute.DELETE(
    new Request(`https://test.local/api/payments?id=${body.sale.id}`, {
      method: 'DELETE',
      headers: { origin: 'https://test.local', cookie: A.cookie },
    }),
  );
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  const [part] = await db.migrationQuery('SELECT stock FROM parts WHERE id = $1', [
    'part-quick-undo',
  ]);
  assert.equal(part.stock, 1);
});

test('a sale typed freely needs neither cost nor discount', { skip }, async () => {
  const { status, body } = await sell({
    description: 'Conserto de botão',
    price: 35,
    method: 'Dinheiro',
  });
  assert.equal(status, 201);
  assert.equal(body.sale.value, 35);
  assert.equal(body.sale.discount, 0);
  assert.equal(body.sale.cost, undefined);
  assert.equal(body.sale.quantity, 1);
});

test(
  'refuses a discount as large as the price, a bad method or a missing description',
  { skip },
  async () => {
    assert.equal(
      (await sell({ description: 'Capinha', price: 45, discount: 45, method: 'Pix' })).status,
      400,
    );
    assert.equal(
      (await sell({ description: 'Capinha', price: 45, discount: -1, method: 'Pix' })).status,
      400,
    );
    assert.equal(
      (await sell({ description: 'Capinha', price: 45, quantity: 0, method: 'Pix' })).status,
      400,
    );
    assert.equal(
      (await sell({ description: 'Capinha', price: 45, quantity: 1.5, method: 'Pix' })).status,
      400,
    );
    assert.equal((await sell({ description: 'Capinha', price: 45, method: 'pix' })).status, 400);
    assert.equal((await sell({ description: '  ', price: 45, method: 'Pix' })).status, 400);
    assert.equal((await sell({ description: 'Capinha', price: 0, method: 'Pix' })).status, 400);
    assert.equal(
      (await sell({ description: 'Capinha', price: 45, cost: -2, method: 'Pix' })).status,
      400,
    );
  },
);

test("lists only this shop's sales without an order", { skip }, async () => {
  await sell({ description: 'Da outra loja', price: 10, method: 'Pix' }, B);
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total) VALUES ('o1', $1, 'OS-1', 'Ana', 'Moto', 100)`,
    [A.id],
  );
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, date, order_id)
     VALUES ('payment-os', $1, 'in', 'Recebimento da OS', 100, $2, 'o1'),
            ('expense-x', $1, 'out', 'Energia', 50, $2, NULL)`,
    [A.id, todayInSaoPaulo()],
  );
  const sales = await repo.since(A.id, todayInSaoPaulo());
  assert.deepEqual(sales.map((sale) => sale.description).sort(), [
    'Conserto de botão',
    'Outro nome enviado pelo navegador',
    'Película 3D iPhone 15',
  ]);
});
