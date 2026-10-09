import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

// Banco próprio: aplica as migrações até a 0025, cria dados no formato antigo e
// confere a 0026 (cada arquivo de teste roda em processo separado).
const skip = skipWithoutDatabase;

test(
  '0026 turns each existing account into its owner, keeping password and sessions',
  { skip },
  async () => {
    const legacy = await createTestDatabase({ migrate: false });
    try {
      const files = (await readdir(new URL('../netlify/database/migrations/', import.meta.url)))
        .filter((file) => file.endsWith('.sql'))
        .sort();
      for (const file of files.filter((name) => name < '0026'))
        await legacy.apply(file.replace('.sql', ''));
      await legacy.migrationQuery(
        `INSERT INTO accounts (id, username, name, role, status, password_hash, must_change_password)
       VALUES ('account-antiga', 'antiga', 'Loja Antiga', 'merchant', 'active', 'hash-antigo', true)`,
      );
      await legacy.migrationQuery(
        `INSERT INTO sessions (token_hash, account_id, expires_at)
       VALUES ($1, 'account-antiga', now() + interval '1 hour')`,
        ['e'.repeat(64)],
      );
      await legacy.migrationQuery(
        `INSERT INTO password_requests (account_id, status) VALUES ('account-antiga', 'pending')`,
      );
      await legacy.apply('0026_store_users');

      const [user] = await legacy.migrationQuery(
        `SELECT id, account_id, username, name, role, status, password_hash, must_change_password
       FROM users`,
      );
      assert.deepEqual(user, {
        id: 'user-antiga',
        account_id: 'account-antiga',
        username: 'antiga',
        name: 'Loja Antiga',
        role: 'owner',
        status: 'active',
        password_hash: 'hash-antigo',
        must_change_password: true,
      });
      const [session] = await legacy.migrationQuery('SELECT user_id, id FROM sessions');
      assert.equal(session.user_id, 'user-antiga');
      assert.ok(session.id);
      const [request] = await legacy.migrationQuery('SELECT user_id FROM password_requests');
      assert.equal(request.user_id, 'user-antiga');

      // A versão anterior do app, durante a publicação, cria sessão sem user_id.
      await legacy.migrationQuery(
        `INSERT INTO sessions (token_hash, account_id, expires_at)
       VALUES ($1, 'account-antiga', now() + interval '1 hour')`,
        ['f'.repeat(64)],
      );
      const [late] = await legacy.migrationQuery(
        'SELECT user_id FROM sessions WHERE token_hash = $1',
        ['f'.repeat(64)],
      );
      assert.equal(late.user_id, 'user-antiga');
    } finally {
      await legacy.drop();
    }
  },
);
