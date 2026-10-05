import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDeliveredAt, warrantyDaysFromSetting, warrantyPeriod } from '../lib/warranty.ts';

test('uses the assistance guarantee as a per-order default', () => {
  assert.equal(warrantyDaysFromSetting('30 dias'), 30);
  assert.equal(warrantyDaysFromSetting('180 dias'), 180);
  assert.equal(warrantyDaysFromSetting(undefined), 90);
  assert.equal(warrantyDaysFromSetting('prazo inválido'), 90);
});

test('calculates warranty expiry and remaining days from delivery', () => {
  assert.deepEqual(warrantyPeriod('2026-01-01', 90, '2026-03-01'), {
    status: 'active',
    expiresAt: '2026-04-01',
    daysRemaining: 31,
  });
  assert.deepEqual(warrantyPeriod('2026-01-01', 90, '2026-04-01'), {
    status: 'expiring',
    expiresAt: '2026-04-01',
    daysRemaining: 0,
  });
  assert.deepEqual(warrantyPeriod('2026-01-01', 90, '2026-04-02'), {
    status: 'expired',
    expiresAt: '2026-04-01',
    daysRemaining: -1,
  });
});

test('resolveDeliveredAt sets today on completion, not while awaiting pickup', () => {
  assert.equal(resolveDeliveredAt(undefined, 'Em serviço', 'Retirada', '2026-03-01'), undefined);
  assert.equal(resolveDeliveredAt(undefined, 'Retirada', 'Concluído', '2026-03-01'), '2026-03-01');
});

test('resolveDeliveredAt keeps the previous date while staying completed', () => {
  assert.equal(
    resolveDeliveredAt('2026-01-10', 'Concluído', 'Concluído', '2026-03-01'),
    '2026-01-10',
  );
});

test('resolveDeliveredAt keeps the previous date while not completed', () => {
  assert.equal(
    resolveDeliveredAt('2026-01-10', 'Em reparo', 'Em reparo', '2026-03-01'),
    '2026-01-10',
  );
});

test('resolveDeliveredAt updates to today on a second delivery (warranty return)', () => {
  // Delivered once (2026-01-10), returned for a warranty repair (stage left Concluído),
  // then redelivered: the date must move to the new handoff, not stay stuck on the first one.
  assert.equal(
    resolveDeliveredAt('2026-01-10', 'Em serviço', 'Concluído', '2026-03-01'),
    '2026-03-01',
  );
});

test('does not claim a warranty is active without a valid delivery date', () => {
  assert.deepEqual(warrantyPeriod(undefined, 90, '2026-04-01'), {
    status: 'unknown',
    expiresAt: null,
    daysRemaining: null,
  });
  assert.equal(warrantyPeriod('2026-02-30', 90, '2026-04-01').status, 'unknown');
});
