import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConfirmationQueue } from '../components/feedback-confirmation-queue.mjs';

test('confirmation queue keeps rapid requests ordered and settles each once', async () => {
  const visible = [];
  const queue = createConfirmationQueue((pending) => visible.push(pending?.message ?? null));
  let resolveFirst;
  let resolveSecond;
  const firstResult = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const secondResult = new Promise((resolve) => {
    resolveSecond = resolve;
  });

  const firstId = queue.enqueue('Excluir cliente A?', resolveFirst);
  const secondId = queue.enqueue('Excluir cliente B?', resolveSecond);
  assert.deepEqual(visible, ['Excluir cliente A?']);

  queue.resolve(firstId, true);
  queue.resolve(firstId, false);
  assert.deepEqual(visible, ['Excluir cliente A?', 'Excluir cliente B?']);
  assert.equal(await firstResult, true);

  queue.resolve(secondId, false);
  assert.deepEqual(visible, ['Excluir cliente A?', 'Excluir cliente B?', null]);
  assert.equal(await secondResult, false);
});
