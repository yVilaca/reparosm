import assert from 'node:assert/strict';
import { test } from 'node:test';
import { byName, cashNewestFirst, newestFirst } from '../lib/sorting.ts';

test('catalogs use Portuguese names and natural model numbers with stable ties', () => {
  const rows = [
    { id: '3', name: 'Tela 10' },
    { id: '2', name: 'Tela 2' },
    { id: 'b', name: 'Álvaro' },
    { id: 'a', name: 'alvaro' },
  ];
  assert.deepEqual(
    rows.sort(byName).map((row) => row.id),
    ['a', 'b', '2', '3'],
  );
});

test('records follow creation, cash follows competence, and updates do not reshuffle records', () => {
  const rows = [
    {
      id: 'a',
      createdAt: '2026-10-02T12:00:00Z',
      updatedAt: '2026-10-05T12:00:00Z',
      date: '2026-10-05',
    },
    {
      id: 'b',
      createdAt: '2026-10-04T12:00:00Z',
      updatedAt: '2026-10-04T12:00:00Z',
      date: '2026-10-01',
    },
    { id: 'c', createdAt: '2026-10-04T12:00:00Z', date: '2026-10-01' },
  ];
  assert.deepEqual(
    [...rows].sort(newestFirst).map((row) => row.id),
    ['c', 'b', 'a'],
  );
  assert.deepEqual(
    [...rows].sort(cashNewestFirst).map((row) => row.id),
    ['a', 'c', 'b'],
  );
});
