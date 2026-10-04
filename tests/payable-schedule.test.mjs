import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dueGroup,
  dueLabel,
  groupOpenPayables,
  groupPaidPayables,
  installmentDueDates,
  matchesPayable,
  splitInstallments,
  summarizePayables,
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
  assert.deepEqual(installmentDueDates('2027-01-31', 3), [
    '2027-01-31',
    '2027-02-28',
    '2027-03-31',
  ]);
  assert.deepEqual(installmentDueDates('2026-11-10', 3), [
    '2026-11-10',
    '2026-12-10',
    '2027-01-10',
  ]);
});

const bill = (id, amount, dueDate, extra = {}) => ({
  id,
  description: `Conta ${id}`,
  amount,
  dueDate,
  status: 'pending',
  ...extra,
});
const paid = (id, amount, paidOn, extra = {}) =>
  bill(id, amount, paidOn, { status: 'paid', paidOn, paidAmount: amount, ...extra });

test('sums what is overdue, what is due in the next 7 days and what was paid this month', () => {
  const summary = summarizePayables(
    [
      bill('a', 100.1, '2026-09-30'),
      bill('b', 50.2, '2026-10-02'),
      bill('c', 10, '2026-10-03'),
      bill('d', 20, '2026-10-10'),
      bill('e', 999, '2026-10-11'),
      bill('f', 5, undefined),
      paid('g', 80, '2026-10-01'),
      paid('h', 70, '2026-09-29'),
      paid('i', 30, '2026-10-02', { amount: 25 }),
    ],
    today,
  );
  assert.deepEqual(summary, {
    overdue: { amount: 150.3, count: 2 },
    upcoming: { amount: 30, count: 2 },
    paidThisMonth: { amount: 110, count: 2 },
  });
});

test('groups open bills by due date, most urgent first, with totals', () => {
  const groups = groupOpenPayables(
    [
      bill('later', 300, '2026-12-01'),
      bill('late-2', 20, '2026-10-01'),
      bill('undated', 5, undefined),
      bill('late-1', 10, '2026-09-01'),
      bill('today', 40, '2026-10-03'),
      paid('paid', 1, '2026-10-01'),
    ],
    today,
  );
  assert.deepEqual(
    groups.map((group) => [group.group, group.total, group.rows.map((row) => row.id)]),
    [
      ['overdue', 30, ['late-1', 'late-2']],
      ['today', 40, ['today']],
      ['later', 300, ['later']],
      ['undated', 5, ['undated']],
    ],
  );
});

test('groups paid bills by the month they were paid, newest first', () => {
  const groups = groupPaidPayables([
    paid('sep', 70, '2026-09-29'),
    paid('oct-1', 80, '2026-10-01'),
    paid('oct-2', 30.5, '2026-10-02'),
    bill('open', 10, '2026-10-01'),
  ]);
  assert.deepEqual(
    groups.map((group) => [group.month, group.label, group.total, group.rows.map((row) => row.id)]),
    [
      ['2026-10', 'Outubro de 2026', 110.5, ['oct-2', 'oct-1']],
      ['2026-09', 'Setembro de 2026', 70, ['sep']],
    ],
  );
});

test('searches description, supplier and category ignoring accents and case', () => {
  const row = bill('x', 1, today, {
    description: 'Conta de energia',
    supplier: 'Enel São Paulo',
    category: 'Água e luz',
  });
  assert.equal(matchesPayable(row, ''), true);
  assert.equal(matchesPayable(row, 'ENERGIA'), true);
  assert.equal(matchesPayable(row, 'sao paulo'), true);
  assert.equal(matchesPayable(row, 'agua'), true);
  assert.equal(matchesPayable(row, 'aluguel'), false);
});
