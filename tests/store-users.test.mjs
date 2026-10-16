import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { linkToken, openLink } from './support/access.mjs';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

// Várias pessoas por loja: cada uma com login próprio, ao mesmo tempo.
const skip = skipWithoutDatabase;
let db, auth, accounts, team, me, mfa, security, shops, lib, authSecurity, sessionRepo;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  process.env.AUTH_ENCRYPTION_KEY = '11'.repeat(32);
  auth = await import('../app/api/auth/route.ts');
  accounts = await import('../app/api/accounts/route.ts');
  team = await import('../app/api/team/route.ts');
  me = await import('../app/api/me/route.ts');
  mfa = await import('../app/api/auth/mfa/route.ts');
  security = await import('../app/api/me/security/route.ts');
  shops = await import('../app/api/shops/route.ts');
  lib = await import('../lib/auth.ts');
  authSecurity = await import('../lib/repos/auth-security.ts');
  sessionRepo = await import('../lib/repos/sessions.ts');
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
const cookiesOf = (response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
const login = (username, password) =>
  call(auth.POST, '/api/auth', { body: { action: 'login', username, password } });
const signedIn = async (cookie) =>
  lib.currentAccount(new Request('https://test.local/', { headers: { cookie } }));
const emailOf = (username) => `${username}@lojas.test`;

let admin;
/** Loja nova pelo administrador; o Dono cria a senha pelo convite e já entra. */
async function store(username) {
  admin ??= cookieOf(await login('adminreparosm', 'TestAdminPassword123'));
  const response = await call(accounts.POST, '/api/accounts', {
    cookie: admin,
    body: { username, name: `Loja ${username}`, ownerName: 'Dono', ownerEmail: emailOf(username) },
  });
  assert.equal(response.status, 201);
  const { cookie } = await openLink(linkToken(emailOf(username)), 'Donosenha123');
  return { id: (await response.json()).account.id, owner: cookie };
}
/** O Dono cadastra alguém; com e-mail (padrão), o convite vai por e-mail. */
async function addStaff(owner, username, { email = emailOf(username), ...extra } = {}) {
  const response = await call(team.POST, '/api/team', {
    cookie: owner,
    body: { action: 'create', name: `Pessoa ${username}`, username, email, ...extra },
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}
/** A pessoa abre o convite, cria a senha e entra. */
const accept = async (source, password = 'Staffsenha123') =>
  (await openLink(linkToken(source), password)).cookie;

async function enableMfa(cookie, currentPassword) {
  const started = await call(security.POST, '/api/me/security', {
    cookie,
    body: { action: 'start-totp', currentPassword },
  });
  assert.equal(started.status, 200);
  const { secret } = await started.json();
  const { TOTP } = await import('otpauth');
  const code = new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret }).generate();
  const confirmed = await call(security.POST, '/api/me/security', {
    cookie,
    body: { action: 'confirm-totp', code },
  });
  assert.equal(confirmed.status, 200);
}

async function askForMfaReset(username, password) {
  const challenge = await login(username, password);
  assert.deepEqual(await challenge.clone().json(), { step: 'mfa' });
  const response = await call(mfa.POST, '/api/auth/mfa', {
    cookie: cookiesOf(challenge),
    body: { action: 'request-reset' },
  });
  assert.equal(response.status, 200);
  return response;
}

test(
  'two people of the same shop, and one person on two devices, stay signed in together',
  { skip },
  async () => {
    const shop = await store('balcao');
    const { invite } = await addStaff(shop.owner, 'bancada');
    assert.deepEqual(invite, { sent: true, to: 'bancada@lojas.test' });
    const staff = await accept(emailOf('bancada'));
    const ownerAgain = cookieOf(await login('balcao', 'Donosenha123'));
    const staffAgain = cookieOf(await login('bancada@lojas.test', 'Staffsenha123'));

    for (const cookie of [shop.owner, staff, ownerAgain, staffAgain]) {
      const account = await signedIn(cookie);
      assert.ok(account, 'nenhum login derrubou outro');
      assert.equal(account.id, shop.id, 'todos trabalham nos dados da mesma loja');
    }
    const person = await signedIn(staff);
    assert.equal(person.user.username, 'bancada');
    assert.equal(person.user.role, 'staff');
    assert.equal(person.user.mustChangePassword, false, 'ninguém define senha de ninguém');
    assert.equal(person.user.emailVerified, true, 'o convite por e-mail confirma o e-mail');
  },
);

test('only the owner manages the team and the shop profile', { skip }, async () => {
  const shop = await store('donoloja');
  await addStaff(shop.owner, 'ajudante');
  const staff = await accept(emailOf('ajudante'));

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
    list.users.map((user) => [user.username, user.role, user.access]),
    [
      ['donoloja', 'owner', 'ready'],
      ['ajudante', 'staff', 'ready'],
    ],
  );
  assert.equal(list.users[1].sessions, 1, 'mostra os aparelhos conectados');
});

