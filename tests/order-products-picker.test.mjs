import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrderProductsPicker } from '../components/order-modals.tsx';

test('keeps selected product controls in a responsive grid', () => {
  const html = renderToStaticMarkup(
    createElement(OrderProductsPicker, {
      parts: [],
      value: [
        { partId: 'part-1', name: 'Tela para aparelho com nome longo', quantity: 1, unitPrice: 30 },
      ],
      onChange: () => undefined,
      stock: {
        checking: false,
        error: undefined,
        shortages: [],
        refresh: () => undefined,
        check: undefined,
      },
    }),
  );

  assert.match(html, /sm:grid-cols-\[minmax\(0,1fr\)_auto_auto_auto\]/);
});
