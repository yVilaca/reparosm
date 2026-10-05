import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WarrantiesRoute from '../components/warranties-route.tsx';

const baseOrder = (overrides) => ({
  id: 'order-1',
  code: 'OS-1',
  customer: 'Ana',
  device: 'iPhone',
  priority: 'Normal',
  ...overrides,
});

test('shows an order already marked completed even when its legacy stage differs', () => {
  const html = renderToStaticMarkup(
    createElement(WarrantiesRoute, {
      defaultWarrantyDays: 90,
      orders: [baseOrder({ status: 'Concluído', stage: 'Em reparo' })],
    }),
  );
  assert.match(html, /OS-1/);
  assert.match(html, /Data pendente/);
});

test('counts completed deliveries with an unknown warranty date separately from active ones', () => {
  const html = renderToStaticMarkup(
    createElement(WarrantiesRoute, {
      defaultWarrantyDays: 90,
      orders: [
        // The completion is recorded, but its delivery date is unknown.
        baseOrder({ id: 'order-legacy', code: 'OS-9', stage: 'Concluído', warrantyDays: 90 }),
      ],
    }),
  );
  assert.match(html, /Garantia desconhecida/);
  const unknownMetric = html.match(/Garantia desconhecida[\s\S]*?<strong[^>]*>(\d+)<\/strong>/);
  assert.equal(unknownMetric?.[1], '1');
  const activeMetric = html.match(/Garantias ativas[\s\S]*?<strong[^>]*>(\d+)<\/strong>/);
  assert.equal(activeMetric?.[1], '0');
});

test('awaiting pickup does not start warranty coverage', () => {
  const html = renderToStaticMarkup(
    createElement(WarrantiesRoute, {
      defaultWarrantyDays: 90,
      orders: [baseOrder({ stage: 'Retirada', status: 'Aberto' })],
    }),
  );
  assert.doesNotMatch(html, /OS-1/);
});
