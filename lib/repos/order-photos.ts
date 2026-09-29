import { tenantQueryFor, tenantTransaction, type Query } from '@/lib/db';
import { iso, type Timestamp } from '@/lib/repos/rows';
import { MAX_ORDER_PHOTOS } from '@/lib/order-photo-storage';

export type OrderPhoto = {
  id: string;
  orderId: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  createdAt: string;
};

type PhotoRow = {
  id: string;
  order_id: string;
  content_type: OrderPhoto['contentType'];
  size_bytes: number;
  created_at: Timestamp;
};

const toPhoto = (row: PhotoRow): OrderPhoto => ({
  id: row.id,
  orderId: row.order_id,
  contentType: row.content_type,
  sizeBytes: Number(row.size_bytes),
  createdAt: iso(row.created_at),
});

export const toPublic = (photo: OrderPhoto) => photo;

export async function list(accountId: string, orderId: string, run?: Query) {
  const rows = await tenantQueryFor(accountId, run)<PhotoRow>(
    `SELECT id, order_id, content_type, size_bytes, created_at
     FROM order_photos WHERE account_id = $1 AND order_id = $2 ORDER BY created_at, id`,
    [accountId, orderId],
  );
  return rows.map(toPhoto);
}

export async function get(accountId: string, id: string) {
  const [row] = await tenantQueryFor(accountId)<PhotoRow>(
    `SELECT id, order_id, content_type, size_bytes, created_at
     FROM order_photos WHERE account_id = $1 AND id = $2`,
    [accountId, id],
  );
  return row ? toPhoto(row) : null;
}

export async function getBytes(accountId: string, id: string) {
  const [row] = await tenantQueryFor(accountId)<PhotoRow & { bytes: Buffer }>(
    `SELECT id, order_id, content_type, size_bytes, created_at, bytes
     FROM order_photos WHERE account_id = $1 AND id = $2`,
    [accountId, id],
  );
  return row ? { photo: toPhoto(row), bytes: row.bytes } : null;
}

export async function create(
  accountId: string,
  photo: {
    id: string;
    orderId: string;
    contentType: OrderPhoto['contentType'];
    sizeBytes: number;
    bytes: Uint8Array;
  },
): Promise<OrderPhoto | 'limit' | null> {
  return tenantTransaction(accountId, async (run) => {
    const [order] = await run<{ id: string }>(
      'SELECT id FROM orders WHERE account_id = $1 AND id = $2 FOR UPDATE',
      [accountId, photo.orderId],
    );
    if (!order) return null;
    const [count] = await run<{ count: number }>(
      'SELECT count(*)::integer AS count FROM order_photos WHERE account_id = $1 AND order_id = $2',
      [accountId, photo.orderId],
    );
    if (count.count >= MAX_ORDER_PHOTOS) return 'limit';
    const [created] = await run<PhotoRow>(
      `INSERT INTO order_photos (id, account_id, order_id, content_type, size_bytes, bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, order_id, content_type, size_bytes, created_at`,
      [photo.id, accountId, photo.orderId, photo.contentType, photo.sizeBytes, Buffer.from(photo.bytes)],
    );
    return toPhoto(created);
  });
}

export async function remove(accountId: string, id: string) {
  const [row] = await tenantQueryFor(accountId)<PhotoRow>(
    `DELETE FROM order_photos WHERE account_id = $1 AND id = $2
     RETURNING id, order_id, content_type, size_bytes, created_at`,
    [accountId, id],
  );
  return row ? toPhoto(row) : null;
}
