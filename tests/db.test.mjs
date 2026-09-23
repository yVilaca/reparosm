import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

let db;
before(async () => {
  if (!skipWithoutDatabase) db = await createTestDatabase();
});
after(async () => db?.drop());

test('migrations create the records table', { skip: skipWithoutDatabase }, async () => {
  const [row] = await db.query(`SELECT to_regclass('records') AS name`);
  assert.equal(row.name, 'records');
});

test(
  'records round-trip through save, get, list and delete',
  { skip: skipWithoutDatabase },
  async () => {
    await db.saveRecord('order-1', 'order', { code: 'OS-1', customer: 'Ana', device: 'iPhone' });
    assert.equal((await db.getRecord('order-1')).data.code, 'OS-1');
    await db.saveRecord('order-1', 'order', { code: 'OS-2', customer: 'Ana', device: 'iPhone' });
    assert.deepEqual(
      (await db.listRecords('order')).map((r) => r.data.code),
      ['OS-2'],
    );
    await db.deleteRecord('order-1');
    assert.equal(await db.getRecord('order-1'), null);
  },
);

test('transaction rolls back every statement on error', { skip: skipWithoutDatabase }, async () => {
  await assert.rejects(
    db.transaction(async (run) => {
      await run(`INSERT INTO records (id, type, data) VALUES ('client-x', 'client', '{}')`);
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.equal(await db.getRecord('client-x'), null);
});

test(
  'transaction commits and returns the callback result',
  { skip: skipWithoutDatabase },
  async () => {
    const result = await db.transaction(async (run) => {
      await run(`INSERT INTO records (id, type, data) VALUES ('client-y', 'client', '{}')`);
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.ok(await db.getRecord('client-y'));
  },
);
