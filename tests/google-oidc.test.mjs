import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { SignJWT, generateKeyPair } from 'jose';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db;

before(async () => {
  process.env.APP_URL = 'https://reparosm.test';
  process.env.GOOGLE_CLIENT_ID = 'google-client-test';
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret-test';
  if (!skip) db = await createTestDatabase();
});
after(async () => db?.drop());

const discovery = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
};

test('Google ID token requires issuer, audience, nonce, expiry and verified email', async () => {
  const { verifyGoogleIdToken } = await import('../lib/google-oidc.ts');
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const now = Math.floor(Date.now() / 1000);
  const sign = (overrides = {}) =>
    new SignJWT({
      email: 'ana@example.com',
      email_verified: true,
      nonce: 'nonce-ok',
      ...overrides,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(overrides.iss ?? discovery.issuer)
      .setAudience(overrides.aud ?? 'google-client-test')
      .setSubject('google-ana')
      .setIssuedAt(now)
      .setExpirationTime(overrides.exp ?? now + 300)
      .sign(privateKey);
  const options = {
    clientId: 'google-client-test',
    nonce: 'nonce-ok',
    keySet: async () => publicKey,
  };
  const valid = await sign();
  const wrongAudience = await sign({ aud: 'other' });
  const wrongIssuer = await sign({ iss: 'https://attacker.test' });
  const expired = await sign({ exp: now - 10 });
  const unverifiedEmail = await sign({ email_verified: false });

  assert.deepEqual(await verifyGoogleIdToken(valid, options), {
    subject: 'google-ana',
    email: 'ana@example.com',
  });
  await assert.rejects(() => verifyGoogleIdToken(valid, { ...options, nonce: 'wrong' }), /nonce/i);
  await assert.rejects(() => verifyGoogleIdToken(wrongAudience, options));
  await assert.rejects(() => verifyGoogleIdToken(wrongIssuer, options));
  await assert.rejects(() => verifyGoogleIdToken(expired, options));
  await assert.rejects(() => verifyGoogleIdToken(unverifiedEmail, options), /confirmado/i);
});

test('Google authorization uses discovery, PKCE S256 and the minimum scopes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), 'https://accounts.google.com/.well-known/openid-configuration');
    return Response.json(discovery);
  };
  try {
    const { googleAuthorizationUrl } = await import('../lib/google-oidc.ts');
    const verifier = 'v'.repeat(43);
    const url = await googleAuthorizationUrl({
      state: 'state-test',
      nonce: 'nonce-test',
      verifier,
      redirectUri: 'https://reparosm.test/api/auth/google/callback',
    });
    const expectedChallenge = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    ).toString('base64url');

    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('scope'), 'openid email');
    assert.equal(url.searchParams.get('state'), 'state-test');
    assert.equal(url.searchParams.get('nonce'), 'nonce-test');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge'), expectedChallenge);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google code exchange sends PKCE credentials and returns only the ID token', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    if (String(input) === 'https://accounts.google.com/.well-known/openid-configuration')
      return Response.json(discovery);
    assert.equal(String(input), discovery.token_endpoint);
    assert.equal(init.method, 'POST');
    const body = new URLSearchParams(init.body);
    assert.equal(body.get('code'), 'one-use-code');
    assert.equal(body.get('code_verifier'), 'v'.repeat(43));
    assert.equal(body.get('client_secret'), 'google-secret-test');
    return Response.json({ id_token: 'signed-id-token', access_token: 'discard-me' });
  };
  try {
    const { exchangeGoogleCode } = await import('../lib/google-oidc.ts');
    assert.deepEqual(
      await exchangeGoogleCode({
        code: 'one-use-code',
        verifier: 'v'.repeat(43),
        redirectUri: 'https://reparosm.test/api/auth/google/callback',
      }),
      { idToken: 'signed-id-token' },
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google callback rejects missing, swapped and incomplete transient cookies', async () => {
  const callback = await import('../app/api/auth/google/callback/route.ts');
  const state = 's'.repeat(43);
  const changed = 'c'.repeat(43);
  const nonce = 'n'.repeat(43);
  const verifier = 'v'.repeat(43);
  const call = (url, cookie = '') =>
    callback.GET(
      new Request(url, {
        headers: { cookie, 'x-nf-client-connection-ip': '10.44.0.1' },
      }),
    );
  for (const [url, cookie] of [
    [`https://reparosm.test/api/auth/google/callback?code=x&state=${state}`, ''],
    [
      `https://reparosm.test/api/auth/google/callback?code=x&state=${changed}`,
      `reparosm_google_state=${state}; reparosm_google_nonce=${nonce}; reparosm_google_verifier=${verifier}`,
    ],
    [
      `https://reparosm.test/api/auth/google/callback?code=x&state=${state}`,
      `reparosm_google_state=${state}; reparosm_google_nonce=${nonce}`,
    ],
  ]) {
    const response = await call(url, cookie);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), 'https://reparosm.test/login?erro=google');
    assert.equal(
      response.headers.getSetCookie().filter((value) => /Max-Age=0/.test(value)).length,
      3,
    );
  }
});

