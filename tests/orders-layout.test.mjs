import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OrderPaymentStatus from '../components/order-payment-status.tsx';
import { matchesOrderFilters } from '../components/orders-route.tsx';
import Filters from '../components/ui/filters.tsx';

test('combines field filters and preserves the general order search', () => {
  const order = { code: 'OS-12', customer: 'Ana Silva', device: 'iPhone', phone: '11987654321' };
  assert.equal(
    matchesOrderFilters(order, [
      { field: 'customer', value: ' ANA ' },
      { field: 'device', value: 'iphone' },
      { field: 'stage', value: 'Recebido' },
      { field: 'priority', value: 'Normal' },
    ]),
    true,
  );
  assert.equal(matchesOrderFilters(order, [{ field: 'stage', value: 'Em reparo' }]), false);
  assert.equal(matchesOrderFilters(order, [{ field: 'customer', value: 'iPhone' }]), false);
  assert.equal(matchesOrderFilters(order, [{ field: 'search', value: 'OS-12' }]), true);
  assert.equal(matchesOrderFilters(order, []), true);
});

test('active filters expose compact removable badges', () => {
  const html = renderToStaticMarkup(
    createElement(Filters, {
      fields: [{ key: 'customer', label: 'Cliente' }],
      value: [{ field: 'customer', value: 'Ana' }],
      onChange() {},
    }),
  );
  assert.match(html, /Cliente: Ana/);
  assert.match(html, /aria-label="Remover filtro Cliente: Ana"/);
  assert.match(html, /title="Clique para remover este filtro"/);
});

test('unpaid cards offer an accessible icon without redundant payment text', () => {
  const html = renderToStaticMarkup(
    createElement(OrderPaymentStatus, { order: { total: 100 }, onCharge() {} }),
  );
  assert.doesNotMatch(html, /Pagamento pendente/);
  assert.match(html, /aria-label="Registrar recebimento"/);
  assert.match(html, /<svg/);
  assert.doesNotMatch(html, />Registrar recebimento</);
});

test('paid cards keep the receipt amount and do not offer another receipt', () => {
  const html = renderToStaticMarkup(
    createElement(OrderPaymentStatus, { order: { total: 100, payment: { value: 80 } } }),
  );
  assert.match(html, /Recebido/);
  assert.match(html, /80,00/);
  assert.doesNotMatch(html, /<button/);
});
