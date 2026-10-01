import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEnv } from '../lib/env.ts';

const names = ['DATABASE_URL', 'URL', 'ADMIN_PASSWORD_HASH', 'WHATSAPP_CONFIG_KEY'];

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
