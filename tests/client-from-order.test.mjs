import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, clients, saveOrder;
const account = 'account-cfo';

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status)
     VALUES ('account-cfo', 'cfo', 'CFO', 'merchant', 'active')`,
  );
  clients = await import('../lib/repos/clients.ts');
  ({ saveOrder } = await import('../lib/orders.ts'));
});
after(async () => db?.drop());

const clientCount = async () =>
  Number(
    (
      await db.migrationQuery('SELECT count(*) AS n FROM clients WHERE account_id = $1', [account])
    )[0].n,
  );
const upsert = (customer, phone) =>
  clients.upsertFromOrder(account, { customer, phone, status: 'Aberto' });

test('an order without a phone does not register a client', { skip }, async () => {
  const before = await clientCount();
  assert.equal(await upsert('Ana', ''), null);
  assert.equal(await upsert('Ana', undefined), null);
  assert.equal(await clientCount(), before);
});

// Placeholder digitado quando o telefone era obrigatório: não identifica
// ninguém, então não pode juntar clientes diferentes.
test('a placeholder phone does not register nor match a client', { skip }, async () => {
  const before = await clientCount();
  assert.equal(await upsert('Livia', '000000000000'), null);
  assert.equal(await upsert('Thiago', '(00) 00000-0000'), null);
  assert.equal(await clientCount(), before);
});

test('a real phone finds the same client regardless of formatting', { skip }, async () => {
  const first = await upsert('Maria', '(11) 98888-7777');
  const second = await upsert('Maria', '11988887777');
  assert.ok(first);
  assert.equal(second, first);
});

// O casamento só por nome juntava pessoas diferentes com o mesmo nome.
test('the same name with a different phone is a different client', { skip }, async () => {
  const one = await upsert('João', '11977776666');
  const other = await upsert('João', '21977776666');
  assert.ok(one && other);
  assert.notEqual(one, other);
});

test('saving an order without a phone keeps it unlinked', { skip }, async () => {
  const result = await saveOrder(account, 'order-cfo-1', {
    customer: 'Sem Telefone',
    device: 'iPhone',
    phone: '',
  });
  assert.equal(result.client, null);
  assert.equal(result.record.data.clientId, undefined);
});

test(
  'the unique index ignores placeholders but rejects a repeated real phone',
  { skip },
  async () => {
    const insert = (id, phone) =>
      db.migrationQuery(
        `INSERT INTO clients (id, account_id, name, phone) VALUES ($1, $2, 'X', $3)`,
        [id, account, phone],
      );
    await insert('client-zero-1', '000000000000');
    await insert('client-zero-2', '000000000000');
    await insert('client-real-1', '11955554444');
    await assert.rejects(() => insert('client-real-2', '(11) 95555-4444'));
  },
);
