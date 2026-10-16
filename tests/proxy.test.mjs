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

test('panel proxy still guards entry points without consulting auth credentials', async () => {
  const { config, proxy: guard } = await import('../proxy.ts');
  assert.deepEqual(config.matcher, ['/', '/ordens/:path*']);
  for (const path of ['/', '/ordens', '/minha-conta']) {
    const response = await guard(new Request(`https://test.local${path}`));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), 'https://test.local/login');
  }
});

test('Google entry and callback responses are never cached', async () => {
  const previousId = process.env.GOOGLE_CLIENT_ID;
  const previousSecret = process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  try {
    const google = await import('../app/api/auth/google/route.ts');
    const callback = await import('../app/api/auth/google/callback/route.ts');
    const entry = await google.GET();
    const rejected = await callback.GET(
      new Request('https://test.local/api/auth/google/callback?error=access_denied'),
    );
    assert.match(entry.headers.get('cache-control') || '', /no-store/i);
    assert.match(rejected.headers.get('cache-control') || '', /no-store/i);
  } finally {
    if (previousId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousId;
    if (previousSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = previousSecret;
  }
});
