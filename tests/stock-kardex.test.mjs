import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase as skip } from './support/db.mjs';
let db, quickSales, stock, saveOrder, orders;
const A = 'account-kardex',
  B = 'account-kardex-other';
before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  for (const id of [A, B])
    await db.migrationQuery(
      "INSERT INTO accounts(id,username,name,role,status) VALUES($1,$1,$1,'merchant','active')",
      [id],
    );
  quickSales = await import('../lib/repos/quick-sales.ts');
  stock = await import('../lib/repos/stock.ts');
  ({ saveOrder } = await import('../lib/orders.ts'));
  orders = await import('../lib/repos/orders.ts');
});
after(async () => db?.drop());
const part = async (id, quantity = 3, account = A) =>
  db.migrationQuery(
    'INSERT INTO parts(id,account_id,name,sku,stock,price,cost) VALUES($1,$2,$1,$1,$3,100,40)',
    [id, account, quantity],
  );
const count = async (id) =>
  (await db.migrationQuery('SELECT stock FROM parts WHERE id=$1', [id]))[0].stock;
const sale = (id, quantity = 1, extra = {}) =>
  quickSales.create(
    A,
    { description: id, price: 100, discount: 0, quantity, method: 'Pix', ...extra },
    '2026-10-05',
  );
const save = (id, partId, quantity = 1, extra = {}) =>
  saveOrder(A, id, {
    customer: 'Cliente',
    device: 'Aparelho',
    stage: 'Recebido',
    status: 'Aberto',
    warrantyDays: 90,
    items: [{ partId, quantity }],
    ...extra,
  });
const policy = (enabled) =>
  db.migrationQuery(
    "INSERT INTO shops(account_id,name,phone,profile) VALUES($1,'Loja','11',$2::jsonb) ON CONFLICT(account_id) DO UPDATE SET profile=EXCLUDED.profile",
    [A, JSON.stringify({ allowNegativeStock: enabled })],
  );

test(
  'exact product description links quick sale and records debit and reversal atomically',
  { skip },
  async () => {
    await part('kardex-typed');
    const sold = await sale('kardex-typed', 2);
    assert.equal(sold.partId, 'kardex-typed');
    assert.equal(sold.cost, 80);
    assert.equal(await count('kardex-typed'), 1);
    await quickSales.remove(A, sold.id);
    assert.equal(await count('kardex-typed'), 3);
    const rows = await db.migrationQuery(
      'SELECT source,quantity,stock_before,stock_after FROM stock_movements WHERE part_id=$1 ORDER BY created_at,id',
      ['kardex-typed'],
    );
    assert.deepEqual(
      rows.map((r) => [r.source, r.quantity, r.stock_before, r.stock_after]),
      [
        ['opening', 3, 0, 3],
        ['quick-sale', -2, 3, 1],
        ['sale-reversal', 2, 1, 3],
      ],
    );
    assert.equal(await quickSales.remove(A, sold.id), false);
  },
);
test(
  'negative stock is opt-in and requires explicit acknowledgement for both flows',
  { skip },
  async () => {
    await part('kardex-negative', 0);
    await assert.rejects(sale('kardex-negative'), (e) => e.code === 'INSUFFICIENT_STOCK');
    await policy(true);
    await assert.rejects(sale('kardex-negative'), (e) => e.code === 'INSUFFICIENT_STOCK');
    const sold = await sale('kardex-negative', 1, { acknowledgeNegativeStock: true });
    assert.equal(await count('kardex-negative'), -1);
    await assert.rejects(
      save('order-kardex-negative', 'kardex-negative'),
      (e) => e.code === 'INSUFFICIENT_STOCK',
    );
    await save('order-kardex-negative', 'kardex-negative', 2, { acknowledgeNegativeStock: true });
    assert.equal(await count('kardex-negative'), -3);
    const availability = await stock.availability(A, ['kardex-negative'], 'order-kardex-negative');
    assert.equal(availability.parts[0].available, 2);
    await policy(false);
    await save('order-kardex-negative', 'kardex-negative', 2, { status: 'Cancelado' });
    assert.equal(await count('kardex-negative'), -1);
    await quickSales.remove(A, sold.id);
    assert.equal(await count('kardex-negative'), 0);
  },
);
test(
  'OS quantity differences, cancellation, reopen and delete appear in Kardex',
  { skip },
  async () => {
    await part('kardex-os', 6);
    await save('order-kardex-os', 'kardex-os', 2);
    await save('order-kardex-os', 'kardex-os', 3);
    await save('order-kardex-os', 'kardex-os', 3, { status: 'Cancelado' });
    await save('order-kardex-os', 'kardex-os', 1);
    await orders.remove(A, 'order-kardex-os');
    assert.equal(await count('kardex-os'), 6);
    const rows = await db.migrationQuery(
      'SELECT source,quantity FROM stock_movements WHERE part_id=$1 ORDER BY created_at,id',
      ['kardex-os'],
    );
    assert.deepEqual(
      rows.map((r) => [r.source, r.quantity]),
      [
        ['opening', 6],
        ['order', -2],
        ['order', -1],
        ['order-return', 3],
        ['order', -1],
        ['order-return', 1],
      ],
    );
  },
);
test(
  'concurrent sales cannot oversell and failed sale leaves no ledger debit',
  { skip },
  async () => {
    await part('kardex-last', 1);
    const results = await Promise.allSettled([sale('kardex-last'), sale('kardex-last')]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await count('kardex-last'), 0);
    assert.equal(
      (
        await db.migrationQuery(
          "SELECT id FROM stock_movements WHERE part_id='kardex-last' AND source='quick-sale'",
        )
      ).length,
      1,
    );
  },
);
test(
  'manual adjustments are snapshotted; filters and tenant isolation hold',
  { skip },
  async () => {
    await part('kardex-adjust');
    await part('kardex-other', 2, B);
    await db.tenantQuery(A, 'UPDATE parts SET stock=5 WHERE id=$1', ['kardex-adjust']);
    const rows = await stock.movements(A, {
      from: '2000-01-01',
      to: '2099-12-31',
      source: 'adjustment',
      direction: 'in',
      search: 'kardex-adjust',
    });
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].quantity, 2);
    assert.equal(rows.rows[0].before, 3);
    assert.equal(rows.rows[0].after, 5);
    assert.equal(rows.rows[0].unitCost, 40);
    assert.deepEqual((await stock.availability(A, ['kardex-other'])).parts, []);
    assert.equal((await stock.availability(B, [])).allowNegativeStock, false);
    await assert.rejects(
      db.tenantQuery(A, 'DELETE FROM stock_movements WHERE account_id=$1', [A]),
      (e) => e.code === '42501',
    );
    await db.tenantQuery(A, 'DELETE FROM parts WHERE id=$1', ['kardex-adjust']);
    assert.ok(
      (
        await stock.movements(A, { from: '2000-01-01', to: '2099-12-31', partId: 'kardex-adjust' })
      ).rows.every((r) => r.name === 'kardex-adjust'),
    );
  },
);

