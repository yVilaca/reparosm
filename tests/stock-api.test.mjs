import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createTestDatabase, skipWithoutDatabase as skip } from './support/db.mjs';
import { passwordHash } from '../lib/security.ts';
let db, check, ledger, cookie;
const A = 'account-stock-api';
before(async () => {
  if (skip) return;
  db = await createTestDatabase();
  process.env.ADMIN_PASSWORD_HASH = await passwordHash('adminreparosm', 'TestAdminPassword123');
  await db.migrationQuery(
    "INSERT INTO accounts(id,username,name,role,status) VALUES($1,$1,'Loja','merchant','active')",
    [A],
  );
  await db.migrationQuery(
    "INSERT INTO parts(id,account_id,name,sku,stock,cost,price) VALUES('part-stock-api',$1,'Tela','TELA',4,40,100)",
    [A],
  );
  const { sessionCookie } = await import('./support/session.mjs');
  cookie = await sessionCookie(db, A, A);
  check = await import('../app/api/stock/route.ts');
  ledger = await import('../app/api/stock/movements/route.ts');
});
after(async () => db?.drop());
const req = (path, query = '', authenticated = true) =>
  new Request(`https://test.local/api/stock${path}?${query}`, {
    headers: authenticated ? { cookie } : undefined,
  });
test('stock endpoints require authentication and never cache stock', { skip }, async () => {
  assert.equal((await check.GET(req('', '', false))).status, 401);
  assert.equal((await ledger.GET(req('/movements', '', false))).status, 401);
  const res = await check.GET(req('', 'ids=part-stock-api'));
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await res.json(), {
    allowNegativeStock: false,
    parts: [{ id: 'part-stock-api', name: 'Tela', stock: 4, available: 4 }],
  });
  assert.equal((await check.GET(req('', 'ids='))).status, 200);
  assert.equal(
    (await check.GET(req('', `ids=${Array.from({ length: 101 }, (_, n) => n).join(',')}`))).status,
    400,
  );
});
test(
  'Kardex validates dates, sources, directions and cursor; filters return expected movements',
  { skip },
  async () => {
    for (const query of [
      'from=2026-02-30',
      'source=unknown',
      'direction=invalid',
      'before=invalid&beforeId=x',
      'beforeId=orphan',
    ])
      assert.equal((await ledger.GET(req('/movements', query))).status, 400, query);
    const res = await ledger.GET(
      req(
        '/movements',
        'from=2000-01-01&to=2099-12-31&source=opening&direction=in&search=TELA&partId=part-stock-api',
      ),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.rows.length, 1);
    assert.equal(body.rows[0].quantity, 4);
    assert.equal(body.rows[0].source, 'opening');
  },
);
