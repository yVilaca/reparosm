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
    { stage: 'Aguardando Peça', orders: 0 },
    { stage: 'Em serviço', orders: 4 },
    { stage: 'Retirada', orders: 1 },
    { stage: 'Concluído', orders: 0 },
  ],
  today: { ...totals(105), methods: [{ method: 'Pix', value: 60 }] },
  movements: [],
  orderTotals: { gross: 1234.56, net: 789.01, grossReceivable: 345.67, netReceivable: 234.56 },
  trend: [{ month: '2026-10-01', ...totals(1425), paidOrders: 3, averageTicket: 475 }],
};
const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(FeedbackProvider, null, createElement(DashboardRoute, { ...base, ...props })),
  );

test('opens on the assistance overview, with the date in Portuguese', () => {
  const html = render();
  assert.match(html, />Visão da assistência</);
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
  assert.match(html, /href="\/receber-e-pagar\?pagar=b1"[^>]*>Pagar</);
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

test("keeps today's cash separate from order totals", () => {
  const html = render();
  assert.match(html, /Caixa de hoje/);
  assert.match(html, /R\$\s*105,00/);
});

test('shows empty order totals as zero amounts', () => {
  const html = render({ orderTotals: { gross: 0, net: 0, grossReceivable: 0, netReceivable: 0 } });
  const cards = html.match(/<section aria-label="Totais financeiros"[\s\S]*?<\/section>/)?.[0];
  assert.equal((cards?.match(/R\$\s*0,00/g) || []).length, 4);
  assert.doesNotMatch(html, /Infinity|NaN/);
});

test('counts the bench by stage', () => {
  const html = render();
  assert.match(html, /6 aparelhos em serviço/);
  assert.match(html, /Fluxo dos aparelhos/);
  assert.ok(html.indexOf('Total Bruto') < html.indexOf('Fluxo dos aparelhos'));
});

test('describes received amounts separately from pending order balances and margins', () => {
  const html = render();
  assert.match(html, /Total Bruto[\s\S]*?R\$\s*1\.234,56/);
  assert.match(html, /Total Líquido[\s\S]*?R\$\s*789,01/);
  assert.match(html, /Bruto a receber[\s\S]*?R\$\s*345,67/);
  assert.match(html, /Líquido a receber[\s\S]*?R\$\s*234,56/);
  assert.match(html, /Valores recebidos de OS não canceladas e vendas avulsas/);
  assert.match(html, /Resultado de OS e vendas avulsas, sem a margem ainda a receber/);
  assert.match(html, /Saldo pendente apenas das OS, após os recebimentos/);
  assert.match(html, /Margem das OS proporcional ao saldo ainda a receber/);
  assert.match(html, /Evolução do caixa/);
  assert.doesNotMatch(html, /Lucro líquido/);
  assert.ok(html.indexOf('Evolução do caixa') < html.indexOf('Bancada e aprovações'));
});

test('separates workshop, pickup and management priorities', () => {
  const html = render({
    actions: [
      { kind: 'stalled', id: 'o1', who: 'Cliente urgente', what: 'Moto G54', days: 3 },
      { kind: 'ready', id: 'o2', who: 'Cliente retirada', what: 'Galaxy A54', days: 2 },
      { kind: 'overdue', id: 'b1', who: 'Energia vencida', amount: 100, days: 4 },
    ],
  });
  assert.match(html, /Bancada e aprovações/);
  assert.match(html, /Retiradas e recebimentos/);
  assert.match(html, /Gestão da loja/);
  assert.ok(html.indexOf('Cliente urgente') < html.indexOf('Cliente retirada'));
  assert.ok(html.indexOf('Cliente retirada') < html.indexOf('Energia vencida'));
});
