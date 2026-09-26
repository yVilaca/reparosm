import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRecord } from '../lib/validation.ts';

const validRecords = {
  order: { code: 'OS-1', customer: 'Ana', device: 'iPhone', problem: 'Não liga' },
  quote: { customer: 'Ana', phone: '11999999999', device: 'iPhone', service: 'Troca' },
  part: { name: 'Tela', stock: 2, price: 100 },
  shop: { name: 'ReparoSM', phone: '11999999999' },
  film: { brand: 'Apple', model: 'iPhone 13', compatible: 'iPhone 13 Pro' },
  client: { name: 'Ana', phone: '11999999999' },
  payment: { description: 'Serviço', value: 100 },
  expense: { description: 'Fornecedor', value: 50 },
  automation: { name: 'Acompanhamento', schedule: 'Amanhã', message: 'Olá', enabled: true },
  message: {
    customer: 'Ana',
    phone: '11999999999',
    kind: 'Contato',
    message: 'Olá',
    status: 'Aberto',
  },
  tutorial: { title: 'Como criar uma OS', url: 'https://example.com/video' },
};

test('accepts the minimum valid shape for every business record', () => {
  for (const [type, data] of Object.entries(validRecords)) {
    assert.equal(validateRecord(type, data).ok, true, type);
  }
});

test('accepts numeric part costs', () => {
  assert.equal(validateRecord('part', { name: 'Tela', stock: 2, cost: 80, price: 150 }).ok, true);
});

test('accepts an order without a code (the server assigns it)', () => {
  assert.equal(
    validateRecord('order', { customer: 'Ana', device: 'iPhone', problem: 'Não liga' }).ok,
    true,
  );
});

test('rejects missing required fields', () => {
  assert.equal(validateRecord('order', { code: 'OS-1', device: 'iPhone' }).ok, false);
  assert.equal(validateRecord('client', { name: 'Ana' }).ok, false);
  assert.equal(validateRecord('film', { brand: 'Apple' }).ok, false);
});

test('rejects invalid primitive values', () => {
  assert.equal(validateRecord('part', { name: 'Tela', stock: 'x', price: 100 }).ok, false);
  assert.equal(validateRecord('payment', { description: 'Serviço', value: Number.NaN }).ok, false);
  assert.equal(
    validateRecord('automation', { name: 'A', schedule: 'B', message: 'C', enabled: 'yes' }).ok,
    false,
  );
});

test('rejects unknown record types', () => {
  assert.equal(validateRecord('unknown', {}).ok, false);
});
