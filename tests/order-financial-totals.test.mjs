import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, cash;
before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(`INSERT INTO accounts (id,username,name,role,status,password_hash) VALUES
    ('totals-owner','totals-owner','Owner','merchant','active','x'),
    ('totals-other','totals-other','Other','merchant','active','x')`);
  await db.migrationQuery(`INSERT INTO orders (id,account_id,code,customer,device,total,cost,status) VALUES
    ('paid','totals-owner','OS-1','Ana','Moto',100,40,'Concluído'),
    ('unpaid','totals-owner','OS-2','Ana','Moto',200,80,'Aberto'),
    ('partial','totals-owner','OS-3','Ana','Moto',120,60,'Concluído'),
    ('overpaid','totals-owner','OS-4','Ana','Moto',50,20,'Concluído'),
    ('free','totals-owner','OS-5','Ana','Moto',0,10,'Aberto'),
    ('loss','totals-owner','OS-6','Ana','Moto',20,40,'Aberto'),
    ('cancelled','totals-owner','OS-7','Ana','Moto',999,500,'Cancelado'),
    ('foreign','totals-other','OS-1','Other','Moto',777,7,'Aberto')`);
  await db.migrationQuery(`INSERT INTO cash_entries (id,account_id,kind,description,value,order_id) VALUES
    ('paid-receipt','totals-owner','in','OS',100,'paid'),
    ('partial-receipt','totals-owner','in','OS',30,'partial'),
    ('overpaid-receipt','totals-owner','in','OS',55,'overpaid'),
    ('unrelated','totals-owner','in','Other',999,NULL),
    ('expense','totals-owner','out','Expense',999,NULL)`);
  cash = await import('../lib/repos/cash.ts');
});
after(async () => db?.drop());

test(
  'totals order margins and remaining balances without counting cancellations or unrelated cash',
  { skip },
  async () => {
    assert.deepEqual(await cash.orderFinancialTotals('totals-owner'), {
      gross: 490,
      net: 240,
      grossReceivable: 310,
      netReceivable: 145,
    });
    assert.deepEqual(await cash.orderFinancialTotals('totals-other'), {
      gross: 777,
      net: 770,
      grossReceivable: 777,
      netReceivable: 770,
    });
  },
);

test('returns zero totals when the account has no orders', { skip }, async () => {
  await db.migrationQuery(`INSERT INTO accounts (id,username,name,role,status,password_hash)
    VALUES ('totals-empty','totals-empty','Empty','merchant','active','x')`);
  assert.deepEqual(await cash.orderFinancialTotals('totals-empty'), {
    gross: 0,
    net: 0,
    grossReceivable: 0,
    netReceivable: 0,
  });
});
