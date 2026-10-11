import assert from 'node:assert/strict';
import { test } from 'node:test';
import { billsUntil, forecastMonth } from '../lib/forecast.ts';

const addDays = (day, amount) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** Loja que vende R$ 500 por dia (R$ 200 de peças) de segunda a sábado e fecha domingo. */
function steadyShop(from, to, extra = {}) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const open = weekday(day) !== 0;
    const row = {
      day,
      income: open ? 500 : 0,
      cost: open ? 200 : 0,
      looseExpense: 0,
      billExpense: 0,
      ...extra[day],
    };
    if (row.income || row.looseExpense || row.billExpense) days.push(row);
  }
  return days;
}

test('a lumpy bill does not repeat every week: rent is counted once', () => {
  // Aluguel de R$ 1.800 pago no dia 3. A "primeira semana × 4" projetaria quatro
  // aluguéis; aqui o aluguel entra uma vez e os dias que faltam seguem o ritmo.
  const forecast = forecastMonth({
    asOfDate: '2026-10-07',
    days: steadyShop('2026-08-12', '2026-10-07', {
      '2026-09-03': { billExpense: 1800 },
      '2026-10-03': { billExpense: 1800 },
    }),
    firstActivity: '2026-08-12',
    pendingBills: [{ amount: 120, dueDate: '2026-10-20' }],
    ready: { income: 0, margin: 0 },
  });
  assert.equal(forecast.month, '2026-10');
  // 1 a 7 de outubro: 6 dias abertos (domingo, dia 4, fechado).
  assert.deepEqual(forecast.realized, { income: 3000, margin: 1800, expense: 1800, profit: 0 });
  // 8 a 31: 24 dias, 3 domingos → 21 dias de R$ 500 (R$ 300 de margem).
  assert.equal(forecast.daysLeft, 24);
  assert.deepEqual(forecast.estimated, { income: 10500, margin: 6300, looseExpense: 0 });
  assert.equal(forecast.bills, 120);
  assert.deepEqual(forecast.likely, { income: 13500, margin: 8100, profit: 6180 });
  assert.equal(forecast.floor.profit, -120, 'sem vendas novas, só a conta que vence');
  // Setembro: 26 dias abertos, um aluguel.
  assert.deepEqual(forecast.previous, {
    month: '2026-09',
    income: 13000,
    margin: 7800,
    profit: 6000,
    complete: true,
  });
  // Faltam R$ 10.000 para igualar setembro em 22 dias de loja aberta (hoje + 21).
  assert.equal(forecast.openDaysLeft, 22);
  assert.equal(forecast.perOpenDayToMatchPrevious, 454.55);
  assert.equal(forecast.confidence, 'ok');
  assert.equal(forecast.perOpenDay, 300, 'margem de um dia aberto, sem contas');
  // Semanas iguais: os cenários coincidem com o provável.
  assert.deepEqual(forecast.scenarios, { weeks: 8, conservative: 6180, optimistic: 6180 });
});

test('the daily series goes from the real profit to the projected one', () => {
  const forecast = forecastMonth({
    asOfDate: '2026-10-07',
    days: steadyShop('2026-08-12', '2026-10-07', { '2026-10-03': { billExpense: 1800 } }),
    firstActivity: '2026-08-12',
    pendingBills: [{ amount: 120, dueDate: '2026-10-20' }],
    ready: { income: 0, margin: 0 },
  });
  const point = (day) => forecast.series.find((item) => item.day === day);
  assert.equal(forecast.series.length, 31);
  assert.deepEqual(point('2026-10-02'), { day: '2026-10-02', actual: 600, projected: null });
  // Dia 3: venda de R$ 300 de margem e o aluguel de R$ 1.800.
  assert.deepEqual(point('2026-10-03'), { day: '2026-10-03', actual: -900, projected: null });
  // Hoje: as duas linhas se encontram.
  assert.deepEqual(point('2026-10-07'), { day: '2026-10-07', actual: 0, projected: 0 });
  assert.deepEqual(point('2026-10-08'), { day: '2026-10-08', actual: null, projected: 300 });
  // A conta de R$ 120 sai no vencimento, numa terça de R$ 300 de margem.
  assert.equal(point('2026-10-20').projected - point('2026-10-19').projected, 180);
  assert.equal(forecast.series.at(-1).projected, forecast.likely.profit);
});

test('scenarios repeat the weakest and the strongest weeks in the days left', () => {
  // Duas semanas pela metade e duas 50% acima: a semana média não muda.
  const extra = {};
  for (const [from, to, factor] of [
    ['2026-08-12', '2026-08-25', 0.5],
    ['2026-08-26', '2026-09-08', 1.5],
  ])
    for (let day = from; day <= to; day = addDays(day, 1))
      if (weekday(day) !== 0) extra[day] = { income: 500 * factor, cost: 200 * factor };
  const forecast = forecastMonth({
    asOfDate: '2026-10-07',
    days: steadyShop('2026-08-12', '2026-10-07', extra),
    firstActivity: '2026-08-12',
    pendingBills: [],
    ready: { income: 0, margin: 0 },
  });
  assert.equal(forecast.likely.profit, 1800 + 6300);
  assert.deepEqual(forecast.scenarios, {
    weeks: 8,
    conservative: 1800 + 6300 * 0.5,
    optimistic: 1800 + 6300 * 1.5,
  });
});

