import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { accessRequest, linkToken, outbox, openLink } from './support/access.mjs';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

// Acesso por link: segurança (uso único, validade, só o hash guardado) e os fluxos.
const skip = skipWithoutDatabase;
let db, auth, accounts, team, me, access, provisioning, lib;

before(async () => {
  if (skip) return;
  process.env.APP_URL = 'https://app.reparosm.test';
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  auth = await import('../app/api/auth/route.ts');
  accounts = await import('../app/api/accounts/route.ts');
  team = await import('../app/api/team/route.ts');
  me = await import('../app/api/me/route.ts');
  access = await import('../app/api/access/route.ts');
  provisioning = await import('../app/api/provisioning/stores/route.ts');
  lib = await import('../lib/auth.ts');
});
after(async () => db?.drop());

let ip = 0;
const call = (handler, url, { body, cookie = '', headers = {} } = {}) =>
  handler(
    new Request(`https://test.local${url}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://test.local',
        cookie,
        'x-nf-client-connection-ip': `10.8.0.${++ip % 250}`,
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
const cookieOf = (response) => response.headers.get('set-cookie').split(';')[0];
const login = (username, password) =>
  call(auth.POST, '/api/auth', { body: { action: 'login', username, password } });
const signedIn = (cookie) =>
  lib.currentAccount(new Request('https://test.local/', { headers: { cookie } }));
const inspect = async (token) =>
  (await access.POST(accessRequest({ action: 'inspect', token }))).json();

let admin;
async function store(username) {
  admin ??= cookieOf(await login('adminreparosm', 'TestAdminPassword123'));
  const response = await call(accounts.POST, '/api/accounts', {
    cookie: admin,
    body: {
      username,
      name: `Loja <b>${username}</b>`,
      ownerName: 'Dono',
      ownerEmail: `${username}@lojas.test`,
    },
  });
  assert.equal(response.status, 201);
  return (await response.json()).account;
}

test('a link stores only its hash, opens without being used and works once', { skip }, async () => {
  await store('umavez');
  const mail = outbox().at(-1);
  assert.equal(mail.to, 'umavez@lojas.test');
  assert.match(mail.subject, /está pronta no ReparoSM/);
  assert.match(
    mail.text,
    /https:\/\/app\.reparosm\.test\/acesso#t=/,
    'endereço fixo, não da requisição',
  );
  assert.match(mail.html, /Loja &lt;b&gt;umavez&lt;\/b&gt;/, 'nome da loja escapado no HTML');
  assert.doesNotMatch(mail.html, /<b>umavez<\/b>/);
  const token = linkToken('umavez@lojas.test');

  const rows = await db.migrationQuery('SELECT token_hash FROM access_links');
  assert.ok(rows.every((row) => row.token_hash !== token && /^[0-9a-f]{64}$/.test(row.token_hash)));

  // Abrir (antivírus de e-mail também "abre") não gasta o link.
  for (let i = 0; i < 2; i++) {
    const preview = await inspect(token);
    assert.equal(preview.status, 'valid');
    assert.equal(preview.purpose, 'invite');
    assert.equal(preview.username, 'umavez');
  }
  let response = await access.POST(accessRequest({ action: 'consume', token, password: 'curta' }));
  assert.equal(response.status, 400, 'senha fraca não gasta o link');
  assert.equal((await inspect(token)).status, 'valid');

  const first = await openLink(token);
  assert.equal(first.response.status, 200);
  assert.ok(first.cookie);
  const again = await openLink(token);
  assert.equal(again.response.status, 409);
  assert.equal((await again.response.json()).status, 'used');
  assert.equal((await inspect(token)).status, 'used');
  assert.deepEqual(await inspect('x'.repeat(43)), {
    status: 'invalid',
    error: 'Este link não é válido. Confira se copiou o endereço inteiro.',
  });
  assert.equal((await inspect('curto')).status, 'invalid');
});

test('links expire, and a new link replaces the previous one', { skip }, async () => {
  const account = await store('validade');
  const firstInvite = linkToken('validade@lojas.test');
  const copied = await call(accounts.POST, '/api/accounts', {
    cookie: admin,
    body: { action: 'copy-link', userId: 'user-validade', identityConfirmed: true },
  });
  const secondInvite = linkToken((await copied.json()).invite.url);
  assert.equal((await inspect(firstInvite)).status, 'expired', 'o link anterior parou de valer');
  assert.equal((await inspect(secondInvite)).status, 'valid');

  await db.migrationQuery(
    `UPDATE access_links SET expires_at = now() - interval '1 minute' WHERE account_id = $1`,
    [account.id],
  );
  assert.equal((await inspect(secondInvite)).status, 'expired');
  const late = await openLink(secondInvite);
  assert.equal(late.response.status, 409);
  assert.equal((await late.response.json()).status, 'expired');
});

test('a copied link does not confirm the e-mail; an e-mailed one does', { skip }, async () => {
  await store('confirma');
  const copied = await call(accounts.POST, '/api/accounts', {
    cookie: admin,
    body: { action: 'copy-link', userId: 'user-confirma', identityConfirmed: true },
  });
  const { cookie } = await openLink(linkToken((await copied.json()).invite.url));
  assert.equal((await signedIn(cookie)).user.emailVerified, false);

  const sent = await call(accounts.POST, '/api/accounts', {
    cookie: admin,
    body: { action: 'send-link', userId: 'user-confirma' },
  });
  assert.deepEqual((await sent.json()).invite, { sent: true, to: 'confirma@lojas.test' });
  assert.match(outbox().at(-1).subject, /nova senha/i, 'quem já tem senha recebe "nova senha"');
  const reset = await openLink(linkToken('confirma@lojas.test'), 'Novasenha1234');
  assert.equal((await signedIn(reset.cookie)).user.emailVerified, true);
  assert.equal(await signedIn(cookie), null, 'nova senha desconecta os outros aparelhos');
});

test('people without access and suspended shops cannot use links', { skip }, async () => {
  const account = await store('bloqueio');
  const owner = await openLink(linkToken('bloqueio@lojas.test'));
  const created = await call(team.POST, '/api/team', {
    cookie: owner.cookie,
    body: { action: 'create', name: 'Ana', username: 'ana.bloqueio', email: 'ana@bloqueio.test' },
  });
  const { user } = await created.json();
  const token = linkToken('ana@bloqueio.test');
  await call(team.POST, '/api/team', {
    cookie: owner.cookie,
    body: { action: 'update', id: user.id, status: 'disabled' },
  });
  assert.equal((await inspect(token)).status, 'blocked');
  const refused = await openLink(token);
  assert.equal((await refused.response.json()).status, 'blocked');

  await call(team.POST, '/api/team', {
    cookie: owner.cookie,
    body: { action: 'update', id: user.id, status: 'active' },
  });
  assert.equal((await inspect(token)).status, 'valid', 'recusar não gasta o link');
  await call(accounts.POST, '/api/accounts', {
    cookie: admin,
    body: { id: account.id, status: 'suspended' },
  });
  assert.equal((await inspect(token)).status, 'blocked');
});

test('forgot password by e-mail sends at most three links in 15 minutes', { skip }, async () => {
  await store('limite');
  await openLink(linkToken('limite@lojas.test'));
  const before = outbox().filter((mail) => mail.to === 'limite@lojas.test').length;
  for (let i = 0; i < 5; i++) {
    const response = await call(auth.POST, '/api/auth', {
      body: { action: 'forgot-password', username: 'LIMITE@lojas.test ' },
    });
    assert.equal(response.status, 200);
  }
  const sent = outbox().filter((mail) => mail.to === 'limite@lojas.test').length - before;
  // O convite já contou como um dos três links recentes.
  assert.equal(sent, 2);
});

test(
  'changing the e-mail needs the password and a click on the new address',
  { skip },
  async () => {
    await store('trocamail');
    const { cookie } = await openLink(linkToken('trocamail@lojas.test'), 'Donosenha123');
    const change = (body) =>
      call(me.POST, '/api/me', { cookie, body: { action: 'email', ...body } });

    assert.equal(
      (await change({ email: 'novo@trocamail.test', currentPassword: 'errada1234' })).status,
      400,
    );
    const response = await change({
      email: 'Novo@TrocaMail.test',
      currentPassword: 'Donosenha123',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).pendingEmail.email, 'novo@trocamail.test');
    assert.equal(outbox().at(-1).to, 'novo@trocamail.test');
    assert.match(outbox().at(-1).subject, /Confirme seu e-mail/);
    assert.equal((await signedIn(cookie)).user.email, 'trocamail@lojas.test', 'ainda não mudou');

    const token = linkToken('novo@trocamail.test');
    const preview = await inspect(token);
    assert.equal(preview.purpose, 'email');
    assert.equal(preview.email, 'novo@trocamail.test');
    const confirmed = await access.POST(accessRequest({ action: 'consume', token }));
    assert.equal(confirmed.status, 200);
    assert.equal((await confirmed.json()).signedIn, false, 'confirmar e-mail não abre sessão');
    const user = (await signedIn(cookie)).user;
    assert.equal(user.email, 'novo@trocamail.test');
    assert.equal(user.emailVerified, true);
    assert.equal((await login('novo@trocamail.test', 'Donosenha123')).status, 200);
    assert.equal((await login('trocamail@lojas.test', 'Donosenha123')).status, 401);
  },
);

test(
  'an e-mail taken meanwhile is refused at confirmation and the link stays unused',
  { skip },
  async () => {
    await store('disputa');
    const { cookie } = await openLink(linkToken('disputa@lojas.test'), 'Donosenha123');
    await call(me.POST, '/api/me', {
      cookie,
      body: { action: 'email', email: 'concorrido@x.test', currentPassword: 'Donosenha123' },
    });
    const token = linkToken('concorrido@x.test');
    await db.migrationQuery(
      `UPDATE users SET email = 'concorrido@x.test' WHERE username = 'trocamail'`,
    );
    const refused = await access.POST(accessRequest({ action: 'consume', token }));
    assert.equal(refused.status, 409);
    assert.equal((await refused.json()).status, 'email-taken');
    assert.equal((await inspect(token)).status, 'valid');
  },
);

test(
  'purchase provisioning is secret-protected and creates each store once',
  { skip },
  async () => {
    const purchase = (body, token = 'p'.repeat(40)) =>
      call(provisioning.POST, '/api/provisioning/stores', {
        body,
        headers: { authorization: `Bearer ${token}`, origin: '' },
      });
    const order = {
      externalId: 'pedido-123',
      storeName: 'Cell Prime',
      ownerName: 'Marcos Oliveira',
      ownerEmail: 'Marcos.Oliveira@Exemplo.test',
      plan: 'Anual',
      dueDate: '2027-10-10',
    };
    delete process.env.PROVISIONING_TOKEN;
    assert.equal((await purchase(order)).status, 404, 'sem chave configurada, a rota não existe');
    process.env.PROVISIONING_TOKEN = 'p'.repeat(40);
    assert.equal((await purchase(order, 'errada')).status, 401);
    assert.equal((await purchase({ ...order, ownerEmail: 'sem-arroba' })).status, 400);

    const created = await purchase(order);
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.created, true);
    assert.equal(body.username, 'marcos.oliveira', 'usuário sai do e-mail');
    assert.deepEqual(body.invite, { sent: true, to: 'marcos.oliveira@exemplo.test' });
    assert.match(outbox().at(-1).subject, /Sua loja Cell Prime está pronta/);

    const repeated = await purchase(order);
    assert.equal(repeated.status, 200);
    assert.deepEqual(await repeated.json(), {
      created: false,
      accountId: body.accountId,
      username: 'marcos.oliveira',
    });
    const second = await purchase({
      ...order,
      externalId: 'pedido-124',
      ownerEmail: 'outro@exemplo.test',
      ownerName: 'Marcos',
    });
    assert.equal((await second.json()).username, 'outro');
    const [{ count }] = await db.migrationQuery(
      `SELECT count(*)::int AS count FROM accounts WHERE external_ref = 'pedido-123'`,
    );
    assert.equal(count, 1);
  },
);

test('access links are isolated by store', { skip }, async () => {
  const one = await store('isolada');
  const two = await store('vizinha');
  const seen = await db.tenantQuery(two.id, 'SELECT account_id FROM access_links ORDER BY 1');
  assert.ok(seen.every((row) => row.account_id === two.id));
  assert.ok(seen.length >= 1);
  assert.deepEqual(await db.query('SELECT 1 FROM access_links'), [], 'sem contexto, nada');
  await assert.rejects(
    db.tenantQuery(
      two.id,
      `INSERT INTO access_links (token_hash, user_id, account_id, purpose, expires_at)
       VALUES ($1, 'user-isolada', $2, 'reset', now() + interval '1 hour')`,
      ['c'.repeat(64), one.id],
    ),
    { code: '42501' },
  );
});
