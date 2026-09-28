import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DashboardRoute from '../components/dashboard-route.tsx';

test('dashboard revenue goal exposes accessible progress values', () => {
  const html = renderToStaticMarkup(
    createElement(DashboardRoute, {
      orders: [],
      quotes: [],
      parts: [],
      clients: [],
      payments: [],
      expenses: [],
      messages: [],
    }),
  );

  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, /aria-valuenow="0"/);
});

test('dashboard keeps the existing priority links and revenue calculation', () => {
  const html = renderToStaticMarkup(
    createElement(DashboardRoute, {
      orders: [
        {
          id: 'order-1',
          code: 'OS-1',
          customer: 'Ana',
          status: 'Em andamento',
          stage: 'Recebido',
          createdAt: '2026-09-27',
        },
      ],
      quotes: [{ id: 'quote-1', status: 'Aguardando' }],
      parts: [{ id: 'part-1', stock: 2 }],
      clients: [],
      payments: [{ id: 'payment-1', value: 5000, description: 'Serviço', date: '2026-09-27' }],
      expenses: [],
      messages: [],
    }),
  );

  assert.match(html, /href="\/mesa"/);
  assert.match(html, /href="\/orcamentos"/);
  assert.match(html, /href="\/estoque\?view=inventory"/);
  assert.match(html, /href="\/ordens"/);
  assert.match(html, /aria-valuenow="10"/);
  assert.match(html, /OS-1/);
});

test('recent activity labels wrap instead of clipping long details', () => {
  const label = 'Recebimento por reparo de placa com descrição longa para caber na atividade';
  const html = renderToStaticMarkup(
    createElement(DashboardRoute, {
      orders: [],
      quotes: [],
      parts: [],
      clients: [],
      payments: [{ id: 'payment-long', value: 100, description: label }],
      expenses: [],
      messages: [],
    }),
  );

  assert.match(html, new RegExp(`class="block break-words text-sm font-medium">${label}`));
});
