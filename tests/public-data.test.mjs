import test from 'node:test';
import assert from 'node:assert/strict';
import { publicRecord, businessTypes } from '../lib/public-data.ts';
import { filmCatalog } from '../lib/film-catalog.ts';
test('vitrine exposes sale price, not costs or secrets', () => {
  const result = publicRecord({
    id: 'part-1',
    type: 'part',
    data: {
      name: 'Tela',
      price: 200,
      cost: 80,
      profit: 120,
      password: 'secret',
      _accountId: 'account-x',
      internalNotes: 'private',
    },
  });
  assert.deepEqual(result.data, { name: 'Tela', price: 200 });
});
test('quote exposes only customer-facing values', () => {
  const result = publicRecord({
    id: 'quote-1',
    type: 'quote',
    data: {
      total: 250,
      cost: 30,
      labor: 100,
      parts: 150,
      notes: 'Garantia de 90 dias',
      phone: 'private',
    },
  });
  assert.deepEqual(result.data, { notes: 'Garantia de 90 dias', total: 250 });
});
test('authentication and account tables never become business exports', () => {
  for (const type of [
    'account',
    'user',
    'session',
    'user_identity',
    'user_authenticator',
    'recovery_code',
    'auth_challenge',
    'auth_device',
    'mfa_reset_request',
    'password_request',
    'access_link',
  ])
    assert.equal(businessTypes.includes(type), false, `${type} não é exportável`);
});
test('shared catalogue contains 82 unique compatibility groups', () => {
  assert.equal(filmCatalog.length, 82);
  assert.equal(new Set(filmCatalog.map((x) => x.id)).size, 82);
  assert(filmCatalog.every((x) => x.data.source === 'Catálogo inicial'));
});
