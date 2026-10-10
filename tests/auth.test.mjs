import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { linkToken, outbox, openLink } from './support/access.mjs';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, auth, lib, accounts;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  auth = await import('../app/api/auth/route.ts');
  accounts = await import('../app/api/accounts/route.ts');
  lib = await import('../lib/auth.ts');
});
after(async () => db?.drop());

const request = (body, { cookie = '', origin = 'https://test.local', ip = '10.0.0.1' } = {}) =>
  new Request('https://test.local/api/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin,
      cookie,
      'x-nf-client-connection-ip': ip,
    },
    body: JSON.stringify(body),
  });
const get = (cookie = '') =>
  new Request('https://test.local/api/accounts', { headers: { cookie } });
const login = (username, password, ip) =>
  auth.POST(request({ action: 'login', username, password }, { ip }));
const cookieOf = (response) => response.headers.get('set-cookie').split(';')[0];
const signedIn = (cookie) => lib.currentAccount(request({}, { cookie }));

/** Loja nova: o dono recebe o convite e cria a senha pelo link. */
async function createStore(adminCookie, username, password) {
  const response = await accounts.POST(
    request(
      {
        username,
        name: `Loja ${username}`,
        ownerName: 'Dono',
        ownerEmail: `${username}@lojas.test`,
      },
      { cookie: adminCookie },
    ),
  );
  assert.equal(response.status, 201);
  const created = await response.json();
  await openLink(linkToken(`${username}@lojas.test`), password);
  return created;
}

test(
  'recovery flow: admin, owner, invite, forgotten password and request queue',
  { skip },
  async () => {
    for (let i = 0; i < 7; i++) assert.equal((await login('adminreparosm', 'wrong')).status, 401);
    assert.equal((await login('admin', 'admin')).status, 401);
    let response = await login('adminreparosm', 'TestAdminPassword123');
    assert.equal(response.status, 200);
    const adminCookie = cookieOf(response);
    assert.equal((await response.json()).account.user.mustChangePassword, false);

    // Loja nova sem senha definida por ninguém: só o convite.
    response = await accounts.POST(
      request(
        {
          username: 'testmerchant',
          name: 'Test',
          ownerName: 'Tess',
          ownerEmail: 'tess@lojas.test',
        },
        { cookie: adminCookie },
      ),
    );
    assert.equal(response.status, 201);
    const { account, invite } = await response.json();
    assert.deepEqual(invite, { sent: true, to: 'tess@lojas.test' });
    assert.equal((await accounts.GET(get())).status, 403);
    assert.equal((await login('testmerchant', '!')).status, 401, 'convite pendente não entra');

    const { response: used, cookie: ownerCookie } = await openLink(
      linkToken('tess@lojas.test'),
      'Testpassword123',
    );
    assert.equal(used.status, 200);
    assert.equal((await signedIn(ownerCookie)).id, account.id, 'o link já entra logado');
    assert.equal((await accounts.GET(get(ownerCookie))).status, 403);

    // Esqueci a senha (pelo e-mail): link na hora, resposta igual exista ou não.
    const before = outbox().length;
    response = await auth.POST(request({ action: 'forgot-password', username: 'tess@lojas.test' }));
    const generic = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(
      await (await auth.POST(request({ action: 'forgot-password', username: 'unknown' }))).json(),
      generic,
    );
    assert.equal(outbox().length, before + 1);
    assert.match(outbox().at(-1).subject, /nova senha/i);
    const { response: reset } = await openLink(linkToken('tess@lojas.test'), 'Newpassword123');
    assert.equal(reset.status, 200);
    assert.equal(await signedIn(ownerCookie), null, 'nova senha desconecta os outros aparelhos');
    assert.match(outbox().at(-1).subject, /senha do ReparoSM foi alterada/);
    assert.equal((await login('testmerchant', 'Testpassword123')).status, 401);
    assert.equal((await login('testmerchant', 'Newpassword123')).status, 200);
    assert.equal(
      (await login('tess@lojas.test', 'Newpassword123')).status,
      200,
      'entra pelo e-mail',
    );

    // Dono sem e-mail: o pedido vai para a fila do administrador.
    await db.migrationQuery(`UPDATE users SET email = NULL WHERE username = 'testmerchant'`);
    await auth.POST(request({ action: 'forgot-password', username: 'testmerchant' }));
    let queue = await (await accounts.GET(get(adminCookie))).json();
    assert.equal(queue.requests.length, 1);
    assert.equal(queue.requests[0].accountId, account.id);
    assert.equal(queue.requests[0].username, 'testmerchant');
    const userId = queue.requests[0].userId;
    const copy = { action: 'copy-link', userId };
    assert.equal((await accounts.POST(request(copy, { cookie: adminCookie }))).status, 400);
    response = await accounts.POST(
      request({ ...copy, identityConfirmed: true }, { cookie: adminCookie }),
    );
    const delivery = (await response.json()).invite;
    assert.equal(delivery.sent, false);
    assert.equal(delivery.reason, 'copy');
    await openLink(linkToken(delivery.url), 'Thirdpassword123');
    assert.equal((await login('testmerchant', 'Thirdpassword123')).status, 200);
    queue = await (await accounts.GET(get(adminCookie))).json();
    assert.equal(queue.requests.length, 0, 'usar o link resolve o pedido');

    assert.equal(
      (
        await auth.POST(
          request(
            { action: 'forgot-password', username: 'testmerchant' },
            { origin: 'https://attacker.local' },
          ),
        )
      ).status,
      403,
    );
    assert.equal(
      (await auth.POST(request({ action: 'change-password' }, { cookie: adminCookie }))).status,
      400,
    );
    assert.equal(
      (
        await accounts.POST(
          request(
            { ...copy, userId: 'user-adminreparosm', identityConfirmed: true },
            { cookie: adminCookie },
          ),
        )
      ).status,
      404,
      'a conta do administrador não recebe link',
    );
  },
);

