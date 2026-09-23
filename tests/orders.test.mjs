import assert from 'node:assert/strict';
import test from 'node:test';
import { clientFromOrder, findMatchingClient, orderFromQuote } from '../lib/orders.ts';

const order = {
  code: 'OS-123',
  customer: 'Ana Souza',
  phone: '(11) 99999-8888',
  device: 'iPhone 13',
  problem: 'Não liga',
  total: 250,
  cost: 80,
  status: 'Aberto',
};

const client = (id, accountId, data) => ({
  id,
  type: 'client',
  data: { _accountId: accountId, ...data },
});

test('matches clients by phone before name and never across accounts', () => {
  const sameName = client('client-name', 'account-a', { name: 'Ana Souza', phone: '11911111111' });
  const samePhone = client('client-phone', 'account-a', {
    name: 'Outro nome',
    phone: '11999998888',
  });
  const otherAccount = client('client-other', 'account-b', {
    name: 'Ana Souza',
    phone: '11999998888',
  });

  assert.equal(
    findMatchingClient([sameName, samePhone, otherAccount], order, 'account-a')?.id,
    'client-phone',
  );
  assert.equal(findMatchingClient([sameName], order, 'account-a')?.id, 'client-name');
  assert.equal(findMatchingClient([otherAccount], order, 'account-a'), undefined);
});

test('derives a client from an order while preserving existing fields', () => {
  const existing = client('client-1', 'account-a', {
    name: 'Ana Souza',
    phone: '11999998888',
    vip: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const data = clientFromOrder(order, 'account-a', 'order-1', existing, '2026-09-23T12:00:00.000Z');

  assert.deepEqual(data, {
    _accountId: 'account-a',
    name: 'Ana Souza',
    phone: '(11) 99999-8888',
    vip: true,
    status: 'Em atendimento',
    lastOrderId: 'order-1',
    lastOrderCode: 'OS-123',
    lastDevice: 'iPhone 13',
    updatedAt: '2026-09-23T12:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    automatic: true,
  });
});

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
