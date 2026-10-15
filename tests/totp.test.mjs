import assert from 'node:assert/strict';
import test from 'node:test';

async function subject() {
  try {
    return await import('../lib/totp.ts');
  } catch {
    assert.fail('lib/totp.ts must exist');
  }
}

test('TOTP accepts RFC 6238 vectors and at most one adjacent 30-second step', async () => {
  const { verifyTotp } = await subject();
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const now = 90_000;

  assert.deepEqual(verifyTotp(secret, '969429', { now }), { valid: true, step: 3 });
  assert.deepEqual(verifyTotp(secret, '359152', { now }), { valid: true, step: 2 });
  assert.equal(verifyTotp(secret, '287082', { now }).valid, false);
  assert.equal(verifyTotp(secret, '969429', { now, lastUsedStep: 3 }).valid, false);
});

test('TOTP enrollment is a Google Authenticator compatible ReparoSM URI', async () => {
  const { createTotpEnrollment } = await subject();
  const enrollment = createTotpEnrollment('ana@example.com');
  const uri = new URL(enrollment.uri);

  assert.match(enrollment.secret, /^[A-Z2-7]+$/);
  assert.equal(uri.protocol, 'otpauth:');
  assert.equal(uri.hostname, 'totp');
  assert.equal(uri.searchParams.get('issuer'), 'ReparoSM');
  assert.equal(uri.searchParams.get('secret'), enrollment.secret);
  assert.equal(uri.searchParams.get('algorithm'), 'SHA1');
  assert.equal(uri.searchParams.get('digits'), '6');
  assert.equal(uri.searchParams.get('period'), '30');
});

test('recovery codes are eight unique one-use values', async () => {
  const { createRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } = await subject();
  const codes = createRecoveryCodes();

  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  assert.ok(codes.every((code) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)));
  assert.equal(normalizeRecoveryCode(' abcd  efgh '), 'ABCD-EFGH');
  assert.equal(await hashRecoveryCode('abcd-efgh'), await hashRecoveryCode('ABCD EFGH'));
  assert.match(await hashRecoveryCode(codes[0]), /^[0-9a-f]{64}$/);
});
