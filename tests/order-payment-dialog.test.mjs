import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider } from '../components/feedback.tsx';
import { OrderPaymentAmount } from '../components/order-payment-dialog.tsx';
import OrderPaymentStatus from '../components/order-payment-status.tsx';

const render = (total) =>
  renderToStaticMarkup(
    createElement(FeedbackProvider, null, createElement(OrderPaymentAmount, { total })),
  );

test('shows the order total as a fixed, non-editable amount', () => {
  const html = render(350);
  assert.match(html, /R\$\s*350,00/);
  assert.doesNotMatch(html, /<input[^>]+name="value"/);
});

test('explains how to charge a different amount', () => {
  assert.match(render(350), /altere o total da OS/i);
});

test('shows payment state and recovery action in the order', () => {
  const html = renderToStaticMarkup(
    createElement(OrderPaymentStatus, {
      order: {
        total: 400,
        payment: { id: 'payment-1', value: 350, method: 'Pix', date: '2026-03-31' },
      },
    }),
  );
  assert.match(html, /Recebido R\$\s*350,00 de R\$\s*400,00/);
  assert.doesNotMatch(html, /Registrar recebimento/);
});

test('shows a recovery action for an unpaid order with value', () => {
  const html = renderToStaticMarkup(
    createElement(OrderPaymentStatus, {
      order: { total: 350, payment: null },
      onCharge: () => {},
    }),
  );
  assert.match(html, /Pagamento pendente/);
  assert.match(html, /Registrar recebimento/);
});

test('does not render a payment indicator for a zero-total order', () => {
  const html = renderToStaticMarkup(
    createElement(OrderPaymentStatus, { order: { total: 0, payment: null } }),
  );
  assert.equal(html, '');
});
