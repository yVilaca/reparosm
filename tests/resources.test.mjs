import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, clients, owner, other;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  clients = await import('../app/api/clients/route.ts');
  const { createAccount } = await import('../lib/repos/accounts.ts');
  const { createSession } = await import('../lib/repos/sessions.ts');
  for (const username of ['resource-owner', 'resource-other']) {
    await createAccount({
      id: `account-${username}`,
      username,
      name: username,
      role: 'merchant',
      passwordHash: 'unused',
    });
  }
  owner = {
    id: 'account-resource-owner',
    cookie: `reparosm_session=${await createSession('account-resource-owner')}`,
  };
  other = {
    id: 'account-resource-other',
    cookie: `reparosm_session=${await createSession('account-resource-other')}`,
  };
});

after(async () => db?.drop());

const request = (method, who, body, id) =>
  new Request(`https://test.local/api/clients${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
    method,
    headers: {
      origin: 'https://test.local',
      cookie: who?.cookie || '',
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

test('resource route validates payloads and scopes ownership', { skip }, async () => {
  assert.equal((await clients.POST(request('POST', owner, { data: { name: 'Ana' } }))).status, 400);
  const saved = await clients.POST(
    request('POST', owner, { data: { name: 'Ana Souza', phone: '11999998888' } }),
  );
  assert.equal(saved.status, 201);
  const id = (await saved.json()).record.id;
  assert.equal((await clients.GET(request('GET', owner, null, id))).status, 200);
  assert.equal((await clients.GET(request('GET', other, null, id))).status, 403);
  assert.equal((await clients.DELETE(request('DELETE', other, null, id))).status, 403);
  assert.equal((await clients.DELETE(request('DELETE', owner, null, id))).status, 200);
});
