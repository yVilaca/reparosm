import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StockKardex, { loadStockMovements, StockMovementRows } from '../components/stock-kardex.tsx';
import StockRoute from '../components/stock-route.tsx';
import { FeedbackProvider } from '../components/feedback.tsx';

test('Kardex forwards all filters and the complete pagination cursor, and reports API failures', async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const query = new URL(url, 'http://localhost').searchParams;
    assert.equal(query.get('from'), '2026-10-01');
    assert.equal(query.get('to'), '2026-10-05');
    assert.equal(query.get('partId'), 'part-1');
    assert.equal(query.get('source'), 'order-return');
    assert.equal(query.get('direction'), 'in');
    assert.equal(query.get('search'), 'Tela & peça');
    assert.equal(query.get('before'), '2026-10-04T10:00:00.000Z');
    assert.equal(query.get('beforeId'), 'movement-2');
    assert.equal(options.signal, signal);
    return Response.json({ rows: [], nextCursor: null });
  });
  const filters = {
    from: '2026-10-01',
    to: '2026-10-05',
    partId: 'part-1',
    source: 'order-return',
    direction: 'in',
    search: 'Tela & peça',
  };
  assert.deepEqual(
    await loadStockMovements(
      filters,
      { createdAt: '2026-10-04T10:00:00.000Z', id: 'movement-2' },
      signal,
    ),
    { rows: [], nextCursor: null },
  );
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Período inválido.' }, { status: 400 }),
  );
  await assert.rejects(loadStockMovements(filters), /Período inválido/);
  await assert.rejects(loadStockMovements({ ...filters, from: '2026-10-06' }), /intervalo/);
});

test('Kardex offers labeled native filters and shows signed movements with balances on desktop and mobile', () => {
  const html = renderToStaticMarkup(createElement(StockKardex, { parts: [] }));
  for (const label of ['De', 'Até', 'Produto', 'Origem', 'Direção', 'Buscar nome ou SKU'])
    assert.ok(html.includes(label));
  assert.equal((html.match(/type="date"/g) || []).length, 2);
  assert.match(html, /Carregando movimentações/);
  const rows = renderToStaticMarkup(
    createElement(StockMovementRows, {
      rows: [
        {
          id: 'movement-1',
          partId: 'part-1',
          name: 'Tela',
          sku: 'T-1',
          source: 'order',
          reference: 'OS-12',
          referenceId: 'order-1',
          quantity: -2,
          before: 1,
          after: -1,
          unitCost: 20,
          createdAt: '2026-10-05T12:00:00.000Z',
        },
        {
          id: 'movement-2',
          partId: 'part-1',
          name: 'Tela',
          sku: 'T-1',
          source: 'order-return',
          reference: 'OS-12',
          referenceId: 'order-1',
          quantity: 2,
          before: -1,
          after: 1,
          unitCost: 20,
          createdAt: '2026-10-05T13:00:00.000Z',
        },
      ],
    }),
  );
  for (const value of ['OS-12', 'T-1', '-2', '+2', 'Devolução de OS', 'Saldo', 'Custo unitário'])
    assert.ok(rows.includes(value));
  assert.match(rows, /1 → -1/);
  assert.match(rows, /-1 → 1/);
});

test('stock exposes the Kardex route without requiring a selected product', () => {
  const html = renderToStaticMarkup(
    createElement(
      FeedbackProvider,
      null,
      createElement(StockRoute, {
        accountId: 'account-1',
        initialParts: [],
        initialView: 'kardex',
      }),
    ),
  );
  assert.match(html, /href="\/estoque\?view=kardex"/);
  assert.match(html, /Kardex/);
  assert.match(html, /Carregando movimentações/);
  assert.doesNotMatch(html, /Nenhum produto cadastrado/);
});
