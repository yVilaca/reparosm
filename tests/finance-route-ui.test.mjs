import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { FeedbackProvider } from '../components/feedback.tsx';
import FinanceRoute from '../components/finance-route.tsx';

const summary = {
  today: {
    income: 790,
    expense: 120,
    balance: 670,
    cost: 190,
    net: 600,
    methods: [{ method: 'Pix', value: 490 }],
  },
  month: {
    current: { income: 890, expense: 120, balance: 770, cost: 200, net: 690 },
    previous: { income: 900, expense: 0, balance: 900, cost: 300, net: 600 },
  },
  receivables: {
    ready: {
      orders: 1,
      amount: 350,
      list: [{ id: 'order-1', code: 'OS-1', customer: 'Ana', total: 350 }],
    },
    inProgress: { orders: 1, amount: 200 },
  },
  review: {
    divergent: { orders: 2, toCollect: 50, overpaid: 0.01 },
    cancelledPaid: { orders: 1, amount: 250 },
  },
};

const router = {
  back() {},
  forward() {},
  prefetch: async () => {},
  push() {},
  refresh() {},
  replace() {},
};
const html = (initialSection) =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(
        FeedbackProvider,
        null,
        createElement(FinanceRoute, {
          initialHistory: [
            {
              id: 'receipt',
              kind: 'in',
              description: 'OS recebida',
              value: 790,
              cost: 190,
              method: 'Pix',
              date: '2026-10-05',
              createdAt: '2026-10-05T12:00:00Z',
              reference: null,
              order: null,
            },
            {
              id: 'expense',
              kind: 'out',
              description: 'Aluguel',
              value: 120,
              cost: 0,
              method: 'Pix',
              date: '2026-10-05',
              createdAt: '2026-10-05T13:00:00Z',
              reference: null,
              order: null,
            },
          ],
          summary,
          initialSection,
        }),
      ),
    ),
  );

test('shows the daily close with the breakdown by method', () => {
  const markup = html();
  assert.match(markup, /Hoje/);
  assert.match(markup, /Pix/);
  assert.match(markup, /Total Bruto[\s\S]*?790,00/);
  assert.match(markup, /Total Líquido[\s\S]*?600,00/);
  assert.match(markup, /Custos: R\$\s*190,00/);
  assert.match(markup, /Período do financeiro/);
  assert.match(markup, /Aplicar/);
});

test('keeps the monthly comparison in the analysis section', () => {
  assert.match(html('analysis'), /Mesmo período anterior/i);
});

test('keeps the overview focused on receivables', () => {
  const markup = html();
  assert.match(markup, /A receber/i);
  assert.match(markup, /Análise/i);
  assert.doesNotMatch(markup, /Conferir/i);
});