test('usernames and e-mails are unique across every shop', { skip }, async () => {
  const one = await store('lojaum');
  const two = await store('lojadois');
  await addStaff(one.owner, 'mesmonome');
  let response = await call(team.POST, '/api/team', {
    cookie: two.owner,
    body: { action: 'create', name: 'Outro', username: 'mesmonome' },
  });
  assert.equal(response.status, 409);
  response = await call(team.POST, '/api/team', {
    cookie: two.owner,
    body: { action: 'create', name: 'Outro', username: 'outronome', email: emailOf('mesmonome') },
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /e-mail já está em uso/);
  const other = await (await call(team.GET, '/api/team', { cookie: two.owner })).json();
  assert.ok(
    !other.users.some((user) => user.username === 'mesmonome'),
    'cada loja vê só a sua equipe',
  );
});

test(
  'changing the own password checks the current one and signs out the other devices',
  { skip },
  async () => {
    const shop = await store('senhaloja');
    await addStaff(shop.owner, 'novato');
    const first = await accept(emailOf('novato'));
    const second = cookieOf(await login('novato', 'Staffsenha123'));

    let response = await call(me.POST, '/api/me', {
      cookie: second,
      body: { action: 'password', currentPassword: 'errada12345', password: 'Minhasenha123' },
    });
    assert.equal(response.status, 400);
    response = await call(me.POST, '/api/me', {
      cookie: second,
      body: { action: 'password', currentPassword: 'Staffsenha123', password: 'Minhasenha123' },
    });
    assert.equal(response.status, 200);

    assert.equal(await signedIn(first), null, 'o outro aparelho saiu');
    assert.ok(await signedIn(second), 'este aparelho continua');
    assert.equal((await login('novato', 'Staffsenha123')).status, 401);
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
  assert.equal(mine.sessions[0].sessions, 1, 'sessão antiga continua como um aparelho');
  assert.match(mine.sessions[0].lastSeenAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(mine.sessions[0].ip, /^10\.7\.0\.xxx$/);
  assert.equal(mine.sessions[0].trustedUntil, undefined);

  const response = await call(me.POST, '/api/me', {
    cookie: shop.owner,
    body: { action: 'end-other-sessions' },
  });
  assert.deepEqual(await response.json(), { ended: 1 });
  assert.equal(await signedIn(other), null);
  mine = await (await call(me.GET, '/api/me', { cookie: shop.owner })).json();
  assert.equal(mine.sessions.length, 1);
});

test('the same browser is trusted separately for each user', { skip }, async () => {
  const shop = await store('confianca');
  await addStaff(shop.owner, 'confianca-staff');
  const staffCookie = await accept(emailOf('confianca-staff'));
  const owner = await signedIn(shop.owner);
  const staff = await signedIn(staffCookie);
  const browser = 'a'.repeat(43);
  const seen = { userAgent: 'Shared Chrome', ip: '10.10.0.20' };

  const ownerDevice = await db.authTransaction(owner.user.username, (run) =>
    authSecurity.deviceForLogin({ account: owner, user: owner.user }, browser, seen, run),
  );
  await db.authTransaction(staff.user.username, (run) =>
    authSecurity.deviceForLogin({ account: staff, user: staff.user }, browser, seen, run),
  );
  await db.tenantTransaction(shop.id, (run) => authSecurity.trustDevice(ownerDevice.id, 30, run));

  const trustedOwner = await db.authTransaction(owner.user.username, (run) =>
    authSecurity.deviceForLogin({ account: owner, user: owner.user }, browser, seen, run),
  );
  const untrustedStaff = await db.authTransaction(staff.user.username, (run) =>
    authSecurity.deviceForLogin({ account: staff, user: staff.user }, browser, seen, run),
  );
  assert.equal(authSecurity.isTrusted(trustedOwner), true);
  assert.equal(authSecurity.isTrusted(untrustedStaff), false);
});

test('revoking a device ends all its sessions and trust', { skip }, async () => {
  const shop = await store('revogar-aparelho');
  const account = await signedIn(shop.owner);
  const deviceInfo = { userAgent: 'Chrome grouped', ip: '10.20.30.40' };
  const device = await db.authTransaction(account.user.username, (run) =>
    authSecurity.deviceForLogin({ account, user: account.user }, 'b'.repeat(43), deviceInfo, run),
  );
  await db.tenantTransaction(shop.id, (run) => authSecurity.trustDevice(device.id, 30, run));
  const first = await sessionRepo.createSession(
    account.user.username,
    account.user,
    deviceInfo,
    undefined,
    device.id,
  );
  const second = await sessionRepo.createSession(
    account.user.username,
    account.user,
    deviceInfo,
    undefined,
    device.id,
  );

  const grouped = (await sessionRepo.listOwnDevices(first)).filter(({ id }) => id === device.id);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].sessions, 2);
  assert.equal(grouped[0].current, true);
  const result = await sessionRepo.revokeOwnDevice(first, device.id);

  assert.equal(result.ended, 2);
  assert.equal(await signedIn(`reparosm_session=${first}`), null);
  assert.equal(await signedIn(`reparosm_session=${second}`), null);
  const [saved] = await db.migrationQuery('SELECT trusted_until FROM auth_devices WHERE id = $1', [
    device.id,
  ]);
  assert.equal(saved, undefined);
});

