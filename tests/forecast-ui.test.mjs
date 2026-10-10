import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ForecastCard, { forecastExplanation } from '../components/forecast-card.tsx';
import { forecastMonth } from '../lib/forecast.ts';

const render = (forecast) => renderToStaticMarkup(createElement(ForecastCard, { forecast }));
const addDays = (day, amount) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const days = (from, to) => {
  const rows = [];
  for (let day = from; day <= to; day = addDays(day, 1))
    if (new Date(`${day}T12:00:00Z`).getUTCDay() !== 0)
      rows.push({ day, income: 500, cost: 200, looseExpense: 0, billExpense: 0 });
  return rows;
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the forecast shows the likely profit, the floor, where it comes from and how', () => {
  const html = text(
    render(
      forecastMonth({
        asOfDate: '2026-10-07',
        days: days('2026-08-12', '2026-10-07'),
        firstActivity: '2026-08-12',
        pendingBills: [{ amount: 120, dueDate: '2026-10-20' }],
        ready: { income: 0, margin: 0 },
      }),
    ),
  );
  assert.match(html, /Previsão de outubro/);
  assert.match(html, /Onde o mês fecha se os 24 dias que faltam seguirem o ritmo da loja/);
  assert.match(html, /Lucro provável R\$\s*7\.980,00/);
  assert.match(html, /Mínimo de R\$\s*1\.680,00, sem nenhuma venda nova/);
  assert.match(html, /Faturamento previsto R\$\s*13\.500,00\s*\(\s*4% acima de setembro\s*\)/);
  assert.match(html, /faltam R\$\s*454,55 por dia de loja aberta/);
  assert.match(html, /Ritmo dos 24 dias que faltam/);
  assert.match(html, /Contas que ainda vencem/);
  assert.match(html, /Como calculamos/);
  assert.ok(html.includes(forecastExplanation));
  assert.doesNotMatch(html, /Estimativa ainda fraca/);
});

test('a weak or empty history is said plainly', () => {
  const weak = text(
    render(
      forecastMonth({
        asOfDate: '2026-10-07',
        days: days('2026-10-03', '2026-10-07'),
        firstActivity: '2026-10-03',
        pendingBills: [],
        ready: { income: 0, margin: 0 },
      }),
    ),
  );
  assert.match(weak, /Estimativa ainda fraca/);

  const empty = text(
    render(
      forecastMonth({
        asOfDate: '2026-10-07',
        days: [],
        pendingBills: [],
        ready: { income: 0, margin: 0 },
      }),
    ),
  );
  assert.match(empty, /Ainda não há movimento no caixa para prever o mês/);
  assert.doesNotMatch(empty, /Lucro provável/);
  assert.doesNotMatch(empty, /Onde o mês fecha/);
});
