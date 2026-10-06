import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, orders, clients, parts, payments;
before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  await db.migrationQuery(`INSERT INTO accounts (id,username,name,role,status,password_hash)
    VALUES ('sorting-owner','sorting-owner','Sorting','merchant','active','x')`);
  await db.migrationQuery(`INSERT INTO orders (id,account_id,code,customer,device,created_at,updated_at) VALUES
    ('old','sorting-owner','OS-1','Ana','Moto','2026-10-01T12:00:00Z','2026-10-05T12:00:00Z'),
    ('new-a','sorting-owner','OS-2','Ana','Moto','2026-10-04T12:00:00Z','2026-10-04T12:00:00Z'),
    ('new-z','sorting-owner','OS-3','Ana','Moto','2026-10-04T12:00:00Z','2026-10-04T12:00:00Z')`);
  await db.migrationQuery(`INSERT INTO clients (id,account_id,name) VALUES
    ('z','sorting-owner','Zeca'), ('a','sorting-owner','Ana')`);
  await db.migrationQuery(`INSERT INTO parts (id,account_id,name) VALUES
    ('z','sorting-owner','Tela'), ('a','sorting-owner','Bateria')`);
  await db.migrationQuery(`INSERT INTO cash_entries (id,account_id,kind,description,value,date,created_at,updated_at) VALUES
    ('older','sorting-owner','in','Antigo editado',10,'2026-10-01','2026-10-01T12:00:00Z','2026-10-05T12:00:00Z'),
    ('recent-a','sorting-owner','in','Recente A',10,'2026-10-04','2026-10-04T12:00:00Z','2026-10-04T12:00:00Z'),
    ('recent-z','sorting-owner','in','Recente Z',10,'2026-10-04','2026-10-04T12:00:00Z','2026-10-04T12:00:00Z')`);
  orders = await import('../lib/repos/orders.ts');
  clients = await import('../lib/repos/clients.ts');
  ({ parts, payments } = await import('../lib/repos/rest.ts'));
});
after(async () => db?.drop());

test(
  'database lists retain creation order after editing and use stable date ties',
  { skip },
  async () => {
    assert.deepEqual(
      (await orders.list('sorting-owner')).map((row) => row.id),
      ['new-z', 'new-a', 'old'],
    );
    assert.deepEqual(
      (await payments.list('sorting-owner')).map((row) => row.id),
      ['recent-z', 'recent-a', 'older'],
    );
  },
);

test(
  'client and product catalogs follow names rather than modification dates',
  { skip },
  async () => {
    assert.deepEqual(
      (await clients.list('sorting-owner')).map((row) => row.id),
      ['a', 'z'],
    );
    assert.deepEqual(
      (await parts.list('sorting-owner')).map((row) => row.id),
      ['a', 'z'],
    );
  },
);
