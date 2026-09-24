import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, auth, proxy;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  auth = await import('../app/api/auth/route.ts');
  ({ proxy } = await import('../proxy.ts'));
});

after(async () => db?.drop());

const login = () =>
  auth.POST(
    new Request('https://test.local/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://test.local' },
      body: JSON.stringify({
        action: 'login',
        username: 'adminreparosm',
        password: 'TestAdminPassword123',
      }),
    }),
  );

const cookieOf = (response) => response.headers.get('set-cookie').split(';')[0];

test('redirects anonymous panel requests to login', { skip }, async () => {
  const response = await proxy(new Request('https://test.local/ordens'));

  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://test.local/login');
});

test('allows authenticated panel requests through', { skip }, async () => {
  const response = await proxy(
    new Request('https://test.local/ordens', { headers: { cookie: cookieOf(await login()) } }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});