test(
  'Kardex cursor preserves microseconds and ties without skipping or duplicating rows',
  { skip },
  async () => {
    await part('kardex-pages', 1);
    await db.migrationQuery(
      `INSERT INTO stock_movements(id,account_id,part_id,name,source,quantity,stock_before,stock_after,unit_cost,created_at)
    SELECT 'kardex-page-'||lpad(n::text,3,'0'),$1,'kardex-pages','Produto','adjustment',1,0,1,10,
      '2026-10-04T03:00:00.123456Z'::timestamptz FROM generate_series(1,201) n`,
      [A],
    );
    const filters = {
      from: '2026-10-04',
      to: '2026-10-04',
      partId: 'kardex-pages',
      source: 'adjustment',
    };
    const first = await stock.movements(A, filters);
    assert.equal(first.rows.length, 100);
    assert.equal(first.nextCursor.createdAt, '2026-10-04T03:00:00.123456Z');
    const second = await stock.movements(A, {
      ...filters,
      before: first.nextCursor.createdAt,
      beforeId: first.nextCursor.id,
    });
    const third = await stock.movements(A, {
      ...filters,
      before: second.nextCursor.createdAt,
      beforeId: second.nextCursor.id,
    });
    assert.equal(third.rows.length, 1);
    assert.equal(third.nextCursor, null);
    assert.equal(
      new Set([...first.rows, ...second.rows, ...third.rows].map((r) => r.id)).size,
      201,
    );
  },
);

test(
  'availability credits existing legacy quantities but requires full stock to reopen cancellation',
  { skip },
  async () => {
    await part('kardex-legacy', 0);
    await db.migrationQuery(
      `INSERT INTO orders(id,account_id,code,customer,device,status) VALUES('order-kardex-legacy',$1,'OS-legacy','Cliente','Moto','Aberto')`,
      [A],
    );
    await db.migrationQuery(
      `INSERT INTO order_items(id,account_id,order_id,part_id,name,quantity,unit_price,unit_cost,stock_quantity) VALUES('kardex-legacy-item',$1,'order-kardex-legacy','kardex-legacy','Tela',3,100,40,0)`,
      [A],
    );
    assert.equal(
      (await stock.availability(A, ['kardex-legacy'], 'order-kardex-legacy')).parts[0].available,
      3,
    );
    await save('order-kardex-legacy', 'kardex-legacy', 3);
    assert.equal(await count('kardex-legacy'), 0);
    await save('order-kardex-legacy', 'kardex-legacy', 3, { status: 'Cancelado' });
    assert.equal(
      (await stock.availability(A, ['kardex-legacy'], 'order-kardex-legacy')).parts[0].available,
      0,
    );
  },
);
