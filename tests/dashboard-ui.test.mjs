import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DashboardRoute from '../components/dashboard-route.tsx';
import { FeedbackProvider } from '../components/feedback.tsx';

const totals = (income, expense = 0) => ({ income, expense, balance: income - expense });
const base = {
  asOfDate: '2026-10-03',
  actions: [],
  bench: [
    { stage: 'Recebido', orders: 1 },
    { stage: 'Diagnóstico', orders: 1 },
    { stage: 'Aguardando aprovação', orders: 0 },
    { stage: 'Em reparo', orders: 2 },
    { stage: 'Teste final', orders: 1 },
    { stage: 'Retirada', orders: 1 },
  ],
  today: { ...totals(105), methods: [{ method: 'Pix', value: 60 }] },
  movements: [],
  month: { current: totals(1425), previous: totals(1240) },
};
const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(FeedbackProvider, null, createElement(DashboardRoute, { ...base, ...props })),
  );

test('opens on today, with the date in Portuguese', () => {
  const html = render();
  assert.match(html, />Hoje</);
  assert.match(html, /Sábado, 3 de outubro/);
});

test('names who to act on, why, and the one action to take', () => {
  const html = render({
    actions: [
      { kind: 'overdue', id: 'b1', who: 'Enel', what: 'Conta de energia', amount: 412.35, days: 2 },
      {
        kind: 'ready',
        id: 'o42',
        code: 'OS-42',
        who: 'Rafael Lima',
        what: 'Galaxy S22',
        phone: '11976542345',
        amount: 280,
        days: 1,
      },
      { kind: 'restock', id: 'p1', who: 'Bateria Moto G84', days: 0 },
      {
        kind: 'charge',
        id: 'o48',
        code: 'OS-48',
        who: 'Thiago Martins',
        what: 'iPhone 14 Pro',
        amount: 520,
        days: 1,
      },
    ],
  });
  assert.match(html, /Concluída, falta receber R\$\s*520,00/);
  assert.match(html, />Receber</);
  assert.match(html, /Rafael Lima/);
  assert.match(html, /Pronto para retirada há 1 dia/);
  assert.match(html, />Avisar</);
  assert.match(html, /Vencida há 2 dias, R\$\s*412,35/);
  assert.match(html, />Pagar</);
  assert.match(html, /href="\/contas-pagar\?pagar=b1"[^>]*>Pagar</);
  assert.match(html, />Repor</);
});

test('falls back to opening the order when the phone cannot receive WhatsApp', () => {
  const html = render({
    actions: [
      { kind: 'ready', id: 'o46', code: 'OS-46', who: 'Lucas', what: 'Galaxy A54', days: 0 },
    ],
  });
  assert.doesNotMatch(html, />Avisar</);
  assert.match(html, /href="\/ordens\?busca=OS-46"/);
});

// Vermelho fica reservado a dinheiro atrasado.
test('uses the alarm color only for late money', () => {
  const late = render({
    actions: [{ kind: 'overdue', id: 'b1', who: 'Enel', amount: 10, days: 1 }],
  });
  const calm = render({
    actions: [{ kind: 'restock', id: 'p1', who: 'Película', days: 0 }],
  });
  assert.match(late, /text-destructive/);
  assert.doesNotMatch(calm, /text-destructive/);
});

test('says when there is nothing waiting', () => {
  assert.match(render(), /Tudo em dia/);
});

test("shows today's cash and the month against the same days of last month", () => {
  const html = render();
  assert.match(html, /Caixa de hoje/);
  assert.match(html, /R\$\s*105,00/);
  assert.match(html, /Outubro até hoje/);
  assert.match(html, /\+R\$\s*185,00 \(\+15%\) em relação ao mesmo período de setembro/);
});

test('does not divide by zero when last month had nothing', () => {
  const html = render({ month: { current: totals(500), previous: totals(0) } });
  assert.match(html, /Sem recebimentos no mesmo período de setembro/);
  assert.doesNotMatch(html, /Infinity|NaN/);
});

test('counts the bench by stage', () => {
  const html = render();
  assert.match(html, /6 aparelhos em serviço/);
  assert.match(html, /Na bancada/);
});
