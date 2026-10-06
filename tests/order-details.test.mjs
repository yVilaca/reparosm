import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server';
import { OrderDetails } from '../components/order-details-dialog.tsx';
import OrderPhotos from '../components/order-photos.tsx';
import { FeedbackProvider } from '../components/feedback.tsx';

const renderToStaticMarkup = (element) =>
  renderMarkup(createElement(FeedbackProvider, null, element));

test('order consultation shows unlock data, service, item snapshots and partial receipt', () => {
  const html = renderToStaticMarkup(
    createElement(OrderDetails, {
      order: {
        id: 'order-detail',
        code: 'OS-42',
        customer: 'Ana',
        phone: '11999990000',
        device: 'iPhone 13',
        imei: '123456789012345',
        password: '0012',
        pattern: [1, 5, 9],
        problem: 'Tela quebrada',
        service: 'Trocar tela',
        notes: 'Manter película',
        technician: 'João',
        priority: 'Urgente',
        stage: 'Em serviço',
        status: 'Aberto',
        labor: 100,
        parts: 200,
        total: 300,
        cost: 80,
        profit: 220,
        warrantyDays: 90,
        items: [
          { partId: 'part-1', name: 'Tela registrada', quantity: 2, unitPrice: 100, unitCost: 40 },
        ],
        payment: { value: 120, method: 'Pix', date: '2026-10-05' },
      },
    }),
  );
  for (const text of [
    'Ana',
    'iPhone 13',
    '123456789012345',
    '0012',
    '1 → 5 → 9',
    'Tela quebrada',
    'Trocar tela',
    'Manter película',
    'João',
    'Tela registrada',
    'Pix',
    '90 dias',
  ]) {
    assert.ok(html.includes(text), `Missing ${text}`);
  }
  assert.match(html, /Saldo a receber[\s\S]*180,00/);
  assert.doesNotMatch(html, /<input|<textarea|<select/);
});

test('orders without a numeric password hide it and retain other empty values', () => {
  const html = renderToStaticMarkup(
    createElement(OrderDetails, {
      order: {
        id: 'order-empty',
        code: 'OS-1',
        customer: 'Ana',
        device: 'Moto',
        total: 100,
      },
    }),
  );
  assert.doesNotMatch(html, /Senha numérica/);
  assert.match(html, /WhatsApp[\s\S]*Não informado/);
  assert.match(html, /Padrão de desbloqueio[\s\S]*Não informado/);
  assert.match(html, /Nenhum recebimento registrado/);
  assert.match(html, /Saldo a receber[\s\S]*100,00/);
});

test('cancelled and overpaid orders never show a negative or pending balance', () => {
  for (const order of [
    { status: 'Cancelado', total: 100 },
    { total: 100, payment: { value: 120, method: 'Pix' } },
  ]) {
    const html = renderToStaticMarkup(
      createElement(OrderDetails, {
        order: {
          id: 'order-1',
          code: 'OS-1',
          customer: 'Ana',
          device: 'Moto',
          ...order,
        },
      }),
    );
    assert.match(html, /Saldo a receber[\s\S]*0,00/);
  }
});

test('read-only photos preserve consultation without upload or deletion controls', () => {
  const render = (readOnly) =>
    renderToStaticMarkup(
      createElement(
        FeedbackProvider,
        null,
        createElement(OrderPhotos, { orderId: 'order-1', readOnly }),
      ),
    );
  assert.doesNotMatch(render(true), /type="file"|Adicionar foto|Excluir/);
  assert.match(render(false), /type="file"/);
});
