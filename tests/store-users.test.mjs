import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

// Várias pessoas por loja: cada uma com login próprio, ao mesmo tempo.
const skip = skipWithoutDatabase;
let db, auth, accounts, team, me, shops, lib;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  auth = await import('../app/api/auth/route.ts');
  accounts = await import('../app/api/accounts/route.ts');
  team = await import('../app/api/team/route.ts');
  me = await import('../app/api/me/route.ts');
  shops = await import('../app/api/shops/route.ts');
  lib = await import('../lib/auth.ts');
});
after(async () => db?.drop());

let ip = 0;
const call = (handler, url, { body, cookie = '', method = body ? 'POST' : 'GET' } = {}) =>
  handler(
    new Request(`https://test.local${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://test.local',
        cookie,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0',
        // IP próprio por chamada: o bloqueio por tentativas não interfere.
        'x-nf-client-connection-ip': `10.7.0.${++ip % 250}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
const cookieOf = (response) => response.headers.get('set-cookie').split(';')[0];
const login = (username, password) =>
  call(auth.POST, '/api/auth', { body: { action: 'login', username, password } });
const signedIn = async (cookie) =>
  lib.currentAccount(new Request('https://test.local/', { headers: { cookie } }));

let admin;
/** Loja nova pelo administrador, com o Dono já tendo criado a própria senha. */
async function store(username) {
  admin ??= cookieOf(await login('adminreparosm', 'TestAdminPassword123'));
  const response = await call(accounts.POST, '/api/accounts', {
    cookie: admin,
    body: { username, name: `Loja ${username}`, ownerName: 'Dono', password: 'Provisoria123' },
  });
  assert.equal(response.status, 201);
  const owner = cookieOf(await login(username, 'Provisoria123'));
  await call(me.POST, '/api/me', {
    cookie: owner,
    body: { action: 'password', currentPassword: 'Provisoria123', password: 'Donosenha123' },
  });
  return { id: (await response.json()).account.id, owner };
}
async function addStaff(owner, username, extra = {}) {
  const response = await call(team.POST, '/api/team', {
    cookie: owner,
    body: {
      action: 'create',
      name: `Pessoa ${username}`,
      username,
      password: 'Provisoria123',
      ...extra,
    },
  });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()).user;
}

test(
  'two people of the same shop, and one person on two devices, stay signed in together',
  { skip },
  async () => {
    const shop = await store('balcao');
    await addStaff(shop.owner, 'bancada');
    const staff = cookieOf(await login('bancada', 'Provisoria123'));
    const ownerAgain = cookieOf(await login('balcao', 'Donosenha123'));
    const staffAgain = cookieOf(await login('bancada', 'Provisoria123'));

    for (const cookie of [shop.owner, staff, ownerAgain, staffAgain]) {
      const account = await signedIn(cookie);
      assert.ok(account, 'nenhum login derrubou outro');
      assert.equal(account.id, shop.id, 'todos trabalham nos dados da mesma loja');
    }
    const person = await signedIn(staff);
    assert.equal(person.user.username, 'bancada');
    assert.equal(person.user.role, 'staff');
    assert.equal(person.user.mustChangePassword, true);
  },
);

test('only the owner manages the team and the shop profile', { skip }, async () => {
  const shop = await store('donoloja');
  await addStaff(shop.owner, 'ajudante');
  const staff = cookieOf(await login('ajudante', 'Provisoria123'));

  assert.equal((await call(team.GET, '/api/team', { cookie: staff })).status, 403);
  assert.equal(
    (await call(team.POST, '/api/team', { cookie: staff, body: { action: 'create' } })).status,
    403,
  );
  const profile = { data: { name: 'Novo nome', phone: '11999990000' } };
  assert.equal(
    (await call(shops.POST, '/api/shops', { cookie: staff, body: profile })).status,
    403,
  );
  assert.equal(
    (await call(shops.POST, '/api/shops', { cookie: shop.owner, body: profile })).status,
    201,
  );

  const list = await (await call(team.GET, '/api/team', { cookie: shop.owner })).json();
  assert.deepEqual(
    list.users.map((user) => [user.username, user.role]),
    [
      ['donoloja', 'owner'],
      ['ajudante', 'staff'],
    ],
  );
  assert.equal(list.users[1].sessions, 1, 'mostra os aparelhos conectados');
});

test('a username is unique across every shop', { skip }, async () => {
  const one = await store('lojaum');
  const two = await store('lojadois');
  await addStaff(one.owner, 'mesmonome');
  const response = await call(team.POST, '/api/team', {
    cookie: two.owner,
    body: { action: 'create', name: 'Outro', username: 'mesmonome', password: 'Provisoria123' },
  });
  assert.equal(response.status, 409);
  const other = await (await call(team.GET, '/api/team', { cookie: two.owner })).json();
  assert.ok(
    !other.users.some((user) => user.username === 'mesmonome'),
    'cada loja vê só a sua equipe',
  );
});

test(
  'a provisional password must be replaced; changing it signs out the other devices',
  { skip },
  async () => {
    const shop = await store('senhaloja');
    await addStaff(shop.owner, 'novato');
    const first = cookieOf(await login('novato', 'Provisoria123'));
    const second = cookieOf(await login('novato', 'Provisoria123'));

    let response = await call(me.POST, '/api/me', {
      cookie: second,
      body: { action: 'password', currentPassword: 'errada12345', password: 'Minhasenha123' },
    });
    assert.equal(response.status, 400);
    response = await call(me.POST, '/api/me', {
      cookie: second,
      body: { action: 'password', currentPassword: 'Provisoria123', password: 'Minhasenha123' },
    });
    assert.equal(response.status, 200);

    assert.equal(await signedIn(first), null, 'o outro aparelho saiu');
    const current = await signedIn(second);
    assert.ok(current, 'este aparelho continua');
    assert.equal(current.user.mustChangePassword, false);
    assert.equal((await login('novato', 'Provisoria123')).status, 401);
    assert.equal((await login('novato', 'Minhasenha123')).status, 200);
  },
);

test('Minha conta lists the devices and ends the others', { skip }, async () => {
  const shop = await store('aparelhos');
  const other = cookieOf(await login('aparelhos', 'Donosenha123'));
  let mine = await (await call(me.GET, '/api/me', { cookie: shop.owner })).json();
  assert.equal(mine.sessions.length, 2);
  assert.equal(mine.sessions.filter((session) => session.current).length, 1);
  assert.match(mine.sessions[0].userAgent, /Chrome/);

  const response = await call(me.POST, '/api/me', {
    cookie: shop.owner,
    body: { action: 'end-other-sessions' },
  });
  assert.deepEqual(await response.json(), { ended: 1 });
  assert.equal(await signedIn(other), null);
  mine = await (await call(me.GET, '/api/me', { cookie: shop.owner })).json();
  assert.equal(mine.sessions.length, 1);
});

test(
  'taking access away signs the person out, and the shop always keeps an active owner',
  { skip },
  async () => {
    const shop = await store('desligar');
    const user = await addStaff(shop.owner, 'saiu');
    const staff = cookieOf(await login('saiu', 'Provisoria123'));

    const update = (cookie, body) =>
      call(team.POST, '/api/team', { cookie, body: { action: 'update', ...body } });
    assert.equal((await update(shop.owner, { id: user.id, status: 'disabled' })).status, 200);
    assert.equal(await signedIn(staff), null);
    assert.equal((await login('saiu', 'Provisoria123')).status, 403);

    const self = (await signedIn(shop.owner)).user.id;
    assert.equal((await update(shop.owner, { id: self, status: 'disabled' })).status, 400);
    const demote = await update(shop.owner, { id: self, role: 'staff' });
    assert.equal(demote.status, 400);
    assert.match((await demote.json()).error, /pelo menos um Dono ativo/);

    assert.equal((await update(shop.owner, { id: user.id, status: 'active' })).status, 200);
    assert.equal((await login('saiu', 'Provisoria123')).status, 200);
  },
);

test(
  'a staff password request goes to the owner; an owner request goes to the administrator',
  { skip },
  async () => {
    const shop = await store('pedidos');
    const user = await addStaff(shop.owner, 'esqueceu');
    const staff = cookieOf(await login('esqueceu', 'Provisoria123'));
    for (const username of ['esqueceu', 'pedidos'])
      await call(auth.POST, '/api/auth', { body: { action: 'forgot-password', username } });

    const mine = await (await call(team.GET, '/api/team', { cookie: shop.owner })).json();
    assert.deepEqual(
      mine.requests.map((request) => request.username),
      ['esqueceu'],
    );
    const adminQueue = await (await call(accounts.GET, '/api/accounts', { cookie: admin })).json();
    assert.deepEqual(
      adminQueue.requests.filter((request) => request.accountId === shop.id).map((r) => r.username),
      ['pedidos'],
    );

    const reset = await call(team.POST, '/api/team', {
      cookie: shop.owner,
      body: { action: 'reset-password', id: user.id, password: 'Outrasenha123' },
    });
    assert.equal(reset.status, 200);
    assert.equal(await signedIn(staff), null, 'senha nova desconecta a pessoa');
    const after = await (await call(team.GET, '/api/team', { cookie: shop.owner })).json();
    assert.equal(after.requests.length, 0);
    const relogin = await login('esqueceu', 'Outrasenha123');
    assert.equal((await relogin.json()).account.user.mustChangePassword, true);
  },
);

test('the administrator sees each shop with its owner, people and renewal', { skip }, async () => {
  const shop = await store('assinatura');
  await addStaff(shop.owner, 'colega');
  await call(accounts.POST, '/api/accounts', {
    cookie: admin,
    body: { id: shop.id, plan: 'Trimestral', dueDate: '2020-01-10' },
  });
  const renewed = await call(accounts.POST, '/api/accounts', {
    cookie: admin,
    body: { action: 'renew', id: shop.id },
  });
  assert.equal(renewed.status, 200);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
  const due = (await renewed.json()).account.dueDate;
  assert.ok(due > today, 'vencido renova a partir de hoje');

  const { stores } = await (await call(accounts.GET, '/api/accounts', { cookie: admin })).json();
  const row = stores.find((item) => item.id === shop.id);
  assert.equal(row.ownerUsername, 'assinatura');
  assert.equal(row.users, 2);
  assert.ok(row.lastLoginAt);
  assert.ok(
    !stores.some((item) => item.id === 'account-admin'),
    'a conta do administrador não é loja',
  );

  const detail = await (
    await call(accounts.GET, `/api/accounts?id=${shop.id}`, { cookie: admin })
  ).json();
  assert.deepEqual(detail.users.map((user) => user.username).sort(), ['assinatura', 'colega']);

  await call(accounts.POST, '/api/accounts', {
    cookie: admin,
    body: { id: shop.id, status: 'suspended' },
  });
  assert.equal(await signedIn(shop.owner), null, 'loja suspensa: todos saem');
});
