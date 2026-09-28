import { tenantQueryFor, type Query } from '@/lib/db';
import { iso, toRecord, type Timestamp } from '@/lib/repos/rows';
import type { DataObject, Shop } from '@/lib/types';

// One shop per account. The app always saves it as 'shop-main'.
const SHOP_ID = 'shop-main';

type ShopRow = { name: string; phone: string; profile: DataObject; updated_at: Timestamp };

const toShop = (row: ShopRow) =>
  toRecord('shop', SHOP_ID, {
    ...row.profile,
    name: row.name,
    phone: row.phone,
    updatedAt: iso(row.updated_at),
  });

export async function list(accountId: string, run?: Query) {
  const rows = await tenantQueryFor(accountId, run)<ShopRow>(
    'SELECT name, phone, profile, updated_at FROM shops WHERE account_id = $1',
    [accountId],
  );
  return rows.map(toShop);
}

export async function get(accountId: string, _id: string, run?: Query) {
  const [row] = await tenantQueryFor(accountId, run)<ShopRow>(
    'SELECT name, phone, profile, updated_at FROM shops WHERE account_id = $1',
    [accountId],
  );
  return row ? toShop(row) : null;
}

export async function save(accountId: string, _id: string, data: Shop, run?: Query) {
  const execute = tenantQueryFor(accountId, run);
  const profile: DataObject = { ...data };
  for (const key of ['name', 'phone', 'id', 'updatedAt']) delete profile[key];
  await execute(
    `INSERT INTO shops (account_id, name, phone, profile) VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id) DO UPDATE SET name = excluded.name, phone = excluded.phone,
       profile = excluded.profile, updated_at = now()`,
    [accountId, data.name, data.phone, JSON.stringify(profile)],
  );
  return get(accountId, SHOP_ID, execute);
}

export async function remove(accountId: string) {
  const rows = await tenantQueryFor(accountId)(
    'DELETE FROM shops WHERE account_id = $1 RETURNING account_id',
    [accountId],
  );
  return rows.length > 0;
}
