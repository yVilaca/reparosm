import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addOrderPhotoSelection } from '../lib/order-photo-selection.ts';

const photo = (name = 'proof.png', type = 'image/png', size = 12) =>
  new File([new Uint8Array(size)], name, { type });

test('photo selection accepts supported files within the five-photo limit', () => {
  const current = [photo('one.png')];
  const result = addOrderPhotoSelection(current, [photo('two.webp', 'image/webp')]);

  assert.deepEqual(result.files, [...current, photo('two.webp', 'image/webp')]);
  assert.equal(result.error, undefined);
});

test('photo selection rejects a sixth photo and unsupported or oversized files', () => {
  const existing = Array.from({ length: 5 }, (_, index) => photo(`${index}.png`));

  assert.match(addOrderPhotoSelection(existing, [photo()]).error, /máximo 5/i);
  assert.match(
    addOrderPhotoSelection([], [photo('proof.gif', 'image/gif')]).error,
    /JPG, PNG ou WebP/i,
  );
  assert.match(
    addOrderPhotoSelection([], [photo('large.png', 'image/png', 8 * 1024 * 1024 + 1)]).error,
    /8 MB/i,
  );
});