test(
  'a trusted device stays visible and removable after its session expires',
  { skip },
  async () => {
    const shop = await store('aparelho-confiavel');
    const account = await signedIn(shop.owner);
    const device = await db.authTransaction(account.user.username, (run) =>
      authSecurity.deviceForLogin(
        { account, user: account.user },
        'y'.repeat(43),
        { userAgent: 'Chrome sem sessão', ip: '10.20.30.60' },
        run,
      ),
    );
    await db.tenantTransaction(shop.id, (run) => authSecurity.trustDevice(device.id, 30, run));

    const listed = await sessionRepo.listOwnDevices(shop.owner.replace('reparosm_session=', ''));
    const trusted = listed.find((item) => item.id === device.id);
    assert.equal(trusted.sessions, 0);
    assert.ok(trusted.trustedUntil);
    assert.deepEqual(
      await sessionRepo.revokeOwnDevice(shop.owner.replace('reparosm_session=', ''), device.id),
      {
        ended: 0,
        current: false,
      },
    );
    const [removed] = await db.migrationQuery('SELECT id FROM auth_devices WHERE id = $1', [
      device.id,
    ]);
    assert.equal(removed, undefined);
  },
);

test('TOTP is enabled only after password and first valid code', { skip }, async () => {
  const shop = await store('seguranca');
  const account = await signedIn(shop.owner);
  const securityCall = (body) =>
    call(body ? security.POST : security.GET, '/api/me/security', {
      cookie: shop.owner,
      body,
    });

  assert.equal((await (await securityCall()).json()).totpEnabled, false);
  assert.equal(
    (
      await securityCall({
        action: 'start-totp',
        currentPassword: 'senha-incorreta',
      })
    ).status,
    400,
  );
  const started = await securityCall({
    action: 'start-totp',
    currentPassword: 'Donosenha123',
  });
  assert.equal(started.status, 200);
  const enrollment = await started.json();
  assert.match(enrollment.secret, /^[A-Z2-7]+$/);
  assert.match(enrollment.uri, /^otpauth:\/\/totp\//);
  const { TOTP } = await import('otpauth');
  const code = () =>
    new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: enrollment.secret }).generate();
  const confirmed = await securityCall({ action: 'confirm-totp', code: code() });
  assert.equal(confirmed.status, 200);
  const firstCodes = (await confirmed.json()).recoveryCodes;
  assert.equal(firstCodes.length, 8);

  let state = await (await securityCall()).json();
  assert.equal(state.totpEnabled, true);
  assert.equal(state.recoveryCodesRemaining, 8);
  assert.doesNotMatch(JSON.stringify(state), /secret|code_hash|secret_ciphertext/i);

  await db.migrationQuery(
    `INSERT INTO user_identities (
       account_id, user_id, provider, provider_subject, email_at_link
     ) VALUES ($1, $2, 'google', 'google-seguranca', 'seguranca@lojas.test')`,
    [account.id, account.user.id],
  );
  const regenerated = await securityCall({
    action: 'regenerate-codes',
    currentPassword: 'Donosenha123',
    kind: 'recovery',
    code: firstCodes[0],
  });
  assert.equal(regenerated.status, 200);
  const nextCodes = (await regenerated.json()).recoveryCodes;
  assert.equal(nextCodes.length, 8);
  assert.notDeepEqual(nextCodes, firstCodes);
  assert.equal(
    (
      await securityCall({
        action: 'unlink-google',
        currentPassword: 'Donosenha123',
        kind: 'recovery',
        code: firstCodes[1],
      })
    ).status,
    400,
    'regenerar invalida o conjunto anterior',
  );
  assert.equal(
    (
      await securityCall({
        action: 'unlink-google',
        currentPassword: 'Donosenha123',
        kind: 'recovery',
        code: nextCodes[0],
      })
    ).status,
    200,
  );
  state = await (await securityCall()).json();
  assert.equal(state.googleIdentity, null);
  assert.equal((await (await login('seguranca', 'Donosenha123')).json()).step, 'mfa');

  const otherDevice = await db.authTransaction(account.user.username, (run) =>
    authSecurity.deviceForLogin(
      { account, user: account.user },
      'z'.repeat(43),
      { userAgent: 'Outro Chrome', ip: '10.20.30.50' },
      run,
    ),
  );
  await db.tenantTransaction(shop.id, (run) => authSecurity.trustDevice(otherDevice.id, 30, run));
  const otherSession = await sessionRepo.createSession(
    account.user.username,
    account.user,
    { userAgent: 'Outro Chrome', ip: '10.20.30.50' },
    undefined,
    otherDevice.id,
  );
  assert.equal(
    (
      await securityCall({
        action: 'disable-totp',
        currentPassword: 'Donosenha123',
        kind: 'recovery',
        code: nextCodes[1],
      })
    ).status,
    200,
  );
  assert.equal(await signedIn(`reparosm_session=${otherSession}`), null);
  assert.ok(await signedIn(shop.owner), 'a sessão atual permanece');
  const trusted = await db.migrationQuery(
    'SELECT trusted_until FROM auth_devices WHERE user_id = $1',
    [account.user.id],
  );
  assert.ok(trusted.every((device) => device.trusted_until === null));

  state = await (await securityCall()).json();
  assert.equal(state.totpEnabled, false);
  const current = state.devices.find((device) => device.current);
  const revoked = await securityCall({ action: 'revoke-device', id: current.id });
  assert.equal(revoked.status, 200);
  assert.equal((await securityCall()).status, 401, 'remover este aparelho encerra a sessão');
});

