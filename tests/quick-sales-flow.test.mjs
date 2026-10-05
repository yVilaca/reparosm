import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { todayInSaoPaulo } from '../lib/warranty.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, route, repo, A, B;

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
    'Película 3D iPhone 15',
  ]);
});
