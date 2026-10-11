import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

// Os dados da previsão saem do caixa, das contas a pagar e das OS prontas.
const skip = skipWithoutDatabase;
let db, forecast;
const A = 'account-forecast';

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  forecast = await import('../lib/repos/forecast.ts');
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ($1, 'forecast', 'Previsão', 'merchant', 'active'),
            ('account-forecast-other', 'forecast-other', 'Outra', 'merchant', 'active')`,
    [A],
  );
  const cash = (id, kind, value, date, extra = {}) =>
    db.migrationQuery(
      `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date, order_id, cost)
       VALUES ($1, $2, $3, 'Lançamento', $4, 'Pix', $5, $6, $7)`,
      [id, extra.account ?? A, kind, value, date, extra.order ?? null, extra.cost ?? null],
    );
  // OS de R$ 400 (R$ 100 de peças), paga pela metade e pronta para retirada.
  await db.migrationQuery(
    `INSERT INTO orders (id, account_id, code, customer, device, total, cost, stage, status)
     VALUES ('order-ready', $1, 'OS-1', 'Ana', 'iPhone', 400, 100, 'Retirada', 'Aberto'),
            ('order-working', $1, 'OS-2', 'Bia', 'Moto', 900, 300, 'Em serviço', 'Aberto')`,
    [A],
  );
  await cash('in-order', 'in', 200, '2026-10-05', { order: 'order-ready' });
  await cash('in-sale', 'in', 80, '2026-10-05', { cost: 30 });
  await cash('in-old', 'in', 500, '2026-09-10');
  await cash('out-coffee', 'out', 15, '2026-10-05');
  await cash('out-rent', 'out', 1800, '2026-10-03');
  await cash('in-other', 'in', 9999, '2026-10-05', { account: 'account-forecast-other' });
  await cash('out-parts', 'out', 500, '2026-10-04');
  await cash('out-rent-nov', 'out', 1800, '2026-10-03');
  await cash('out-tax', 'out', 90, '2026-09-28');
  // O aluguel foi pago por uma conta cadastrada; a internet e o contador ainda não.
  await db.migrationQuery(
    `INSERT INTO payables (id, account_id, description, amount, due_date, status, paid_at,
                           paid_on, paid_amount, cash_entry_id)
     VALUES ('bill-rent', $1, 'Aluguel', 1800, '2026-10-03', 'paid', now(), '2026-10-03',
             1800, 'out-rent')`,
    [A],
  );
  await db.migrationQuery(
    `INSERT INTO payables (id, account_id, description, amount, due_date, status, source,
                           series_id, recurrence, recurrence_day)
     VALUES ('bill-net', $1, 'Internet', 120, '2026-10-20', 'pending', 'fixed', 'serie-net',
             'monthly', 20),
            ('bill-later', $1, 'Contador', 300, '2026-11-05', 'pending', 'other', NULL, NULL, NULL),
            ('bill-parts-next', $1, 'Telas', 300, '2026-10-25', 'pending', 'purchase', NULL, NULL,
             NULL)`,
    [A],
  );
  // Compra de peças paga: o custo das peças já sai de cada OS, não é gasto do mês.
  await db.migrationQuery(
    `INSERT INTO payables (id, account_id, description, amount, due_date, status, source, paid_at,
                           paid_on, paid_amount, cash_entry_id)
     VALUES ('bill-parts', $1, 'Baterias', 500, '2026-10-04', 'paid', 'purchase', now(),
             '2026-10-04', 500, 'out-parts')`,
    [A],
  );
  // Pagas adiantadas: o aluguel de novembro (pago em outubro) é de novembro; o
  // imposto de outubro pago em setembro é de outubro.
  await db.migrationQuery(
    `INSERT INTO payables (id, account_id, description, amount, due_date, status, paid_at,
                           paid_on, paid_amount, cash_entry_id)
     VALUES ('bill-rent-nov', $1, 'Aluguel', 1800, '2026-11-03', 'paid', now(), '2026-10-03',
             1800, 'out-rent-nov'),
            ('bill-tax', $1, 'Imposto', 90, '2026-10-15', 'paid', now(), '2026-09-28', 90,
             'out-tax')`,
    [A],
  );
});
after(async () => db?.drop());

test(
  'collects the month movement, the bills and the ready orders of one shop',
  { skip },
  async () => {
    const input = await forecast.forecastInput(A, '2026-10-07');
    assert.equal(input.asOfDate, '2026-10-07');
    assert.equal(input.firstActivity, '2026-09-10');
    assert.deepEqual(input.days, [
      { day: '2026-09-10', income: 500, cost: 0, looseExpense: 0, billExpense: 0 },
      // O imposto de outubro pago em 28/09 conta no dia 1º de outubro.
      { day: '2026-10-01', income: 0, cost: 0, looseExpense: 0, billExpense: 90 },
      // Só o aluguel de outubro: o de novembro, pago no mesmo dia, fica para novembro.
      { day: '2026-10-03', income: 0, cost: 0, looseExpense: 0, billExpense: 1800 },
      // A compra de peças paga não conta como saída.
      { day: '2026-10-04', income: 0, cost: 0, looseExpense: 0, billExpense: 0 },
      // Recebimento da OS: custo proporcional (metade de R$ 100); venda avulsa: R$ 30.
      { day: '2026-10-05', income: 280, cost: 80, looseExpense: 15, billExpense: 0 },
    ]);
    assert.deepEqual(input.pendingBills, [
      { amount: 120, dueDate: '2026-10-20', recurrence: 'monthly', recurrenceDay: 20 },
    ]);
    // Falta receber R$ 200 da OS pronta; margem de 75% → R$ 150. A OS em serviço não entra.
    assert.deepEqual(input.ready, { income: 200, margin: 150 });

    const month = await forecast.monthForecast(A, '2026-10-07');
    assert.equal(month.realized.income, 280);
    assert.equal(month.realized.expense, 1905);
    assert.equal(month.bills, 120);
    assert.equal(month.floor.profit, 200 - 1905 + 150 - 120);
  },
);