test(
  'taking access away signs the person out, and the shop always keeps an active owner',
  { skip },
  async () => {
    const shop = await store('desligar');
    const { user } = await addStaff(shop.owner, 'saiu');
    const staff = await accept(emailOf('saiu'));

    const update = (cookie, body) =>
      call(team.POST, '/api/team', { cookie, body: { action: 'update', ...body } });
    assert.equal((await update(shop.owner, { id: user.id, status: 'disabled' })).status, 200);
    assert.equal(await signedIn(staff), null);
    assert.equal((await login('saiu', 'Staffsenha123')).status, 403);
    const blocked = await call(team.POST, '/api/team', {
      cookie: shop.owner,
      body: { action: 'copy-link', id: user.id },
    });
    assert.equal(blocked.status, 404, 'quem está sem acesso não recebe link');

    const self = (await signedIn(shop.owner)).user.id;
    assert.equal((await update(shop.owner, { id: self, status: 'disabled' })).status, 400);
    const demote = await update(shop.owner, { id: self, role: 'staff' });
    assert.equal(demote.status, 400);
    assert.match((await demote.json()).error, /pelo menos um Dono ativo/);

    assert.equal((await update(shop.owner, { id: user.id, status: 'active' })).status, 200);
    assert.equal((await login('saiu', 'Staffsenha123')).status, 200);
  },
);

