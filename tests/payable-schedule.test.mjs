import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dueGroup,
  dueLabel,
  installmentDueDates,
  splitInstallments,
} from '../lib/payable-schedule.ts';

const today = '2026-10-03';

test('groups by how soon the bill is due', () => {
  assert.equal(dueGroup('2026-10-02', today), 'overdue');
  assert.equal(dueGroup('2026-10-03', today), 'today');
  assert.equal(dueGroup('2026-10-04', today), 'week');
  assert.equal(dueGroup('2026-10-10', today), 'week');
  assert.equal(dueGroup('2026-10-11', today), 'later');
  assert.equal(dueGroup(undefined, today), 'undated');
});

test('describes the due date in plain words', () => {
  assert.equal(dueLabel('2026-10-01', today), 'Venceu há 2 dias');
  assert.equal(dueLabel('2026-10-02', today), 'Venceu ontem');
  assert.equal(dueLabel('2026-10-03', today), 'Vence hoje');
  assert.equal(dueLabel('2026-10-04', today), 'Vence amanhã');
  assert.equal(dueLabel('2026-10-08', today), 'Vence em 5 dias');
  assert.equal(dueLabel('2026-11-15', today), 'Vence em 15/11');
  assert.equal(dueLabel('2027-01-15', today), 'Vence em 15/01/2027');
  assert.equal(dueLabel(undefined, today), 'Sem vencimento');
});

test('splits a total into equal installments, leftover cents on the last', () => {
  assert.deepEqual(splitInstallments(1200, 3), [400, 400, 400]);
  assert.deepEqual(splitInstallments(1000, 3), [333.33, 333.33, 333.34]);
  assert.deepEqual(splitInstallments(100, 7), [14.28, 14.28, 14.28, 14.28, 14.28, 14.28, 14.32]);
  const parts = splitInstallments(2380.55, 4);
  assert.equal(Math.round(parts.reduce((sum, value) => sum + value, 0) * 100), 238055);
});

test('rejects an installment plan that cannot pay at least a cent each', () => {
  assert.equal(splitInstallments(0.05, 6), null);
  assert.equal(splitInstallments(100, 1), null);
  assert.equal(splitInstallments(100, 49), null);
});

test('installments fall on the same day each month, clamped to short months', () => {
  assert.deepEqual(installmentDueDates('2027-01-31', 3), ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.deepEqual(installmentDueDates('2026-11-10', 3), ['2026-11-10', '2026-12-10', '2027-01-10']);
});
