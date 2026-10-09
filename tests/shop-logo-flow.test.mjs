import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
const logoBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
let db, privateRoute, publicRoute, A, B;

async function merchant(username) {
  const { sessionCookie } = await import('./support/session.mjs');
  const id = `account-${username}`;
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ($1, $2, $2, 'merchant', 'active')`,
    [id, username],
  );
  return { id, cookie: await sessionCookie(db, username, id) };
}

const upload = async (who, bytes = logoBytes, name = 'logo.png', type = 'image/png') => {
  const form = new FormData();
  form.set('file', new File([bytes], name, { type }));
  return privateRoute.POST(
    new Request('https://test.local/api/shops/logo', {
      method: 'POST',
      headers: { origin: 'https://test.local', cookie: who.cookie },
      body: form,
    }),
  );
};

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  privateRoute = await import('../app/api/shops/logo/route.ts');
  publicRoute = await import('../app/api/public/shops/logo/route.ts');
  A = await merchant('logo-a');
  B = await merchant('logo-b');
});
after(async () => db?.drop());

test('stores and serves a valid logo only to its own authenticated shop', { skip }, async () => {
  const response = await upload(A);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { logo: '/api/shops/logo' });

  const own = await privateRoute.GET(
    new Request('https://test.local/api/shops/logo', { headers: { cookie: A.cookie } }),
  );
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await own.arrayBuffer()), logoBytes);

  const other = await privateRoute.GET(
    new Request('https://test.local/api/shops/logo', { headers: { cookie: B.cookie } }),
  );
  assert.equal(other.status, 404);
});

test('serves the uploaded logo through the public store capability only', { skip }, async () => {
  const response = await publicRoute.GET(
    new Request(`https://test.local/api/public/shops/logo?loja=${A.id}`),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), logoBytes);

  const missing = await publicRoute.GET(
    new Request('https://test.local/api/public/shops/logo?loja=account-missing'),
  );
  assert.equal(missing.status, 404);
});

test('rejects spoofed files before storing them', { skip }, async () => {
  const html = await upload(A, Buffer.from('<script>alert(1)</script>'), 'logo.png', 'image/png');
  assert.equal(html.status, 400);
  assert.match((await html.json()).error, /PNG, JPEG ou WebP/);

  const svg = await upload(A, Buffer.from('<svg></svg>'), 'logo.svg', 'image/svg+xml');
  assert.equal(svg.status, 400);
  assert.match((await svg.json()).error, /PNG, JPEG ou WebP/);
});

test('removes the private logo and its stored source', { skip }, async () => {
  const response = await privateRoute.DELETE(
    new Request('https://test.local/api/shops/logo', {
      method: 'DELETE',
      headers: { origin: 'https://test.local', cookie: A.cookie },
    }),
  );
  assert.equal(response.status, 200);
  const missing = await privateRoute.GET(
    new Request('https://test.local/api/shops/logo', { headers: { cookie: A.cookie } }),
  );
  assert.equal(missing.status, 404);
});