test(
  'without e-mail, a staff request goes to the owner and an owner request to the administrator',
  { skip },
  async () => {
    const shop = await store('pedidos');
    // Funcionário sem e-mail: o Dono copia o link do convite e manda pelo WhatsApp.
    const { user, invite } = await addStaff(shop.owner, 'esqueceu', { email: '' });
    assert.equal(invite.sent, false);
    assert.equal(invite.reason, 'no-email');
    const staff = await accept(invite.url);
    await db.migrationQuery(`UPDATE users SET email = NULL WHERE username = 'pedidos'`);
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

    const copied = await call(team.POST, '/api/team', {
      cookie: shop.owner,
      body: { action: 'copy-link', id: user.id },
    });
    const { invite: link } = await copied.json();
    const { response } = await openLink(linkToken(link.url), 'Outrasenha123');
    assert.equal(response.status, 200);
    assert.equal(await signedIn(staff), null, 'senha nova desconecta a pessoa');
    const after = await (await call(team.GET, '/api/team', { cookie: shop.owner })).json();
    assert.equal(after.requests.length, 0);
    const relogin = await login('esqueceu', 'Outrasenha123');
    assert.equal((await relogin.json()).account.user.emailVerified, false);
  },
);

test(
  'MFA recovery is routed by role, authorized and clears every credential on approval',
  { skip },
  async () => {
    const shop = await store('recuperamfa');
    const { user } = await addStaff(shop.owner, 'recuperamfa-staff');
    const staff = await accept(emailOf('recuperamfa-staff'));
    const ownerAccount = await signedIn(shop.owner);
    await enableMfa(shop.owner, 'Donosenha123');
    await enableMfa(staff, 'Staffsenha123');

    const staffRequest = await askForMfaReset('recuperamfa-staff', 'Staffsenha123');
    await askForMfaReset('recuperamfa-staff', 'Staffsenha123');
    const ownerRequest = await askForMfaReset('recuperamfa', 'Donosenha123');
    assert.match((await staffRequest.json()).message, /dono da loja/i);
    assert.match((await ownerRequest.json()).message, /suporte ReparoSM/i);

    const duplicate = await db.migrationQuery(
      `SELECT count(*)::int AS count FROM mfa_reset_requests
     WHERE user_id = $1 AND status = 'pending'`,
      [user.id],
    );
    assert.equal(duplicate[0].count, 1, 'um pedido pendente por pessoa');

    let mine = await (await call(team.GET, '/api/team', { cookie: shop.owner })).json();
    assert.deepEqual(
      mine.mfaRequests.map((request) => request.username),
      ['recuperamfa-staff'],
    );
    let adminQueue = await (await call(accounts.GET, '/api/accounts', { cookie: admin })).json();
    assert.deepEqual(
      adminQueue.mfaRequests
        .filter((request) => request.accountId === shop.id)
        .map((request) => request.username),
      ['recuperamfa'],
    );

    assert.equal(
      (
        await call(team.POST, '/api/team', {
          cookie: staff,
          body: { action: 'approve-mfa-reset', id: user.id },
        })
      ).status,
      403,
      'funcionário não aprova pedidos',
    );
    assert.equal(
      (
        await call(team.POST, '/api/team', {
          cookie: shop.owner,
          body: { action: 'approve-mfa-reset', id: ownerAccount.user.id },
        })
      ).status,
      404,
      'dono não aprova outro dono nem a si mesmo',
    );

    let response = await call(team.POST, '/api/team', {
      cookie: shop.owner,
      body: { action: 'dismiss-mfa-reset', id: user.id },
    });
    assert.equal(response.status, 200);
    assert.equal(
      (
        await db.migrationQuery(
          'SELECT count(*)::int AS count FROM user_authenticators WHERE user_id = $1',
          [user.id],
        )
      )[0].count,
      1,
      'ignorar o pedido não altera o autenticador',
    );

    await call(mfa.POST, '/api/auth/mfa', {
      cookie: cookiesOf(await login('recuperamfa-staff', 'Staffsenha123')),
      body: { action: 'request-reset' },
    });
    response = await call(team.POST, '/api/team', {
      cookie: shop.owner,
      body: { action: 'approve-mfa-reset', id: user.id },
    });
    assert.equal(response.status, 200);
    for (const table of ['user_authenticators', 'recovery_codes', 'auth_devices', 'sessions']) {
      const [row] = await db.migrationQuery(
        `SELECT count(*)::int AS count FROM ${table} WHERE user_id = $1`,
        [user.id],
      );
      assert.equal(row.count, 0, `${table} foi limpo`);
    }
    assert.equal(await signedIn(staff), null);
    assert.equal((await login('recuperamfa-staff', 'Staffsenha123')).status, 200);

    response = await call(accounts.POST, '/api/accounts', {
      cookie: admin,
      body: { action: 'approve-mfa-reset', userId: ownerAccount.user.id },
    });
    assert.equal(response.status, 200);
    assert.equal(await signedIn(shop.owner), null);
    assert.equal((await login('recuperamfa', 'Donosenha123')).status, 200);

    await enableMfa(admin, 'TestAdminPassword123');
    const adminReset = await askForMfaReset('adminreparosm', 'TestAdminPassword123');
    assert.match((await adminReset.json()).message, /procedimento de emergência/i);
    const [queuedAdmin] = await db.migrationQuery(
      `SELECT count(*)::int AS count FROM mfa_reset_requests r
     JOIN users u ON u.id = r.user_id WHERE u.username = 'adminreparosm'`,
    );
    assert.equal(queuedAdmin.count, 0, 'administrador da plataforma nunca entra em fila');
  },
);

