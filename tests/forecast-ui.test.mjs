import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FinanceTabs from '../components/finance-tabs.tsx';
import ProfitForecast, {
  ForecastSummary,
  forecastExplanation,
} from '../components/profit-forecast.tsx';
import { forecastMonth } from '../lib/forecast.ts';

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
const render = (component, forecast) =>
  renderToStaticMarkup(createElement(component, { forecast }));

const steady = forecastMonth({
  asOfDate: '2026-10-07',
  days: days('2026-08-12', '2026-10-07'),
  firstActivity: '2026-08-12',
  pendingBills: [{ amount: 120, dueDate: '2026-10-20' }],
  ready: { income: 0, margin: 0 },
});
const weak = forecastMonth({
  asOfDate: '2026-10-07',
  days: days('2026-10-03', '2026-10-07'),
  firstActivity: '2026-10-03',
  pendingBills: [],
  ready: { income: 0, margin: 0 },
});
const empty = forecastMonth({
  asOfDate: '2026-10-07',
  days: [],
  pendingBills: [],
  ready: { income: 0, margin: 0 },
});

test('the projected profit tab shows the numbers, the chart, the breakdown and the scenarios', () => {
  const html = text(render(ProfitForecast, steady));
  assert.match(html, /Previsão de outubro/);
  assert.match(html, /Onde o mês fecha se os 24 dias que faltam seguirem o ritmo da loja/);
  assert.match(html, /Lucro até hoje R\$\s*1\.800,00 De 01\/10 a 07\/10/);
  assert.match(html, /Média por dia aberto R\$\s*300,00/);
  assert.match(html, /Dias restantes 24 dias 22 com a loja aberta, até 31\/10/);
  assert.match(html, /Lucro projetado R\$\s*7\.980,00 Mínimo de R\$\s*1\.680,00, sem vendas novas/);
  assert.match(
    html,
    /Lucro acumulado em outubro: R\$\s*1\.800,00 até hoje e projeção de R\$\s*7\.980,00 no fim do mês/,
  );
  assert.match(html, /Faturamento previsto R\$\s*13\.500,00\s*\(\s*4% acima de setembro\s*\)/);
  assert.match(html, /faltam R\$\s*454,55 por dia de loja aberta/);
  assert.match(html, /Ritmo dos 24 dias que faltam/);
  assert.match(html, /Contas que ainda vencem/);
  assert.match(html, /Mínimo Sem nenhuma venda nova R\$\s*1\.680,00/);
  assert.match(html, /Conservador Ritmo das 2 semanas mais fracas R\$\s*7\.980,00/);
  assert.match(html, /Realista Ritmo normal da loja R\$\s*7\.980,00/);
  assert.match(html, /Otimista Ritmo das 2 semanas mais fortes R\$\s*7\.980,00/);
  assert.ok(html.includes(forecastExplanation));
  assert.doesNotMatch(html, /Estimativa ainda fraca/);
});

test('a weak or empty history is said plainly', () => {
  const short = text(render(ProfitForecast, weak));
  assert.match(short, /Estimativa ainda fraca/);
  assert.match(short, /Os cenários conservador e otimista aparecem com 4 semanas de movimento/);
  assert.doesNotMatch(short, /Conservador Ritmo/);

  const none = text(render(ProfitForecast, empty));
  assert.match(none, /Ainda não há movimento no caixa para prever o mês/);
  assert.doesNotMatch(none, /Lucro projetado/);
  assert.doesNotMatch(none, /Onde o mês fecha/);
});

test('the dashboard shows only a one-line summary that leads to the full projection', () => {
  const html = render(ForecastSummary, steady);
  assert.match(
    text(html),
    /Lucro projetado para outubro R\$\s*7\.980,00 mínimo de R\$\s*1\.680,00 sem vendas novas/,
  );
  assert.match(html, /href="\/receber-e-pagar\/lucros"[^>]*>Ver projeção</);
  assert.doesNotMatch(text(html), /Cenários|Evolução do lucro/);
  assert.match(text(render(ForecastSummary, weak)), /estimativa ainda fraca/);
  assert.equal(render(ForecastSummary, empty), '');
});

test('the finance tabs link both sections and mark the current one', () => {
  const html = renderToStaticMarkup(createElement(FinanceTabs, { current: 'profit' }));
  assert.match(html, /href="\/receber-e-pagar"[^>]*>.*Receber e pagar/);
  assert.match(html, /aria-current="page"[^>]*href="\/receber-e-pagar\/lucros"/);
});
