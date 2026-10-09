import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { passwordHash } from '../lib/security.ts';
import { todayInSaoPaulo } from '../lib/warranty.ts';
import { createTestDatabase, skipWithoutDatabase } from './support/db.mjs';

const skip = skipWithoutDatabase;
let db, route, cookie;
const previousMonthDate = () => {
  const date = new Date(`${todayInSaoPaulo()}T12:00:00Z`);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 10);
};

before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  await db.migrationQuery(
    `INSERT INTO accounts (id, username, name, role, status, password_hash)
     VALUES ('account-history-route', 'history-route', 'History Route', 'merchant', 'active', 'x')`,
  );
  const { sessionCookie } = await import('./support/session.mjs');
  cookie = await sessionCookie(db, 'history-route', 'account-history-route');
  route = await import('../app/api/cash/history/route.ts');
  await db.migrationQuery(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, date)
     VALUES ('history-route-1', 'account-history-route', 'in', 'Anterior', 25, $1::date)`,
    [previousMonthDate()],
  );
});
after(async () => db?.drop());

const get = (period) =>
  route.GET(
    new Request(`https://test.local/api/cash/history?period=${period}`, {
      headers: { cookie },
    }),
  );

test('returns history through the authenticated period endpoint', { skip }, async () => {
  const response = await get('previous-month');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rows[0].id, 'history-route-1');
});

test('rejects an unknown history period', { skip }, async () => {
  assert.equal((await get('invalid')).status, 400);
});
