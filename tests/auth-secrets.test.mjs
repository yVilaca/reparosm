import assert from 'node:assert/strict';
import test from 'node:test';

test('auth secrets round-trip and reject tampering', async () => {
  let secrets;
  try {
    secrets = await import('../lib/auth-secrets.ts');
  } catch {
    assert.fail('lib/auth-secrets.ts must exist');
  }

  assert.equal(typeof secrets.encryptAuthSecret, 'function');
  assert.equal(typeof secrets.decryptAuthSecret, 'function');

  const previous = process.env.AUTH_ENCRYPTION_KEY;
  process.env.AUTH_ENCRYPTION_KEY = 'ab'.repeat(32);
  try {
    const encrypted = await secrets.encryptAuthSecret('totp-secret');
    assert.match(encrypted, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.notEqual(encrypted, 'totp-secret');
    assert.equal(await secrets.decryptAuthSecret(encrypted), 'totp-secret');
    await assert.rejects(() => secrets.decryptAuthSecret(`${encrypted}x`));
  } finally {
    if (previous === undefined) delete process.env.AUTH_ENCRYPTION_KEY;
    else process.env.AUTH_ENCRYPTION_KEY = previous;
  }
});
