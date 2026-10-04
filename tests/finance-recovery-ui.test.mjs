import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { FeedbackProvider } from '../components/feedback.tsx';
import FinanceRoute from '../components/finance-route.tsx';

const summary = {
  today: { income: 0, expense: 0, balance: 0, methods: [] },
  month: {
    current: { income: 0, expense: 0, balance: 0 },
    previous: { income: 0, expense: 0, balance: 0 },
  },
  receivables: {
    ready: {
      orders: 1,
      amount: 350,
      list: [{ id: 'order-1', code: 'OS-1', customer: 'Ana', total: 350 }],
    },
    inProgress: { orders: 0, amount: 0 },
  },
  review: {
    divergent: { orders: 0, toCollect: 0, overpaid: 0 },
    cancelledPaid: { orders: 0, amount: 0 },
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

const render = (element) =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(FeedbackProvider, null, element),
    ),
  );

test('offers to record the payment of an order waiting for pickup', () => {
  const markup = render(createElement(FinanceRoute, { initialHistory: [], summary }));
  assert.match(markup, /OS-1/);
  assert.match(markup, /Registrar recebimento/i);
  // No celular, a linha empilha: nome em cima, valor e ação embaixo.
  assert.match(markup, /basis-full[^"]*sm:flex-1/);
  assert.match(markup, /href="\/receber-e-pagar\?ver=receber"/);
});

test('links a history row to the order in the list', () => {
  const markup = render(
    createElement(FinanceRoute, {
      initialHistory: [
        {
          id: 'hist-1',
          kind: 'in',
          description: 'OS-9',
          reference: null,
          method: 'Pix',
          date: '2026-03-31',
          value: 350,
          order: { id: 'order-hist', code: 'OS-9' },
        },
      ],
      summary,
      initialSection: 'entries',
    }),
  );
  assert.match(markup, /href="\/ordens\?busca=OS-9"/);
});
