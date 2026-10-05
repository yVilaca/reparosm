import { tenantQueryFor, type Query } from '@/lib/db';
import type { ShopLogoContentType, ShopLogoInfo } from '@/lib/shop-logo';

export type StoredShopLogo = ShopLogoInfo & { bytes: Uint8Array };
type Row = {
  content_type: ShopLogoContentType;
  bytes: Uint8Array;
  width: number;
  height: number;
};

const toLogo = (row: Row): StoredShopLogo => ({
  contentType: row.content_type,
  bytes: new Uint8Array(row.bytes),
  width: row.width,
  height: row.height,
});

export async function get(accountId: string, run?: Query) {
  const [row] = await tenantQueryFor(accountId, run)<Row>(
    `SELECT content_type, bytes, width, height
       FROM shop_logos
      WHERE account_id = $1`,
    [accountId],
  );
  return row ? toLogo(row) : null;
}

export async function save(accountId: string, logo: StoredShopLogo, run?: Query) {
  const execute = tenantQueryFor(accountId, run);
  await execute(
    `INSERT INTO shop_logos
       (account_id, content_type, bytes, byte_length, width, height)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (account_id) DO UPDATE SET
       content_type = excluded.content_type,
       bytes = excluded.bytes,
       byte_length = excluded.byte_length,
       width = excluded.width,
       height = excluded.height,
       updated_at = now()`,
    [
      accountId,
      logo.contentType,
      Buffer.from(logo.bytes),
      logo.bytes.byteLength,
      logo.width,
      logo.height,
    ],
  );
}

export async function remove(accountId: string, run?: Query) {
  const rows = await tenantQueryFor(accountId, run)(
    'DELETE FROM shop_logos WHERE account_id = $1 RETURNING account_id',
    [accountId],
  );
  return rows.length > 0;
}
