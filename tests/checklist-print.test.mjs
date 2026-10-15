import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ChecklistPrintDocument from '../components/checklist-print.tsx';
import OrderChecklistPanel from '../components/order-checklist-panel.tsx';

test('prints the checklist with customer-facing evidence and signature fields', () => {
  const html = renderToStaticMarkup(
    createElement(ChecklistPrintDocument, {
      copies: 1,
      order: {
        code: 'OS-42',
        customer: 'Ana Souza',
        phone: '11999990000',
        device: 'iPhone 13',
        imei: '123456789012345',
      },
      shop: {
        name: 'Cell Prime',
        phone: '1133334444',
        terms: 'O cliente confirma o estado do aparelho na entrada.',
      },
      checklist: {
        powersOn: true,
        items: {
          touch: { state: 'ok', by: 'shop', at: '2026-10-15T12:00:00.000Z' },
          display: {
            state: 'fail',
            by: 'device',
            at: '2026-10-15T12:01:00.000Z',
            note: 'Linha no canto superior',
          },
        },
        marks: [
          { id: 'mark-1', side: 'back', x: 0.4, y: 0.2, kind: 'crack', note: 'Tampa traseira' },
        ],
        notes: 'Cliente entregou sem carregador.',
        device: { platform: 'iOS 18', screen: '1170×2532', battery: 84 },
        completedAt: '2026-10-15T12:02:00.000Z',
      },
    }),
  );

  for (const text of [
    'Checklist de entrada',
    'OS-42',
    'Cell Prime',
    'Ana Souza',
    'iPhone 13',
    '123456789012345',
    'Toque da tela',
    'Funcionando',
    'Imagem da tela',
    'Defeito',
    'Linha no canto superior',
    'Trinca',
    'Tampa traseira',
    'Cliente entregou sem carregador.',
    'iOS 18',
    '84%',
    'O cliente confirma o estado do aparelho na entrada.',
    'Assinatura do cliente',
    'Assinatura da assistência',
  ]) {
    assert.ok(html.includes(text), `Missing ${text}`);
  }
  assert.match(html, /Imprimir \/ salvar PDF/);
});

test('prints all checklist checks as not answered when the checklist is empty', () => {
  const html = renderToStaticMarkup(
    createElement(ChecklistPrintDocument, {
      copies: 1,
      order: { code: 'OS-1', customer: 'Bruno', device: 'Moto G' },
      checklist: { items: {}, marks: [] },
    }),
  );

  assert.match(html, /Nenhum teste feito ainda/);
  assert.match(html, /Toque da tela/);
  assert.match(html, /Não respondido/);
  assert.match(html, /Nenhuma avaria registrada/);
  assert.match(html, /Assinatura do cliente/);
});

test('order checklist panel links to the printable signature document', () => {
  const html = renderToStaticMarkup(
    createElement(OrderChecklistPanel, {
      orderId: 'order-42',
      initial: { items: {}, marks: [] },
    }),
  );

  assert.match(html, /href="\/ordens\/order-42\/checklist\/imprimir"/);
  assert.match(html, /Imprimir para assinatura/);
});