test(
  'a linked Google subject survives an app email change and cannot be relinked',
  { skip },
  async () => {
    const { resolveGoogleUser } = await import('../lib/google-oidc.ts');
    await db.migrationQuery(
      `INSERT INTO accounts (id, username, name, role, status)
       VALUES ('google-store', 'google-store', 'Google Store', 'merchant', 'active');
       INSERT INTO users (
         id, account_id, username, name, role, status, password_hash, email, email_verified_at
       ) VALUES (
         'user-google', 'google-store', 'google-user', 'Ana', 'owner', 'active', 'hash',
         'ana@example.com', now()
       )`,
    );

    const linked = await resolveGoogleUser('subject-original', 'ana@example.com');
    assert.equal(linked.user.id, 'user-google');
    await db.migrationQuery(
      "UPDATE users SET email = 'ana-new@example.com', email_verified_at = now() WHERE id = 'user-google'",
    );
    assert.equal(
      (await resolveGoogleUser('subject-original', 'ana@example.com')).user.id,
      'user-google',
    );
    await assert.rejects(() => resolveGoogleUser('subject-other', 'ana@example.com'));
    assert.equal(
      Number(
        (
          await db.migrationQuery(
            "SELECT count(*) AS count FROM user_identities WHERE user_id = 'user-google'",
          )
        )[0].count,
      ),
      1,
    );
  },
);

test(
  'concurrent first links create one identity and inactive users create none',
  { skip },
  async () => {
    const { resolveGoogleUser } = await import('../lib/google-oidc.ts');
    await db.migrationQuery(
      `INSERT INTO accounts (id, username, name, role, status)
     VALUES ('google-race', 'google-race', 'Race', 'merchant', 'active'),
            ('google-paused', 'google-paused', 'Paused', 'merchant', 'suspended');
     INSERT INTO users (
       id, account_id, username, name, role, status, password_hash, email, email_verified_at
     ) VALUES ('user-google-race', 'google-race', 'google-race-user', 'Race', 'owner', 'active',
               'hash', 'race@example.com', now()),
              ('user-google-paused', 'google-paused', 'google-paused-user', 'Paused', 'owner',
               'active', 'hash', 'paused@example.com', now())`,
    );
    const attempts = await Promise.allSettled([
      resolveGoogleUser('subject-race-a', 'race@example.com'),
      resolveGoogleUser('subject-race-b', 'race@example.com'),
    ]);
    assert.deepEqual(attempts.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
    assert.equal(
      Number(
        (
          await db.migrationQuery(
            "SELECT count(*) AS count FROM user_identities WHERE account_id = 'google-race'",
          )
        )[0].count,
      ),
      1,
    );
    await assert.rejects(() => resolveGoogleUser('subject-paused', 'paused@example.com'));
    assert.equal(
      Number(
        (
          await db.migrationQuery(
            "SELECT count(*) AS count FROM user_identities WHERE account_id = 'google-paused'",
          )
        )[0].count,
      ),
      0,
    );
  },
);
