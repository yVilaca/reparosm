import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCashDateRange, summarizeCash } from '../lib/finance.ts';

test('received OS and sales subtract their costs once, keeping expenses separate', () => {
  assert.deepEqual(
    summarizeCash([
      { kind: 'in', value: 100, cost: 40 },
      { kind: 'payment', value: 30, cost: 15 },
      { kind: 'in', value: 90, cost: 30 },
      { kind: 'out', value: 25, cost: 0 },
    ]),
    { income: 220, cost: 85, net: 135, expense: 25, balance: 195 },
  );
  assert.equal(
    summarizeCash([
      { kind: 'in', value: 0.1 },
      { kind: 'in', value: 0.2 },
    ]).income,
    0.3,
  );
  assert.equal(summarizeCash([{ kind: 'in', value: 10, cost: 20 }]).net, -10);
  assert.deepEqual(summarizeCash([]), { income: 0, cost: 0, net: 0, expense: 0, balance: 0 });
});

test('custom date ranges require real ISO dates in ascending order', () => {
  assert.equal(isCashDateRange({ from: '2026-10-01', to: '2026-10-05' }), true);
  assert.equal(isCashDateRange({ from: '2024-02-29', to: '2024-02-29' }), true);
  for (const range of [
    { from: '2026-02-29', to: '2026-03-01' },
    { from: '2026-10-05', to: '2026-10-01' },
    { from: '', to: '2026-10-05' },
    { from: '01/10/2026', to: '2026-10-05' },
  ])
    assert.equal(isCashDateRange(range), false);
});
