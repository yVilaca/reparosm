import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';
import { sessionCookie } from './support/session.mjs';

// Assinatura na tela: a prova fica no banco, montada pelo servidor, e só a loja
// dona da OS lê e grava.
const skip = skipWithoutDatabase;
let db, route, signatures, canonicalContent, cookie;
const A = 'account-sign';
const B = 'account-sign-other';
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const origin = 'https://test.local';

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  route = await import('../app/api/orders/[orderId]/signatures/route.ts');
  signatures = await import('../lib/repos/order-signatures.ts');
  ({ canonicalContent } = await import('../lib/order-signatures.ts'));
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ($1, 'sign', 'Loja do Zé', 'merchant', 'active'),
            ($2, 'sign-other', 'Outra', 'merchant', 'active')`,
    [A, B],
  );
  await db.migrationQuery(
    `INSERT INTO shops (account_id, name, phone, profile)
     VALUES ($1, 'Loja do Zé', '', '{"terms": "Garantia de 90 dias."}')`,
    [A],
  );
  await db.tenantQuery(
    A,
    `INSERT INTO orders (id, account_id, code, customer, device, problem, service, total)
     VALUES ('order-sign', $1, 'OS-12', 'Ana Souza', 'iPhone 11', 'Tela quebrada',
             'Troca de tela', 350)`,
    [A],
  );
  await db.tenantQuery(
    B,
    `INSERT INTO orders (id, account_id, code, customer, device)
     VALUES ('order-sign-other', $1, 'OS-1', 'Bia', 'Moto G')`,
    [B],
  );
  cookie = await sessionCookie(db, 'sign', A);
});
after(async () => db?.drop());

const call = (method, orderId, { body, headers = {}, query = '' } = {}) =>
  route[method](
    new Request(`${origin}/api/orders/${orderId}/signatures${query}`, {
      method,
      headers: { 'Content-Type': 'application/json', origin, cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ orderId }) },
  );

test('signing stores the image and the proof, built by the server', { skip }, async () => {
  const response = await call('POST', 'order-sign', {
    body: {
      role: 'customer',
      signerName: '  Ana Souza ',
      image: PNG,
      // O navegador não escolhe o que foi assinado.
      signedContent: { device: 'Outro aparelho' },
    },
    headers: { 'user-agent': 'Tablet de teste', 'x-real-ip': '203.0.113.7' },
  });
  assert.equal(response.status, 201);
  const { signatures: saved } = await response.json();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].role, 'customer');
  assert.equal(saved[0].signerName, 'Ana Souza');
  assert.equal(saved[0].image, PNG);
  assert.deepEqual(saved[0].changed, []);

  const [row] = await db.migrationQuery('SELECT * FROM order_signatures');
  assert.equal(row.collected_by, 'user-sign');
  assert.equal(row.ip, '203.0.113.7');
  assert.equal(row.user_agent, 'Tablet de teste');
  assert.deepEqual(row.signed_content, {
    code: 'OS-12',
    customer: 'Ana Souza',
    device: 'iPhone 11',
    problem: 'Tela quebrada',
    service: 'Troca de tela',
    total: 350,
    terms: 'Garantia de 90 dias.',
  });
  assert.equal(
    row.content_hash,
    createHash('sha256').update(canonicalContent(row.signed_content)).digest('hex'),
  );
});

test('signing again replaces; later changes to entry data are flagged', { skip }, async () => {
  await call('POST', 'order-sign', {
    body: { role: 'customer', signerName: 'Ana S.', image: PNG },
  });
  assert.equal((await db.migrationQuery('SELECT 1 FROM order_signatures')).length, 1);

  await db.tenantQuery(A, `UPDATE orders SET service = 'Troca de bateria', total = 500`);
  assert.deepEqual(
    (await signatures.list(A, 'order-sign'))[0].changed,
    [],
    'diagnóstico não conta',
  );
  await db.tenantQuery(A, `UPDATE orders SET device = 'iPhone 12'`);
  assert.deepEqual((await signatures.list(A, 'order-sign'))[0].changed, ['aparelho']);

  const listed = await (await call('GET', 'order-sign')).json();
  assert.equal(listed.terms, 'Garantia de 90 dias.');
  assert.equal(listed.signatures[0].signerName, 'Ana S.');
});

test('only a real PNG, a name and a known role are accepted', { skip }, async () => {
  const post = (body) => call('POST', 'order-sign', { body });
  const bad = [
    { role: 'customer', signerName: 'Ana', image: 'data:image/png;base64,AAAA' },
    { role: 'customer', signerName: 'Ana', image: PNG.replace('image/png', 'image/svg+xml') },
    {
      role: 'customer',
      signerName: 'Ana',
      image: `data:image/png;base64,${Buffer.alloc(300 * 1024, 1).toString('base64')}`,
    },
    { role: 'customer', signerName: '   ', image: PNG },
    { role: 'customer', signerName: 'A'.repeat(121), image: PNG },
    { role: 'technician', signerName: 'Ana', image: PNG },
  ];
  for (const body of bad)
    assert.equal((await post(body)).status, 400, JSON.stringify(body).slice(0, 80));
});

test('the route needs a session, the same origin and an order of the shop', { skip }, async () => {
  const body = { role: 'shop', signerName: 'João', image: PNG };
  assert.equal((await call('GET', 'order-sign', { headers: { cookie: '' } })).status, 401);
  assert.equal(
    (await call('POST', 'order-sign', { body, headers: { origin: 'https://golpe.example' } }))
      .status,
    403,
  );
  assert.equal((await call('POST', 'order-sign-other', { body })).status, 404);
  assert.equal((await call('DELETE', 'order-sign-other', { query: '?papel=shop' })).status, 404);
});

test('another shop and no context see nothing', { skip }, async () => {
  assert.deepEqual(await db.tenantQuery(B, 'SELECT order_id FROM order_signatures'), []);
  assert.deepEqual(await db.query('SELECT order_id FROM order_signatures'), []);
  assert.deepEqual(await signatures.list(B, 'order-sign'), []);
  await assert.rejects(
    db.tenantQuery(
      B,
      `INSERT INTO order_signatures (account_id, order_id, role, image, signer_name,
         signed_content, content_hash)
       VALUES ($1, 'order-sign', 'shop', '\\x00', 'X', '{}', repeat('0', 64))`,
      [A],
    ),
    /row-level security/,
  );
});

test('removing one role keeps the other; deleting the order removes all', { skip }, async () => {
  await call('POST', 'order-sign', { body: { role: 'shop', signerName: 'João', image: PNG } });
  const removed = await (await call('DELETE', 'order-sign', { query: '?papel=customer' })).json();
  assert.deepEqual(
    removed.signatures.map((item) => item.role),
    ['shop'],
  );
  await db.tenantQuery(A, `DELETE FROM orders WHERE id = 'order-sign'`);
  assert.deepEqual(await db.migrationQuery('SELECT 1 FROM order_signatures'), []);
});
