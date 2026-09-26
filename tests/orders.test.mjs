import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { orderFromQuote } from '../lib/orders.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, orders;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.query(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-codes-a', 'codes-a', 'Codes A', 'merchant', 'active', 'x'),
            ('account-codes-b', 'codes-b', 'Codes B', 'merchant', 'active', 'x')`,
  );
  orders = await import('../lib/repos/orders.ts');
});
after(async () => db?.drop());

test('turns an approved quote into an owned order using the given code', () => {
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
    '2026-09-23T12:00:00.000Z',
    'OS-7',
  );

  assert.equal(result.code, 'OS-7');
  assert.equal(result.quoteId, 'quote-1');
  assert.equal(result.total, 250);
  assert.equal(result.stage, 'Recebido');
  assert.equal(result.status, 'Aberto');
});

test(
  'nextCode assigns sequential codes per account, independent across accounts',
  { skip },
  async () => {
    assert.equal(await orders.nextCode('account-codes-a'), 'OS-1');
    assert.equal(await orders.nextCode('account-codes-a'), 'OS-2');
    assert.equal(await orders.nextCode('account-codes-b'), 'OS-1');
    assert.equal(await orders.nextCode('account-codes-a'), 'OS-3');
  },
);
