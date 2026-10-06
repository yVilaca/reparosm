import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider } from '../components/feedback.tsx';
import * as stock from '../components/stock-route.tsx';

const parts = [
  { id: 'a', name: 'Áudio', sku: 'F-1', category: 'Fones', stock: -2, price: 30, published: false },
  { id: 'b', name: 'Cabo', sku: 'C-1', category: 'Cabos', stock: 0, price: 10, published: true },
  { id: 'c', name: 'Bateria', sku: 'B-1', category: 'Peças', stock: 5, price: 40, published: true },
  { id: 'd', name: 'Tela', sku: 'T-1', category: 'Peças', stock: 6, price: 50 },
];

test('products combine search, category, quantity and publication filters without mutating input', () => {
  assert.equal(typeof stock.filterStockItems, 'function');
  const ids = (filters) => stock.filterStockItems(parts, filters).map((part) => part.id);
  assert.deepEqual(ids({ search: 'audio' }), ['a']);
  assert.deepEqual(ids({ search: 'B-1' }), ['c']);
  assert.deepEqual(ids({ search: 'pecas' }), ['c', 'd']);
  assert.deepEqual(ids({ stock: 'out' }), ['a', 'b']);
  assert.deepEqual(ids({ stock: 'low' }), ['c']);
  assert.deepEqual(ids({ stock: 'available' }), ['c', 'd']);
  assert.deepEqual(ids({ category: 'Peças', published: 'yes', stock: 'low' }), ['c']);
  assert.deepEqual(ids({ published: 'no' }), ['a', 'd']);
  assert.deepEqual(ids({ sort: 'name-desc' }), ['d', 'b', 'c', 'a']);
  assert.deepEqual(ids({ sort: 'stock-desc' }), ['d', 'c', 'b', 'a']);
  assert.deepEqual(ids({ sort: 'stock-asc' }), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids({ sort: 'price-asc' }), ['b', 'a', 'c', 'd']);
  assert.deepEqual(ids({ sort: 'price-desc' }), ['d', 'c', 'a', 'b']);
  assert.deepEqual(
    parts.map((part) => part.id),
    ['a', 'b', 'c', 'd'],
  );
});

test('catalog and inventory share accessible filters and retain negative quantities', () => {
  for (const initialView of ['catalog', 'inventory']) {
    const html = renderToStaticMarkup(
      createElement(
        FeedbackProvider,
        null,
        createElement(stock.default, { accountId: 'account-1', initialParts: parts, initialView }),
      ),
    );
    for (const label of [
      'Filtros de produtos',
      'Buscar produto',
      'Categoria',
      'Quantidade em estoque',
      'Publicação',
      'Ordenação',
    ])
      assert.ok(html.includes(label));
    assert.match(html, /4 de 4 produtos/);
    assert.ok(html.includes(initialView === 'catalog' ? 'Sem estoque (-2 un.)' : '-2 un.'));
  }
});
