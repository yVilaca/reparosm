import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SHOP_LOGO_BYTES, inspectShopLogo } from '../lib/shop-logo.ts';

const tinyPng = () =>
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

const tinyJpeg = () =>
  Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    0x00,
    0x01,
    0x00,
    0x01,
    ...new Array(10).fill(0),
  ]);

const tinyWebp = () =>
  Buffer.from([
    ...Buffer.from('RIFF'),
    0x16,
    0x00,
    0x00,
    0x00,
    ...Buffer.from('WEBPVP8X'),
    0x0a,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);

test('inspects a real PNG and returns bounded image metadata', () => {
  assert.deepEqual(inspectShopLogo(tinyPng()), {
    contentType: 'image/png',
    width: 1,
    height: 1,
  });
});

test('accepts JPEG and WebP headers with bounded dimensions', () => {
  assert.equal(inspectShopLogo(tinyJpeg())?.contentType, 'image/jpeg');
  assert.equal(inspectShopLogo(tinyWebp())?.contentType, 'image/webp');
});

test('rejects HTML disguised as an image and SVG content', () => {
  assert.equal(inspectShopLogo(Buffer.from('<script>alert(1)</script>')), null);
  assert.equal(
    inspectShopLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    null,
  );
});

test('rejects truncated and oversized logo data', () => {
  assert.equal(inspectShopLogo(Buffer.from('\x89PNG\r\n\x1a\n')), null);
  assert.equal(inspectShopLogo(new Uint8Array(MAX_SHOP_LOGO_BYTES + 1)), null);
});

test('rejects images with dimensions too large for a shop logo', () => {
  const bytes = tinyPng();
  bytes.writeUInt32BE(10_000, 16);
  assert.equal(inspectShopLogo(bytes), null);
});
