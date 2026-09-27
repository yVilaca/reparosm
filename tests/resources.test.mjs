import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, clients, parts, shops, whatsapp, owner, other;

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  clients = await import('../app/api/clients/route.ts');
  ({ parts, shops } = await import('../lib/repos/index.ts'));
  whatsapp = await import('../lib/whatsapp.ts');
  const { createSession } = await import('../lib/repos/sessions.ts');
  for (const username of ['resource-owner', 'resource-other']) {
    await db.migrationQuery(
      `INSERT INTO accounts (id, username, name, role, status, password_hash)
       VALUES ($1, $2, $2, 'merchant', 'active', 'unused')`,
      [`account-${username}`, username],
    );
  }
  owner = {
    id: 'account-resource-owner',
    cookie: `reparosm_session=${await createSession('resource-owner', 'account-resource-owner')}`,
  };
  other = {
    id: 'account-resource-other',
    cookie: `reparosm_session=${await createSession('resource-other', 'account-resource-other')}`,
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

test('tenant repository scopes reads and writes at the database boundary', { skip }, async () => {
  const own = await parts.save(owner.id, 'part-owned-resources', {
    name: 'Tela da loja A',
    stock: 3,
    published: true,
  });
  const theirs = await parts.save(other.id, 'part-owned-by-other', {
    name: 'Tela da loja B',
    stock: 2,
    published: true,
  });

  assert.equal(own.data.name, 'Tela da loja A');
  assert.equal(theirs.data.name, 'Tela da loja B');
  assert.deepEqual(
    (await parts.list(owner.id)).map((record) => record.id),
    ['part-owned-resources'],
  );
  assert.equal(await parts.get(other.id, own.id), null);

  const attemptedOverwrite = await parts.save(other.id, own.id, {
    name: 'Alterado pela loja B',
    stock: 99,
    published: true,
  });
  assert.equal(attemptedOverwrite, null);
  assert.equal((await parts.get(owner.id, own.id)).data.name, 'Tela da loja A');
  assert.equal(await parts.remove(other.id, own.id), false);
});

test(
  'public storefront repositories return only the selected shop and sellable parts',
  { skip },
  async () => {
    await db.migrationQuery(
      `INSERT INTO shops (account_id, name, phone) VALUES ($1, 'Loja A', '11999990000'),
      ($2, 'Loja B', '11888880000')`,
      [owner.id, other.id],
    );
    await db.migrationQuery(
      `INSERT INTO parts (id, account_id, name, stock, published)
     VALUES ('store-a', $1, 'Disponível A', 2, true),
            ('store-hidden', $1, 'Não publicado', 2, false),
            ('store-sold', $1, 'Sem estoque', 0, true),
            ('store-b', $2, 'Disponível B', 5, true)`,
      [owner.id, other.id],
    );

    const store = await db.publicStoreTransaction(owner.id, async (run) => ({
      items: await parts.list(owner.id, run),
      shops: await shops.list(owner.id, run),
    }));
    assert.deepEqual(store.items.map((record) => record.data.name).sort(), [
      'Disponível A',
      'Tela da loja A',
    ]);
    assert.deepEqual(
      store.shops.map((record) => record.data.name),
      ['Loja A'],
    );
  },
);

test('WhatsApp credentials are isolated by account', { skip }, async () => {
  const previousKey = process.env.WHATSAPP_CONFIG_KEY;
  process.env.WHATSAPP_CONFIG_KEY = 'a'.repeat(64);
  const config = (token) => ({
    token,
    phoneNumberId: `phone-${token}`,
    orderTemplate: 'order',
    statusTemplate: 'status',
    language: 'pt_BR',
    version: 'v25.0',
  });

  try {
    await whatsapp.saveWhatsappConfiguration(owner.id, config('token-owner'));
    await whatsapp.saveWhatsappConfiguration(other.id, config('token-other'));
    assert.deepEqual(await whatsapp.whatsappConfiguration(owner.id), config('token-owner'));
    assert.deepEqual(await whatsapp.whatsappConfiguration(other.id), config('token-other'));

    await whatsapp.deleteWhatsappConfiguration(owner.id);
    assert.equal(await whatsapp.whatsappConfiguration(owner.id), null);
    assert.deepEqual(await whatsapp.whatsappConfiguration(other.id), config('token-other'));
  } finally {
    if (previousKey === undefined) delete process.env.WHATSAPP_CONFIG_KEY;
    else process.env.WHATSAPP_CONFIG_KEY = previousKey;
  }
});
