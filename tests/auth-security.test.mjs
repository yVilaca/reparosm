import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db;
before(async () => {
  if (skip) return;
  db = await createTestDatabase();
});
after(async () => db?.drop());

test('auth security repository exposes only the planned foundation', async () => {
  let repository;
  try {
    repository = await import('../lib/repos/auth-security.ts');
  } catch {
    assert.fail('lib/repos/auth-security.ts must exist');
  }
  for (const name of [
    'authenticator',
    'consumeChallenge',
    'createChallenge',
    'enableAuthenticator',
    'findIdentity',
    'linkIdentity',
    'savePendingAuthenticator',
  ])
    assert.equal(typeof repository[name], 'function', `${name} must be exported`);
});

test('0031 adds auth security tables without changing existing sessions', { skip }, async () => {
  const expectedTables = [
    'auth_challenges',
    'auth_devices',
    'mfa_reset_requests',
    'recovery_codes',
    'user_authenticators',
    'user_identities',
  ];
  const newTables = (
    await db.migrationQuery(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [expectedTables],
    )
  ).map((row) => row.table_name);

  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ('auth-schema', 'auth-schema', 'Schema', 'merchant', 'active');
     INSERT INTO users (id, account_id, username, name, role, password_hash)
     VALUES ('user-auth-schema', 'auth-schema', 'auth-schema', 'Schema', 'owner', 'hash')`,
  );
  await db.migrationQuery(
    `INSERT INTO sessions (token_hash, account_id, user_id, expires_at)
     VALUES ($1, 'auth-schema', 'user-auth-schema', now() + interval '1 hour')`,
    ['1'.repeat(64)],
  );
  const oldSessionStillAuthenticates = await db.sessionTransaction('1'.repeat(64), async (run) => {
    const rows = await run('SELECT user_id FROM sessions WHERE token_hash = $1', ['1'.repeat(64)]);
    return rows[0]?.user_id === 'user-auth-schema';
  });

  assert.deepEqual(newTables.sort(), expectedTables.sort());
  assert.equal(oldSessionStillAuthenticates, true);
});

test(
  'auth security rows are visible only to their user, tenant capability or admin',
  { skip },
  async () => {
    await db.migrationQuery(
      `INSERT INTO accounts (id, username, name, role, status)
       VALUES ('auth-rls-a', 'auth-rls-a', 'A', 'merchant', 'active'),
              ('auth-rls-b', 'auth-rls-b', 'B', 'merchant', 'active'),
              ('auth-rls-admin', 'auth-rls-admin', 'Admin', 'admin', 'active');
       INSERT INTO users (id, account_id, username, name, role, password_hash)
       VALUES ('user-auth-rls-a', 'auth-rls-a', 'auth-rls-a', 'A', 'owner', 'hash'),
              ('user-auth-rls-b', 'auth-rls-b', 'auth-rls-b', 'B', 'owner', 'hash')`,
    );
    await db.migrationQuery(
      `INSERT INTO sessions (token_hash, account_id, user_id, expires_at)
       VALUES ($1, 'auth-rls-a', 'user-auth-rls-a', now() + interval '1 hour')`,
      ['2'.repeat(64)],
    );
    await db.migrationQuery(
      `INSERT INTO user_authenticators (account_id, user_id, secret_ciphertext)
       VALUES ('auth-rls-a', 'user-auth-rls-a', 'v1.a.a'),
              ('auth-rls-b', 'user-auth-rls-b', 'v1.b.b')`,
    );

    const otherTenantRows = await db.tenantQuery(
      'auth-rls-b',
      "SELECT user_id FROM user_authenticators WHERE account_id = 'auth-rls-a'",
    );
    const ownRows = await db.sessionTransaction('2'.repeat(64), async (run) => {
      await db.setSessionAccountContext(run, 'auth-rls-a');
      return run("SELECT user_id FROM user_authenticators WHERE account_id = 'auth-rls-a'");
    });
    const adminRows = await db.adminQuery(
      { id: 'auth-rls-admin', role: 'admin' },
      "SELECT user_id FROM user_authenticators WHERE account_id = 'auth-rls-a'",
    );

    assert.equal(otherTenantRows.length, 0);
    assert.equal(ownRows.length, 1);
    assert.equal(adminRows.length, 1);
  },
);

test('subject and challenge capabilities reveal one matching row', { skip }, async () => {
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ('auth-cap', 'auth-cap', 'Capabilities', 'merchant', 'active');
     INSERT INTO users (id, account_id, username, name, role, password_hash)
     VALUES ('user-auth-cap', 'auth-cap', 'auth-cap', 'Capabilities', 'owner', 'hash'),
            ('user-auth-cap-b', 'auth-cap', 'auth-cap-b', 'Capabilities B', 'staff', 'hash');
     INSERT INTO user_identities (account_id, user_id, provider, provider_subject, email_at_link)
     VALUES ('auth-cap', 'user-auth-cap', 'google', 'subject-a', 'a@example.com'),
            ('auth-cap', 'user-auth-cap-b', 'google', 'subject-b', 'b@example.com')`,
  );
  await db.migrationQuery(
    `INSERT INTO auth_challenges (
       account_id, user_id, token_hash, purpose, auth_method, expires_at
     ) VALUES ('auth-cap', 'user-auth-cap', $1, 'login', 'google', now() + interval '10 minutes'),
              ('auth-cap', 'user-auth-cap', $2, 'login', 'google', now() + interval '10 minutes')`,
    ['3'.repeat(64), '4'.repeat(64)],
  );

  assert.deepEqual(
    await db.googleIdentityTransaction('subject-a', (run) =>
      run('SELECT provider_subject FROM user_identities ORDER BY provider_subject'),
    ),
    [{ provider_subject: 'subject-a' }],
  );
  assert.deepEqual(
    await db.authChallengeTransaction('3'.repeat(64), (run) =>
      run('SELECT token_hash FROM auth_challenges ORDER BY token_hash'),
    ),
    [{ token_hash: '3'.repeat(64) }],
  );
});