test('sessions store only a hash of the token', { skip }, async () => {
  const response = await login('adminreparosm', 'TestAdminPassword123', '10.0.0.2');
  const token = cookieOf(response).split('=')[1];
  const rows = await db.migrationQuery('SELECT token_hash FROM sessions');
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((row) => row.token_hash !== token && /^[0-9a-f]{64}$/.test(row.token_hash)));
});

test('logout ends only this session', { skip }, async () => {
  const cookie = cookieOf(await login('adminreparosm', 'TestAdminPassword123', '10.0.0.3'));
  const other = cookieOf(await login('adminreparosm', 'TestAdminPassword123', '10.0.0.3'));
  assert.ok(await signedIn(cookie));
  await auth.POST(request({ action: 'logout' }, { cookie }));
  assert.equal(await signedIn(cookie), null);
  assert.ok(await signedIn(other), 'o outro aparelho segue');
});

test('expired sessions are rejected', { skip }, async () => {
  const cookie = cookieOf(await login('adminreparosm', 'TestAdminPassword123', '10.0.0.4'));
  await db.migrationQuery(`UPDATE sessions SET expires_at = now() - interval '1 minute'`);
  assert.equal(await signedIn(cookie), null);
});

test('ten failures from one IP lock that user and IP only', { skip }, async () => {
  const adminCookie = cookieOf(await login('adminreparosm', 'TestAdminPassword123', '10.0.0.5'));
  await createStore(adminCookie, 'lockme', 'Lockpassword123');
  for (let i = 0; i < 10; i++) assert.equal((await login('lockme', 'bad', '10.9.9.9')).status, 401);
  assert.equal((await login('lockme', 'Lockpassword123', '10.9.9.9')).status, 429);
  assert.equal((await login('lockme', 'Lockpassword123', '10.8.8.8')).status, 200);
});

test('suspended shops cannot sign in and lose their sessions', { skip }, async () => {
  const adminCookie = cookieOf(await login('adminreparosm', 'TestAdminPassword123', '10.0.0.6'));
  const created = await createStore(adminCookie, 'paused', 'Pausedpassword123');
  const cookie = cookieOf(await login('paused', 'Pausedpassword123', '10.0.0.6'));
  await accounts.POST(
    request({ id: created.account.id, status: 'suspended' }, { cookie: adminCookie }),
  );
  assert.equal(await signedIn(cookie), null);
  assert.equal((await login('paused', 'Pausedpassword123', '10.0.0.6')).status, 403);
});

test('deleting an account cascades to all of its data', { skip }, async () => {
  const adminCookie = cookieOf(await login('adminreparosm', 'TestAdminPassword123', '10.0.0.7'));
  const created = await createStore(adminCookie, 'gone', 'Gonepassword123');
  const id = created.account.id;
  await login('gone', 'Gonepassword123', '10.0.0.7');
  await auth.POST(request({ action: 'forgot-password', username: 'gone' }));
  const { clients, orders } = await import('../lib/repos/index.ts');
  await orders.save(id, 'order-gone', { code: 'OS-1', customer: 'A', device: 'B' });
  // Telefone real: sem ele a OS não cadastra cliente e o teste de exclusão em
  // cascata deixaria de verificar a tabela de clientes.
  await clients.upsertFromOrder(id, { customer: 'A', phone: '11966665555', status: 'Aberto' });
  const response = await accounts.DELETE(
    new Request(`https://test.local/api/accounts?id=${id}`, {
      method: 'DELETE',
      headers: { origin: 'https://test.local', cookie: adminCookie },
    }),
  );
  assert.deepEqual(await response.json(), { ok: true });
  for (const table of [
    'users',
    'sessions',
    'password_requests',
    'access_links',
    'orders',
    'clients',
  ])
    assert.equal(
      (await db.migrationQuery(`SELECT 1 FROM ${table} WHERE account_id = $1`, [id])).length,
      0,
    );
});
