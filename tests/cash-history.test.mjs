import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, cash;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ('account-hist', 'hist', 'Hist', 'merchant', 'active')`,
  );
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total)
     VALUES ('order-hist', 'account-hist', 'OS-9', 'Ana', 'iPhone', 350)`,
  );
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date, order_id)
     VALUES ('hist-1', 'account-hist', 'in', 'OS-9', 350, 'Pix', DATE '2026-03-31', 'order-hist'),
            ('hist-2', 'account-hist', 'out', 'Aluguel', 900, 'Boleto', DATE '2026-03-02', NULL),
            ('hist-3', 'account-hist', 'in', 'Antigo', 70, 'Pix', DATE '2026-02-15', NULL)`,
  );
  cash = await import('../lib/repos/cash.ts');
});
after(async () => db?.drop());

test('returns only the entries of the chosen period', { skip }, async () => {
  const rows = await cash.history('account-hist', 'today', '2026-03-31');
  assert.deepEqual(
    rows.map((row) => row.id),
    ['hist-1'],
  );
  const month = await cash.history('account-hist', 'month', '2026-03-31');
  assert.deepEqual(month.map((row) => row.id).sort(), ['hist-1', 'hist-2']);
  const previous = await cash.history('account-hist', 'previous-month', '2026-03-31');
  assert.deepEqual(
    previous.map((row) => row.id),
    ['hist-3'],
  );
});

test('carries the originating order when there is one', { skip }, async () => {
  const [row] = await cash.history('account-hist', 'today', '2026-03-31');
  assert.deepEqual(row.order, { id: 'order-hist', code: 'OS-9' });
  const [expense] = await cash.history('account-hist', 'previous-month', '2026-03-31');
  assert.equal(expense.order, null);
});

test('keeps the free-text reference in the filtered history', { skip }, async () => {
  await db.migrationQuery(`UPDATE cash_entries SET reference = 'Balcão' WHERE id = 'hist-1'`);
  const [row] = await cash.history('account-hist', 'today', '2026-03-31');
  assert.equal(row.reference, 'Balcão');
});

test(
  'custom ranges include boundary dates, OS proportional costs and sale snapshots with tenant isolation',
  { skip },
  async () => {
    await db.migrationQuery(`UPDATE orders SET cost = 140 WHERE id = 'order-hist'`);
    await db.migrationQuery(`INSERT INTO accounts (id,username,name,role,status)
    VALUES ('hist-other','hist-other','Other','merchant','active')`);
    await db.migrationQuery(`INSERT INTO orders (id,account_id,code,customer,device,total,cost)
    VALUES ('hist-partial','account-hist','OS-10','Ana','Moto',120,60)`);
    await db.migrationQuery(`INSERT INTO cash_entries (id,account_id,kind,description,value,cost,date,order_id,created_at) VALUES
    ('hist-sale','account-hist','in','Venda',90,30,'2026-03-31',NULL,'2026-03-01T12:00:00Z'),
    ('hist-partial-receipt','account-hist','in','Parcial',30,NULL,'2026-03-30','hist-partial','2026-03-01T12:00:00Z'),
    ('hist-foreign','hist-other','in','Outra loja',999,1,'2026-03-31',NULL,now()),
    ('tie-a','account-hist','in','Empate A',0,0,'2026-03-31',NULL,'2026-01-01T12:00:00Z'),
    ('tie-z','account-hist','in','Empate Z',0,0,'2026-03-31',NULL,'2026-01-01T12:00:00Z')`);
    const rows = await cash.history('account-hist', { from: '2026-03-30', to: '2026-03-31' });
    const costs = Object.fromEntries(rows.map((row) => [row.id, row.cost]));
    assert.equal(costs['hist-1'], 140);
    assert.equal(costs['hist-sale'], 30);
    assert.equal(costs['hist-partial-receipt'], 15);
    assert.equal(costs['hist-foreign'], undefined);
    assert.equal(costs['hist-2'], undefined);
    assert.deepEqual(
      rows.filter((row) => row.id.startsWith('tie-')).map((row) => row.id),
      ['tie-z', 'tie-a'],
    );
    const today = await cash.today('account-hist', '2026-03-31');
    assert.equal(today.income, 440);
    assert.equal(today.cost, 170);
    assert.equal(today.net, 270);
    const month = await cash.month('account-hist', '2026-03-31');
    assert.equal(month.current.income, 470);
    assert.equal(month.current.cost, 185);
    assert.equal(month.current.net, 285);
    await assert.rejects(
      () => cash.history('account-hist', { from: '2026-02-30', to: '2026-03-31' }),
      /datas inválido/,
    );
  },
);

test(
  'receipt cost rounds once in SQL so filtered rows and aggregates agree on half cents',
  { skip },
  async () => {
    await db.migrationQuery(
      `INSERT INTO orders(id,account_id,code,customer,device,total,cost) VALUES('hist-rounding','account-hist','OS-rounding','Ana','Moto',2,2.01)`,
    );
    await db.migrationQuery(
      `INSERT INTO cash_entries(id,account_id,kind,description,value,date,order_id) VALUES('hist-rounding-receipt','account-hist','in','Parcial',1,'2026-04-01','hist-rounding')`,
    );
    const [row] = await cash.history('account-hist', 'today', '2026-04-01');
    assert.equal(row.cost, 1.01);
    const today = await cash.today('account-hist', '2026-04-01');
    assert.equal(today.cost, row.cost);
    assert.equal(today.net, -0.01);
    const { received } = await import('../lib/repos/receivable-orders.ts');
    assert.equal((await received('account-hist', '2026-04-01', '2026-04-01'))[0].cost, 1.01);
    assert.deepEqual(await received('account-hist', '2026-04-02', '2026-04-02'), []);
  },
);
