import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, A, B, orderRoute, photosRoute, photoRoute;

async function merchant(username) {
  const { createSession } = await import('../lib/repos/sessions.ts');
  const id = `account-${username}`;
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ($1, $2, $2, 'merchant', 'active', 'unused')`,
    [id, username],
  );
  return { id, cookie: `reparosm_session=${await createSession(username, id)}` };
}

const request = (path, who, method = 'GET', body) =>
  new Request(`https://test.local/api/${path}`, {
    method,
    headers: {
      origin: 'https://test.local',
      cookie: who?.cookie || '',
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  A = await merchant('photos-a');
  B = await merchant('photos-b');
  orderRoute = await import('../app/api/orders/route.ts');
  photosRoute = await import('../app/api/orders/[orderId]/photos/route.ts');
  photoRoute = await import('../app/api/order-photos/[photoId]/route.ts');
});

after(async () => db?.drop());

async function createOrder(who) {
  const response = await orderRoute.POST(
    request('orders', who, 'POST', {
      data: {
        code: '',
        customer: 'Foto Teste',
        phone: '',
        device: 'iPhone',
        problem: 'Tela quebrada',
      },
    }),
  );
  assert.equal(response.status, 201);
  return (await response.json()).record.id;
}

const pixel = () =>
  new File(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n1sAAAAASUVORK5CYII=',
        'base64',
      ),
    ],
    'prova.png',
    { type: 'image/png' },
  );

test('order photos are private, tenant-scoped, and validate image bytes', { skip }, async () => {
  const orderId = await createOrder(A);
  const upload = new FormData();
  upload.set('photo', pixel());
  const createdResponse = await photosRoute.POST(
    request(`orders/${orderId}/photos`, A, 'POST', upload),
    { params: Promise.resolve({ orderId }) },
  );
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.photo.contentType, 'image/png');

  const savedPhotos = [created.photo];
  for (let index = 0; index < 4; index++) {
    const nextUpload = new FormData();
    nextUpload.set('photo', pixel());
    const response = await photosRoute.POST(
      request(`orders/${orderId}/photos`, A, 'POST', nextUpload),
      { params: Promise.resolve({ orderId }) },
    );
    assert.equal(response.status, 201);
    savedPhotos.push((await response.json()).photo);
  }
  const extraUpload = new FormData();
  extraUpload.set('photo', pixel());
  assert.equal(
    (
      await photosRoute.POST(request(`orders/${orderId}/photos`, A, 'POST', extraUpload), {
        params: Promise.resolve({ orderId }),
      })
    ).status,
    409,
  );

  const listed = await (
    await photosRoute.GET(request(`orders/${orderId}/photos`, A), {
      params: Promise.resolve({ orderId }),
    })
  ).json();
  assert.equal(listed.photos.length, 5);
  assert.deepEqual(
    await db.tenantQuery(B.id, 'SELECT id FROM order_photos WHERE account_id = $1', [A.id]),
    [],
  );

  const image = await photoRoute.GET(request(`order-photos/${created.photo.id}`, A), {
    params: Promise.resolve({ photoId: created.photo.id }),
  });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  const originalBytes = Buffer.from(await pixel().arrayBuffer());
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), originalBytes);

  const [storedRow] = await db.migrationQuery(
    'SELECT bytes FROM order_photos WHERE account_id = $1 AND id = $2',
    [A.id, created.photo.id],
  );
  assert.deepEqual(storedRow.bytes, originalBytes);

  assert.equal(
    (
      await photoRoute.DELETE(request(`order-photos/${created.photo.id}`, B, 'DELETE'), {
        params: Promise.resolve({ photoId: created.photo.id }),
      })
    ).status,
    404,
  );

  assert.equal(
    (
      await photoRoute.GET(request(`order-photos/${created.photo.id}`, B), {
        params: Promise.resolve({ photoId: created.photo.id }),
      })
    ).status,
    404,
  );
  const foreignUpload = new FormData();
  foreignUpload.set('photo', pixel());
  assert.equal(
    (
      await photosRoute.POST(request(`orders/${orderId}/photos`, B, 'POST', foreignUpload), {
        params: Promise.resolve({ orderId }),
      })
    ).status,
    404,
  );

  const invalid = new FormData();
  invalid.set('photo', new File(['not an image'], 'fake.png', { type: 'image/png' }));
  assert.equal(
    (
      await photosRoute.POST(request(`orders/${orderId}/photos`, A, 'POST', invalid), {
        params: Promise.resolve({ orderId }),
      })
    ).status,
    400,
  );

  const removed = await orderRoute.DELETE(
    request(`orders?id=${encodeURIComponent(orderId)}`, A, 'DELETE'),
  );
  assert.equal(removed.status, 200);
  assert.equal(
    (
      await photosRoute.GET(request(`orders/${orderId}/photos`, A), {
        params: Promise.resolve({ orderId }),
      })
    ).status,
    404,
  );
  assert.deepEqual(
    await db.migrationQuery('SELECT id FROM order_photos WHERE account_id = $1 AND order_id = $2', [
      A.id,
      orderId,
    ]),
    [],
  );
});
