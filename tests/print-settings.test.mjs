import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_PRINT_COPIES, normalizePrintCopies } from '../lib/print.ts';

test('normalizes the number of printed copies to the supported range', () => {
  assert.equal(normalizePrintCopies(), 1);
  assert.equal(normalizePrintCopies('3'), 3);
  assert.equal(normalizePrintCopies(['4', '2']), 4);
  assert.equal(normalizePrintCopies('0'), 1);
  assert.equal(normalizePrintCopies(String(MAX_PRINT_COPIES + 1)), MAX_PRINT_COPIES);
  assert.equal(normalizePrintCopies('invalid'), 1);
});
