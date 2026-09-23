import assert from 'node:assert/strict';
import test from 'node:test';
import { orderFromQuote } from '../lib/orders.ts';

test('turns an approved quote into an owned order', () => {
  const result = orderFromQuote(
    {
      code: 'ORC-12',
      customer: 'Ana Souza',
      phone: '11999998888',
      device: 'iPhone 13',
      problem: 'Não liga',
      service: 'Troca de tela',
      notes: 'Garantia de 90 dias',
      labor: 100,
      parts: 150,
      total: 250,
    },
    'quote-1',
    'account-a',
    '2026-09-23T12:00:00.000Z',
  );

  assert.equal(result.code, 'OS-12');
  assert.equal(result.quoteId, 'quote-1');
  assert.equal(result._accountId, 'account-a');
  assert.equal(result.total, 250);
  assert.equal(result.stage, 'Recebido');
  assert.equal(result.status, 'Aberto');
});
