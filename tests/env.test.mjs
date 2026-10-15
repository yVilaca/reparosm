import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEnv } from '../lib/env.ts';

const names = [
  'DATABASE_URL',
  'URL',
  'ADMIN_PASSWORD_HASH',
  'WHATSAPP_CONFIG_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'AUTH_ENCRYPTION_KEY',
];

function withEnv(values, callback) {
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) {
      if (name in values) process.env[name] = values[name];
      else delete process.env[name];
    }
    callback();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('rejects missing database configuration', () => {
  withEnv({ ADMIN_PASSWORD_HASH: 'pbkdf2$valid' }, () => {
    assert.throws(() => validateEnv(), /DATABASE_URL/);
  });
});

test('rejects an invalid site URL', () => {
  withEnv(
    {
      DATABASE_URL: 'postgres://localhost/reparosm',
      URL: 'not-a-url',
      ADMIN_PASSWORD_HASH: 'pbkdf2$valid',
    },
    () => assert.throws(() => validateEnv(), /URL/),
  );
});

test('accepts required values and validates an optional WhatsApp key', () => {
  withEnv(
    {
      DATABASE_URL: 'postgres://localhost/reparosm',
      URL: 'https://reparosm.example.com',
      ADMIN_PASSWORD_HASH: 'pbkdf2$valid',
      WHATSAPP_CONFIG_KEY: 'a'.repeat(64),
    },
    () => assert.doesNotThrow(() => validateEnv()),
  );
});

test('rejects a malformed optional WhatsApp key', () => {
  withEnv(
    {
      DATABASE_URL: 'postgres://localhost/reparosm',
      ADMIN_PASSWORD_HASH: 'pbkdf2$valid',
      WHATSAPP_CONFIG_KEY: 'invalid',
    },
    () => assert.throws(() => validateEnv(), /WHATSAPP_CONFIG_KEY/),
  );
});

test('Google config is enabled only when client id and secret are both present', async () => {
  const module = await import('../lib/env.ts');
  assert.equal(typeof module.googleConfigured, 'function');

  withEnv(
    {
      DATABASE_URL: 'postgres://localhost/reparosm',
      ADMIN_PASSWORD_HASH: 'pbkdf2$valid',
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
    },
    () => {
      assert.equal(module.googleConfigured(), true);
      assert.doesNotThrow(() => validateEnv());
    },
  );

  withEnv(
    {
      DATABASE_URL: 'postgres://localhost/reparosm',
      ADMIN_PASSWORD_HASH: 'pbkdf2$valid',
      GOOGLE_CLIENT_ID: 'client-id',
    },
    () => assert.throws(() => validateEnv(), /GOOGLE_CLIENT_SECRET/),
  );
});

test('auth encryption is enabled only with a 64-character hexadecimal key', async () => {
  const module = await import('../lib/env.ts');
  assert.equal(typeof module.authEncryptionConfigured, 'function');

  withEnv(
    {
      DATABASE_URL: 'postgres://localhost/reparosm',
      ADMIN_PASSWORD_HASH: 'pbkdf2$valid',
      AUTH_ENCRYPTION_KEY: 'a'.repeat(64),
    },
    () => {
      assert.equal(module.authEncryptionConfigured(), true);
      assert.doesNotThrow(() => validateEnv());
    },
  );

  withEnv(
    {
      DATABASE_URL: 'postgres://localhost/reparosm',
      ADMIN_PASSWORD_HASH: 'pbkdf2$valid',
      AUTH_ENCRYPTION_KEY: 'invalid',
    },
    () => assert.throws(() => validateEnv(), /AUTH_ENCRYPTION_KEY/),
  );
});
