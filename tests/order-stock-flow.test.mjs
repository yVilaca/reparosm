import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, saveOrder, orders, quickSales, tenantTransaction;
const A = 'account-stock-os';
const base = {
  customer: 'Cliente',
  phone: '11999990000',
  device: 'Aparelho',
  stage: 'Recebido',
  status: 'Aberto',
  labor: 50,
  warrantyDays: 90,
};
before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts(id,username,name,role,status) VALUES ($1,$1,'Estoque','merchant','active')`,
    [A],
  );
  ({ saveOrder } = await import('../lib/orders.ts'));
  orders = await import('../lib/repos/orders.ts');
  quickSales = await import('../lib/repos/quick-sales.ts');
  ({ tenantTransaction } = await import('../lib/db.ts'));
});
after(async () => db?.drop());
const part = async (id, stock = 5) =>
  db.migrationQuery(
    `INSERT INTO parts(id,account_id,name,stock,price,cost) VALUES($1,$2,'Tela', $3,100,40)`,
    [id, A, stock],
  );
const stock = async (id) =>
  (await db.migrationQuery('SELECT stock FROM parts WHERE id=$1', [id]))[0].stock;
const save = (id, partId, quantity = 1, extra = {}) =>
  saveOrder(A, id, { ...base, items: [{ partId, quantity }], ...extra });

test(
  'an edit waiting for cancellation reopens the order and deducts its stock',
  { skip },
  async () => {
    await part('part-os-cancel-race');
    await save('order-stock-cancel-race', 'part-os-cancel-race');
    let release;
    let locked;
    const ready = new Promise((resolve) => (locked = resolve));
    const held = new Promise((resolve) => (release = resolve));
    const blocker = tenantTransaction(A, async (run) => {
      await run('SELECT id FROM parts WHERE account_id=$1 AND id=$2 FOR UPDATE', [
        A,
        'part-os-cancel-race',
      ]);
      locked();
      await held;
    });
    const waitForLocks = async (count) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const [row] = await db.migrationQuery(
          `SELECT count(*)::int AS count FROM pg_stat_activity
         WHERE datname=current_database() AND wait_event_type='Lock'`,
        );
        if (row.count >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail(`Expected ${count} blocked transactions`);
    };
    let cancellation;
    let edit;
    try {
      await ready;
      cancellation = save('order-stock-cancel-race', 'part-os-cancel-race', 1, {
        status: 'Cancelado',
      });
      await waitForLocks(1);
      edit = save('order-stock-cancel-race', 'part-os-cancel-race');
      await waitForLocks(2);
    } finally {
      release();
      await blocker;
      await Promise.all([cancellation, edit]);
    }
    assert.equal((await orders.get(A, 'order-stock-cancel-race')).data.status, 'Aberto');
    assert.equal(await stock('part-os-cancel-race'), 4);
  },
);

test(
  'OS and quick sale share stock; updates preserve snapshots and only move quantity differences',
  { skip },
  async () => {
    await part('part-os-shared');
    let saved = await save('order-stock-shared', 'part-os-shared', 2);
    assert.equal(await stock('part-os-shared'), 3);
    assert.equal(saved.record.data.total, 250);
    await quickSales.create(
      A,
      {
        description: 'Tela',
        price: 100,
        quantity: 1,
        discount: 0,
        partId: 'part-os-shared',
        method: 'Pix',
      },
      '2026-10-05',
    );
    assert.equal(await stock('part-os-shared'), 2);
    await db.migrationQuery(`UPDATE parts SET price=200,cost=90 WHERE id='part-os-shared'`);
    saved = await save('order-stock-shared', 'part-os-shared', 2, { stage: 'Em serviço' });
    assert.equal(await stock('part-os-shared'), 2);
    assert.equal(saved.record.data.total, 250);
    assert.equal(saved.record.data.cost, 80);
    await save('order-stock-shared', 'part-os-shared', 3);
    assert.equal(await stock('part-os-shared'), 1);
    await save('order-stock-shared', 'part-os-shared', 1);
    assert.equal(await stock('part-os-shared'), 3);
    await save('order-stock-shared', 'part-os-shared', 1, {
      stage: 'Concluído',
      status: 'Cancelado',
    });
    assert.equal(await stock('part-os-shared'), 4);
    await save('order-stock-shared', 'part-os-shared', 1, { status: 'Cancelado' });
    assert.equal(await stock('part-os-shared'), 4);
    await save('order-stock-shared', 'part-os-shared', 1);
    assert.equal(await stock('part-os-shared'), 3);
    assert.ok(await orders.remove(A, 'order-stock-shared'));
    assert.equal(await stock('part-os-shared'), 4);
    assert.equal(await orders.remove(A, 'order-stock-shared'), false);
    assert.equal(await stock('part-os-shared'), 4);
  },
);

test(
  'failed mixed item saves roll back stock and the order; concurrent sales cannot oversell',
  { skip },
  async () => {
    await part('part-os-race', 1);
    const outcomes = await Promise.allSettled([
      save('order-stock-race', 'part-os-race'),
      quickSales.create(
        A,
        {
          description: 'Tela',
          price: 100,
          quantity: 1,
          discount: 0,
          partId: 'part-os-race',
          method: 'Pix',
        },
        '2026-10-05',
      ),
    ]);
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await stock('part-os-race'), 0);
    await part('part-os-rollback', 3);
    await assert.rejects(
      saveOrder(A, 'order-stock-invalid', {
        ...base,
        items: [
          { partId: 'part-os-rollback', quantity: 1 },
          { partId: 'foreign-missing', quantity: 1 },
        ],
      }),
    );
    assert.equal(await stock('part-os-rollback'), 3);
    assert.equal(await orders.get(A, 'order-stock-invalid'), null);
  },
);

test(
  'legacy items do not create stock on cancel or delete, and only newly added units are deducted',
  { skip },
  async () => {
    await part('part-os-legacy', 5);
    await orders.save(A, 'order-stock-legacy', { ...base, code: 'OS-LEGACY', total: 150 });
    await db.migrationQuery(
      `INSERT INTO order_items(id,account_id,order_id,part_id,name,quantity,unit_price,unit_cost) VALUES ('old-item',$1,'order-stock-legacy','part-os-legacy','Tela antiga',1,80,30)`,
      [A],
    );
    await save('order-stock-legacy', 'part-os-legacy', 1);
    assert.equal(await stock('part-os-legacy'), 5);
    await save('order-stock-legacy', 'part-os-legacy', 2);
    assert.equal(await stock('part-os-legacy'), 4);
    await save('order-stock-legacy', 'part-os-legacy', 2, { status: 'Cancelado' });
    assert.equal(await stock('part-os-legacy'), 5);
    await orders.remove(A, 'order-stock-legacy');
    assert.equal(await stock('part-os-legacy'), 5);
  },
);