test('bills due by month end count once each, with recurring and overdue ones', () => {
  assert.equal(
    billsUntil(
      [
        // Semanal: 9, 16, 23 e 30 de outubro.
        { amount: 100, dueDate: '2026-10-09', recurrence: 'weekly' },
        // Mensal atrasada de setembro e a de outubro.
        { amount: 200, dueDate: '2026-09-28', recurrence: 'monthly', recurrenceDay: 28 },
        { amount: 999, dueDate: '2026-11-05' },
      ],
      '2026-10-31',
    ),
    800,
  );
});

test('loose expenses repeat as a daily average, without the atypical days', () => {
  // R$ 30 de gastos em cada dia aberto e, num sábado, R$ 1.000 de uma vez (mais
  // que as vendas de um dia típico): esse dia não entra na média e não se repete.
  const extra = {};
  for (let day = '2026-08-12'; day <= '2026-10-07'; day = addDays(day, 1))
    if (weekday(day) !== 0) extra[day] = { looseExpense: 30 };
  extra['2026-09-19'] = { looseExpense: 1030 };
  const forecast = forecastMonth({
    asOfDate: '2026-10-07',
    days: steadyShop('2026-08-12', '2026-10-07', extra),
    firstActivity: '2026-08-12',
    pendingBills: [],
    ready: { income: 0, margin: 0 },
  });
  // 56 dias de histórico, 47 dias comuns com R$ 30; hoje já gastou mais que a média.
  const perDay = (47 * 30) / 56;
  assert.equal(forecast.estimated.looseExpense, Math.round(24 * perDay * 100) / 100);
  assert.equal(forecast.perOpenDay, Math.round((300 - perDay) * 100) / 100);
  // No realizado, os gastos de outubro entram todos.
  assert.equal(forecast.realized.expense, 6 * 30);
});

test('today counts only what is still missing to reach a typical day', () => {
  const history = steadyShop('2026-08-12', '2026-10-06');
  const run = (todayIncome) =>
    forecastMonth({
      asOfDate: '2026-10-07',
      days: [
        ...history,
        { day: '2026-10-07', income: todayIncome, cost: 0, looseExpense: 0, billExpense: 0 },
      ],
      firstActivity: '2026-08-12',
      pendingBills: [],
      ready: { income: 0, margin: 0 },
    });
  const slow = run(200);
  const busy = run(900);
  // Dia típico de quarta: R$ 500. Com R$ 200 feitos, faltam R$ 300 (margem de 60%).
  assert.equal(slow.estimated.income - busy.estimated.income, 300);
  assert.equal(slow.estimated.margin - busy.estimated.margin, 180);
  assert.equal(busy.estimated.income, 10500, 'dia acima do típico não soma nada a mais');
});

test('a new shop uses the days it has and says the estimate is weak', () => {
  const forecast = forecastMonth({
    asOfDate: '2026-10-07',
    days: steadyShop('2026-10-03', '2026-10-07'),
    firstActivity: '2026-10-03',
    pendingBills: [],
    ready: { income: 0, margin: 0 },
  });
  assert.equal(forecast.historyDays, 4);
  assert.equal(forecast.confidence, 'low');
  assert.equal(forecast.scenarios, null, 'menos de 4 semanas completas');
  // Setembro não existiu para a loja: nada de comparar com ele.
  assert.equal(forecast.previous.complete, false);
  assert.equal(forecast.perOpenDayToMatchPrevious, 0);
  // Quinta e sexta ainda não apareceram: usam a média geral (3 dias abertos em 4).
  assert.ok(forecast.estimated.income > 0);

  const empty = forecastMonth({
    asOfDate: '2026-10-07',
    days: [],
    pendingBills: [],
    ready: { income: 0, margin: 0 },
  });
  assert.equal(empty.confidence, 'none', 'sem nenhum movimento, não há ritmo');
  assert.equal(empty.likely.profit, 0);
  const brandNew = forecastMonth({
    asOfDate: '2026-10-07',
    days: [],
    firstActivity: '2026-10-07',
    pendingBills: [],
    ready: { income: 0, margin: 0 },
  });
  assert.equal(brandNew.confidence, 'none');
});

test('ready orders set the floor; the likely profit never falls below it', () => {
  const forecast = forecastMonth({
    asOfDate: '2026-10-28',
    days: [],
    firstActivity: '2026-10-27',
    pendingBills: [{ amount: 300, dueDate: '2026-10-30' }],
    ready: { income: 2000, margin: 1200 },
  });
  assert.equal(forecast.floor.profit, 900);
  assert.equal(forecast.likely.profit, 900);
  assert.equal(forecast.likely.income, 2000);
  assert.equal(forecast.basis, 'ready');
  // A projeção recebe as OS prontas no dia seguinte e paga a conta no vencimento.
  assert.deepEqual(
    forecast.series.slice(-4).map((point) => point.projected),
    [0, 1200, 900, 900],
  );
});
