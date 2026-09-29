import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadOrderPhotos } from '../lib/order-photo-upload.ts';

test('photo upload tries every selected image and reports the successful count', async () => {
  const files = [
    new File(['one'], 'one.png', { type: 'image/png' }),
    new File(['two'], 'two.png', { type: 'image/png' }),
  ];
  const urls = [];
  const uploaded = await uploadOrderPhotos('order-1', files, async (url, init) => {
    urls.push(url);
    assert.equal(init.method, 'POST');
    return new Response('{}', { status: urls.length === 1 ? 201 : 400 });
  });

  assert.equal(uploaded, 1);
  assert.deepEqual(urls, ['/api/orders/order-1/photos', '/api/orders/order-1/photos']);
});
