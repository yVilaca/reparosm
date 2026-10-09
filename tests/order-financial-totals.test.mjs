import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, cash, quickSales;
before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(`INSERT INTO accounts (id,username,name,role,status) VALUES
    ('totals-owner','totals-owner','Owner','merchant','active'),
    ('totals-other','totals-other','Other','merchant','active')`);
  await db.migrationQuery(`INSERT INTO orders (id,account_id,code,customer,device,total,cost,status) VALUES
    ('paid','totals-owner','OS-1','Ana','Moto',100,40,'Concluído'),
    ('unpaid','totals-owner','OS-2','Ana','Moto',200,80,'Aberto'),
    ('partial','totals-owner','OS-3','Ana','Moto',120,60,'Concluído'),
    ('overpaid','totals-owner','OS-4','Ana','Moto',50,20,'Concluído'),
    ('free','totals-owner','OS-5','Ana','Moto',0,10,'Aberto'),
    ('loss','totals-owner','OS-6','Ana','Moto',20,40,'Aberto'),
    ('cancelled','totals-owner','OS-7','Ana','Moto',999,500,'Cancelado'),
    ('foreign','totals-other','OS-1','Other','Moto',777,7,'Aberto')`);
  await db.migrationQuery(`INSERT INTO cash_entries
    (id,account_id,kind,description,value,cost,quantity,discount,order_id) VALUES
    ('paid-receipt','totals-owner','in','OS',100,NULL,1,NULL,'paid'),
    ('partial-receipt','totals-owner','in','OS',30,NULL,1,NULL,'partial'),
    ('overpaid-receipt','totals-owner','in','OS',55,NULL,1,NULL,'overpaid'),
    ('cancelled-receipt','totals-owner','in','OS',999,NULL,1,NULL,'cancelled'),
    ('sale','totals-owner','in','Sale',90,30,3,10,NULL),
    ('legacy-receipt','totals-owner','in','Other',25,NULL,1,NULL,NULL),
    ('foreign-sale','totals-other','in','Sale',123,23,1,0,NULL),
    ('expense','totals-owner','out','Expense',999,NULL,1,NULL,NULL)`);
  cash = await import('../lib/repos/cash.ts');
  quickSales = await import('../lib/repos/quick-sales.ts');
});
after(async () => db?.drop());

test(
  'totals only received order amounts and standalone sales, keeping pending margins separate',
  { skip },
  async () => {
    assert.deepEqual(await cash.orderFinancialTotals('totals-owner'), {
      gross: 295,
      net: 180,
      grossReceivable: 310,
      netReceivable: 145,
    });
    assert.deepEqual(await cash.orderFinancialTotals('totals-other'), {
      gross: 123,
      net: 100,
      grossReceivable: 777,
      netReceivable: 770,
    });
  },
);

test(
  'undoing a standalone sale removes its revenue and margin without changing order balances',
  { skip },
  async () => {
    assert.equal(await quickSales.remove('totals-owner', 'sale'), true);
    assert.deepEqual(await cash.orderFinancialTotals('totals-owner'), {
      gross: 205,
      net: 120,
      grossReceivable: 310,
      netReceivable: 145,
    });
  },
);

test('returns zero totals when the account has no orders or receipts', { skip }, async () => {
  await db.migrationQuery(`INSERT INTO accounts (id,username,name,role,status)
    VALUES ('totals-empty','totals-empty','Empty','merchant','active')`);
  assert.deepEqual(await cash.orderFinancialTotals('totals-empty'), {
    gross: 0,
    net: 0,
    grossReceivable: 0,
    netReceivable: 0,
  });
});

test(
  'receiving the remaining order balance transfers its amount and margin to received totals',
  { skip },
  async () => {
    await db.migrationQuery(`UPDATE cash_entries SET value = 120 WHERE id = 'partial-receipt'`);
    assert.deepEqual(await cash.orderFinancialTotals('totals-owner'), {
      gross: 295,
      net: 165,
      grossReceivable: 220,
      netReceivable: 100,
    });
  },
);
