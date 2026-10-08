import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider } from '../components/feedback.tsx';
import StockRoute from '../components/stock-route.tsx';

const parts = [
  {
    id: 'part-1',
    name: 'Película 3D iPhone 15',
    category: 'Películas',
    stock: 40,
    cost: 12,
    price: 60,
    published: true,
  },
];
const render = (initialView) =>
  renderToStaticMarkup(
    createElement(
      FeedbackProvider,
      null,
      createElement(StockRoute, { accountId: 'account-1', initialParts: parts, initialView }),
    ),
  );

test('a product card opens the product record', () => {
  const html = render('catalog');
  assert.match(
    html,
    /<button[^>]*aria-label="Ver produto Película 3D iPhone 15"[^>]*>Película 3D iPhone 15</,
  );
  assert.match(html, /after:absolute after:inset-0/);
  // Marcar "Na vitrine" e o menu ficam por cima da área clicável do cartão.
  assert.match(html, /relative z-10[^"]*border-t/);
});

test('an inventory row opens the product record, on desktop and mobile', () => {
  const html = render('inventory');
  const openers = html.match(/aria-label="Ver produto Película 3D iPhone 15"/g) || [];
  assert.equal(openers.length, 2);
  assert.match(html, /<tr\b[^>]*cursor-pointer/);
});
