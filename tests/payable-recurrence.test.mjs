import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isPayableDate,
  isPayableRecurrence,
  nextPayableDueDate,
} from '../lib/payable-recurrence.ts';

test('recurring due dates preserve the original day across shorter months', () => {
  assert.equal(nextPayableDueDate('2027-01-31', 'monthly'), '2027-02-28');
  assert.equal(nextPayableDueDate('2027-02-28', 'monthly', 31), '2027-03-31');
  assert.equal(nextPayableDueDate('2024-02-29', 'yearly'), '2025-02-28');
  assert.equal(nextPayableDueDate('2027-02-28', 'yearly', 29), '2028-02-29');
  assert.equal(nextPayableDueDate('2026-12-28', 'weekly'), '2027-01-04');
});

test('recurrence rejects invalid dates, frequency and date overflow', () => {
  assert.equal(isPayableDate('2026-02-31'), false);
  assert.equal(isPayableDate('2026-10-03'), true);
  assert.equal(isPayableRecurrence('daily'), false);
  assert.equal(nextPayableDueDate('2026-02-31', 'monthly'), null);
  assert.equal(nextPayableDueDate('9999-12-31', 'monthly'), null);
  assert.equal(nextPayableDueDate('2026-10-03', 'monthly', 32), null);
});
