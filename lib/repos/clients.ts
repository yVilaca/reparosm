import { tenantQueryFor, type Query } from '@/lib/db';
import { identifyingPhoneDigits } from '@/lib/format';
import { compact, dateOrNull, iso, textOrNull, toRecord, type Timestamp } from '@/lib/repos/rows';
import type { Client, Order } from '@/lib/types';

type ClientRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  address: string | null;
  birth: string | null;
  status: string | null;
  vip: boolean;
  notes: string | null;
  automatic: boolean;
  last_order_id: string | null;
  last_order_code: string | null;
  last_device: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

// The client's latest order replaces the lastOrder* fields the app used to copy onto the client.
const select = `SELECT c.id, c.name, c.phone, c.email, c.document, c.address, c.birth::text AS birth,
    c.status, c.vip, c.notes, c.automatic, c.created_at, c.updated_at,
    last.id AS last_order_id, last.code AS last_order_code, last.device AS last_device
  FROM clients c
  LEFT JOIN LATERAL (
    SELECT o.id, o.code, o.device FROM orders o
      WHERE o.client_id = c.id ORDER BY o.created_at DESC, o.id DESC LIMIT 1
  ) last ON true`;

const toClient = (row: ClientRow) =>
  toRecord(
    'client',
    row.id,
    compact({
      name: row.name,
      phone: row.phone,
      email: row.email,
      document: row.document,
      address: row.address,
      birth: row.birth,
      status: row.status,
      vip: row.vip,
      notes: row.notes,
      automatic: row.automatic,
      lastOrderId: row.last_order_id,
      lastOrderCode: row.last_order_code,
      lastDevice: row.last_device,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }),
  );

export async function list(accountId: string, run?: Query) {
  const rows = await tenantQueryFor(accountId, run)<ClientRow>(
    `${select} WHERE c.account_id = $1 ORDER BY LOWER(c.name), c.id`,
    [accountId],
  );
  return rows.map(toClient);
}

export async function get(accountId: string, id: string, run?: Query) {
  const execute = tenantQueryFor(accountId, run);
  const [row] = await execute<ClientRow>(`${select} WHERE c.account_id = $1 AND c.id = $2`, [
    accountId,
    id,
  ]);
  return row ? toClient(row) : null;
}

/** Creates or updates the client; null when the id belongs to another account. */
export async function save(accountId: string, id: string, data: Client, run?: Query) {
  const execute = tenantQueryFor(accountId, run);
  const saved = await execute(
    `INSERT INTO clients AS c (id, account_id, name, phone, email, document, address, birth,
       status, vip, notes, automatic)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12, false))
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, phone = excluded.phone,
       email = excluded.email, document = excluded.document, address = excluded.address,
       birth = excluded.birth, status = excluded.status, vip = excluded.vip,
       notes = excluded.notes, automatic = coalesce($12, c.automatic), updated_at = now()
     WHERE c.account_id = excluded.account_id
     RETURNING c.id`,
    [
      id,
      accountId,
      data.name.trim(),
      data.phone ?? '',
      textOrNull(data.email),
      textOrNull(data.document),
      textOrNull(data.address),
      dateOrNull(data.birth),
      textOrNull(data.status),
      data.vip === true,
      textOrNull(data.notes),
      typeof data.automatic === 'boolean' ? data.automatic : null,
    ],
  );
  return saved.length ? get(accountId, id, execute) : null;
}

export async function remove(accountId: string, id: string) {
  const rows = await tenantQueryFor(accountId)(
    'DELETE FROM clients WHERE account_id = $1 AND id = $2 RETURNING id',
    [accountId, id],
  );
  return rows.length > 0;
}

/**
 * Finds the order's client by phone or creates one, refreshing name, phone and
 * status. Returns the client id, or null when the order has no phone that can
 * identify a person: such orders don't register a client at all. Matching by
 * name used to merge different people who share a name, and placeholder
 * phones (000…) merged everyone who had one.
 */
export async function upsertFromOrder(
  accountId: string,
  order: Pick<Order, 'customer' | 'phone' | 'status'>,
  run?: Query,
): Promise<string | null> {
  const phone = order.phone ?? '';
  const digits = identifyingPhoneDigits(phone);
  if (!digits) return null;
  const execute = tenantQueryFor(accountId, run);
  const name = order.customer.trim();
  const status = order.status === 'Concluído' ? 'Concluído' : 'Em atendimento';
  const [match] = await execute<{ id: string }>(
    `SELECT id FROM clients
     WHERE account_id = $1 AND regexp_replace(phone, '\\D', '', 'g') = $2
     ORDER BY updated_at DESC
     LIMIT 1`,
    [accountId, digits],
  );
  if (match) {
    await execute(
      `UPDATE clients SET name = $2, phone = CASE WHEN $3 <> '' THEN $3 ELSE phone END,
         status = $4, updated_at = now()
       WHERE id = $1`,
      [match.id, name, phone, status],
    );
    return match.id;
  }
  const id = `client-${crypto.randomUUID()}`;
  await execute(
    `INSERT INTO clients (id, account_id, name, phone, status, automatic)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [id, accountId, name, phone, status],
  );
  return id;
}