test('emergency MFA reset requires the exact administrator twice', async () => {
  const { adminMfaResetTarget } = await import('../scripts/reset-admin-mfa.mts');
  assert.equal(adminMfaResetTarget(['--user', 'user-adminreparosm']), null);
  assert.equal(adminMfaResetTarget(['--user', 'user-adminreparosm', '--confirm', 'outro']), null);
  assert.equal(
    adminMfaResetTarget(['--user', 'user-adminreparosm', '--confirm', 'user-adminreparosm']),
    'user-adminreparosm',
  );
});

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
  assert.equal(row.ownerEmail, 'assinatura@lojas.test');
  assert.equal(row.ownerAccess, 'ready');
  assert.equal(row.users, 2);
  assert.ok(row.lastLoginAt);
  assert.ok(
    !stores.some((item) => item.id === 'account-admin'),
    'a conta do administrador não é loja',
  );

  const detail = await (
    await call(accounts.GET, `/api/accounts?id=${shop.id}`, { cookie: admin })
  ).json();
  assert.deepEqual(detail.users.map((user) => [user.username, user.access]).sort(), [
    ['assinatura', 'ready'],
    ['colega', 'invited'],
  ]);

  await call(accounts.POST, '/api/accounts', {
    cookie: admin,
    body: { id: shop.id, status: 'suspended' },
  });
  assert.equal(await signedIn(shop.owner), null, 'loja suspensa: todos saem');
});
