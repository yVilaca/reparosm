import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { FeedbackProvider } from '../components/feedback.tsx';
import MyShopRoute from '../components/my-shop-route.tsx';
import { StockCheckStatus } from '../components/stock-alert-dialog.tsx';
import { requestStock, stockShortages, uniqueStockProduct } from '../components/use-stock-check.ts';

test('exact name/SKU binds only a unique product, leaving services and ambiguous names free', () => {
  const products = [
    { id: 'a', name: 'Película', sku: 'FILM-1' },
    { id: 'b', name: 'Capa', sku: 'CASE-1' },
  ];
  assert.equal(uniqueStockProduct(products, ' película ')?.id, 'a');
  assert.equal(uniqueStockProduct(products, 'film-1')?.id, 'a');
  assert.equal(uniqueStockProduct(products, 'Limpeza'), null);
  assert.equal(uniqueStockProduct([...products, { id: 'c', name: 'Película' }], 'Película'), null);
  assert.equal(uniqueStockProduct([...products, { id: 'c', name: 'film-1' }], 'film-1'), null);
});

test('stock shortages aggregate repeated products and use available stock credited for an edited OS', () => {
  const items = [
    { partId: 'a', quantity: 2 },
    { partId: 'a', quantity: 3 },
  ];
  const check = {
    allowNegativeStock: false,
    parts: [{ id: 'a', name: 'Tela', stock: 1, available: 5 }],
  };
  assert.deepEqual(stockShortages(items, check), []);
  assert.deepEqual(stockShortages([...items, { partId: 'a', quantity: 1 }], check), [
    { id: 'a', name: 'Tela', available: 5, quantity: 6 },
  ]);
  assert.equal(
    stockShortages([{ partId: 'a', quantity: 1 }], {
      ...check,
      allowNegativeStock: true,
      parts: [{ id: 'a', name: 'Tela', stock: -2, available: -2 }],
    }).length,
    1,
  );
});

test('stock request batches unique IDs with no-store, OS credit, and cancellation', async (context) => {
  const controller = new AbortController();
  const check = {
    allowNegativeStock: false,
    parts: [
      { id: 'a', name: 'Tela', stock: 2, available: 3 },
      { id: 'b', name: 'Bateria', stock: 4, available: 4 },
    ],
  };
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    const query = new URL(url, 'http://localhost').searchParams;
    assert.equal(query.get('ids'), 'a,b');
    assert.equal(query.get('orderId'), 'os-1');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.signal, controller.signal);
    return Response.json(check);
  });
  assert.deepEqual(
    await requestStock(
      [
        { partId: 'b', quantity: 1 },
        { partId: 'a', quantity: 1 },
        { partId: 'b', quantity: 2 },
      ],
      'os-1',
      controller.signal,
    ),
    check,
  );
  assert.equal(calls, 1);
});

test('stock request fails closed for missing products, invalid quantities, and request limits', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({ allowNegativeStock: false, parts: [] }),
  );
  await assert.rejects(requestStock([{ partId: 'deleted', quantity: 1 }]), /estoque mudou/);
  await assert.rejects(requestStock([{ partId: 'a', quantity: 1.5 }]), /inteiras/);
  await assert.rejects(
    requestStock(Array.from({ length: 101 }, (_, id) => ({ partId: String(id), quantity: 1 }))),
    /100 produtos/,
  );
  assert.deepEqual(await requestStock([]), { allowNegativeStock: false, parts: [] });
});

test('stock status exposes checking, shortages, and an accessible retry after errors', () => {
  const render = (props) =>
    renderToStaticMarkup(createElement(StockCheckStatus, { shortages: [], retry() {}, ...props }));
  assert.match(render({ checking: true }), /role="status"[^>]*aria-live="polite"/);
  assert.match(render({ checking: true }), /Verificando estoque/);
  assert.match(
    render({ checking: false, error: 'Sem conexão' }),
    /Sem conexão.*Verificar novamente/s,
  );
  assert.match(
    render({ checking: false, shortages: [{ id: 'a', name: 'Tela', available: -1, quantity: 2 }] }),
    /Tela: disponível -1, solicitado 2/,
  );
});

test('negative stock defaults to no and preserves an explicitly enabled shop setting', () => {
  const render = (allowNegativeStock) =>
    renderToStaticMarkup(
      createElement(
        AppRouterContext.Provider,
        { value: { refresh() {} } },
        createElement(
          FeedbackProvider,
          null,
          createElement(MyShopRoute, {
            initialShop: {
              id: 'shop-main',
              name: 'Loja',
              phone: '11999999999',
              allowNegativeStock,
            },
          }),
        ),
      ),
    );
  const input = (html) => html.match(/<input[^>]*id="shop-allow-negative-stock"[^>]*>/)[0];
  assert.doesNotMatch(input(render(undefined)), /checked/);
  assert.doesNotMatch(input(render(false)), /checked/);
  assert.match(input(render(true)), /checked=""/);
  assert.match(render(false), /Permitir vender com estoque negativo/);
});
