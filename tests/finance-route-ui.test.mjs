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
    methods: [{ method: 'Pix', value: 490 }],
  },
  month: {
    current: { income: 890, expense: 120, balance: 770 },
    previous: { income: 900, expense: 0, balance: 900 },
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
const html = () =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(
        FeedbackProvider,
        null,
        createElement(FinanceRoute, { initialHistory: [], summary }),
      ),
    ),
  );

test('shows the daily close with the breakdown by method', () => {
  const markup = html();
  assert.match(markup, /Hoje/);
  assert.match(markup, /Pix/);
});

test('labels the monthly comparison as the same elapsed period', () => {
  assert.match(html(), /Mesmo período anterior/i);
});

test('keeps the receivable total separate from the reconciliation block', () => {
  const markup = html();
  assert.match(markup, /A receber/i);
  assert.match(markup, /Conferir/i);
});
