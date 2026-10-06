import { tenantQueryFor, tenantTransaction, type Query } from '@/lib/db';
import * as orderItems from '@/lib/repos/order-items';
import {
  compact,
  dateOrNull,
  iso,
  money,
  textOrNull,
  toRecord,
  type Timestamp,
} from '@/lib/repos/rows';
import type { Order } from '@/lib/types';
import { normalizeOrderStage } from '@/lib/order-stages';

type OrderRow = {
  id: string;
  code: string;
  customer: string;
  phone: string;
  device: string;
  imei: string | null;
  device_password: string | null;
  pattern: number[] | null;
  problem: string | null;
  service: string | null;
  notes: string | null;
  technician: string | null;
  priority: string;
  stage: string;
  status: string;
  labor: string;
  parts: string;
  cost: string;
  total: string;
  warranty_days: number | null;
  delivered_at: string | Date | null;
  whatsapp_consent: boolean;
  quote_id: string | null;
  quote_code: string | null;
  client_id: string | null;
  payment_id: string | null;
  payment_value: string | null;
  payment_method: string | null;
  payment_date: string | null;
  items: import('@/lib/types').OrderItem[];
  created_at: Timestamp;
  updated_at: Timestamp;
};

const select = `SELECT o.id, o.code, o.customer, o.phone, o.device, o.imei, o.device_password,
    o.pattern, o.problem, o.service, o.notes, o.technician, o.priority, o.stage, o.status,
    o.labor, o.parts, o.cost, o.total, o.warranty_days, o.delivered_at, o.whatsapp_consent, o.quote_id,
    q.code AS quote_code, o.client_id, o.created_at, o.updated_at,
    c.id AS payment_id, c.value AS payment_value, c.method AS payment_method,
    c.date::text AS payment_date,
    COALESCE((
      SELECT json_agg(json_build_object(
        'partId', oi.part_id,
        'name', oi.name,
        'quantity', oi.quantity,
        'unitPrice', oi.unit_price,
        'unitCost', oi.unit_cost
      ) ORDER BY oi.created_at, oi.id)
      FROM order_items oi
      WHERE oi.account_id = o.account_id AND oi.order_id = o.id
    ), '[]'::json) AS items
  FROM orders o
  LEFT JOIN quotes q ON q.id = o.quote_id
  LEFT JOIN cash_entries c
    ON c.account_id = o.account_id AND c.order_id = o.id AND c.kind = 'in'`;

const toOrder = (row: OrderRow) =>
  toRecord('order', row.id, {
    ...compact({
      code: row.code,
      customer: row.customer,
      phone: row.phone,
      device: row.device,
      imei: row.imei,
      password: row.device_password,
      pattern: row.pattern,
      problem: row.problem,
      service: row.service,
      notes: row.notes,
      technician: row.technician,
      priority: row.priority,
      stage: normalizeOrderStage(row.stage),
      status: row.status,
      labor: money(row.labor),
      parts: money(row.parts),
      cost: money(row.cost),
      total: money(row.total),
      profit: money(row.total) - money(row.cost),
      warrantyDays: row.warranty_days,
      deliveredAt:
        row.delivered_at instanceof Date
          ? row.delivered_at.toISOString().slice(0, 10)
          : dateOrNull(row.delivered_at),
      whatsappConsent: row.whatsapp_consent,
      quoteId: row.quote_id,
      quoteCode: row.quote_code,
      clientId: row.client_id,
      items: row.items || [],
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }),
    payment: row.payment_id
      ? {
          id: row.payment_id,
          value: money(row.payment_value),
          method: row.payment_method || '',
          date: row.payment_date || '',
        }
      : null,
  });

export async function list(accountId: string, run?: Query) {
  const rows = await tenantQueryFor(accountId, run)<OrderRow>(
    `${select} WHERE o.account_id = $1 ORDER BY o.created_at DESC, o.id DESC`,
    [accountId],
  );
  return rows.map(toOrder);
}

export async function get(accountId: string, id: string, run?: Query) {
  const execute = tenantQueryFor(accountId, run);
  const [row] = await execute<OrderRow>(`${select} WHERE o.account_id = $1 AND o.id = $2`, [
    accountId,
    id,
  ]);
  return row ? toOrder(row) : null;
}

/**
 * Creates or updates the order; null when the id belongs to another account.
 * A quoteId is kept only when that quote belongs to the same account.
 */
export async function save(accountId: string, id: string, data: Order, run?: Query) {
  const execute = tenantQueryFor(accountId, run);
  const saved = await execute(
    `INSERT INTO orders AS o (id, account_id, quote_id, code, customer, phone, device, imei,
       device_password, pattern, problem, service, notes, technician, priority, stage, status,
       labor, parts, cost, total, warranty_days, whatsapp_consent, delivered_at)
     VALUES ($1, $2, (SELECT id FROM quotes WHERE id = $3 AND account_id = $2), $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
     ON CONFLICT (id) DO UPDATE SET quote_id = excluded.quote_id, code = excluded.code,
       customer = excluded.customer, phone = excluded.phone, device = excluded.device,
       imei = excluded.imei, device_password = excluded.device_password,
       pattern = excluded.pattern, problem = excluded.problem, service = excluded.service,
       notes = excluded.notes, technician = excluded.technician, priority = excluded.priority,
       stage = excluded.stage, status = excluded.status, labor = excluded.labor,
       parts = excluded.parts, cost = excluded.cost, total = excluded.total,
       warranty_days = excluded.warranty_days, delivered_at = excluded.delivered_at,
       whatsapp_consent = excluded.whatsapp_consent,
       updated_at = now()
     WHERE o.account_id = excluded.account_id
     RETURNING o.id`,
    [
      id,
      accountId,
      textOrNull(data.quoteId),
      data.code,
      data.customer,
      data.phone ?? '',
      data.device,
      textOrNull(data.imei),
      textOrNull(data.password),
      Array.isArray(data.pattern) ? data.pattern : null,
      textOrNull(data.problem),
      textOrNull(data.service),
      textOrNull(data.notes),
      textOrNull(data.technician),
      data.priority || 'Normal',
      data.stage || 'Recebido',
      data.status || 'Aberto',
      money(data.labor),
      money(data.parts),
      money(data.cost),
      money(data.total),
      Number.isInteger(data.warrantyDays) ? data.warrantyDays : null,
      data.whatsappConsent === true,
      dateOrNull(data.deliveredAt),
    ],
  );
  return saved.length ? get(accountId, id, execute) : null;
}

/** Atomically assigns the next display code ("OS-N") for the account. */
export async function nextCode(accountId: string, run?: Query) {
  const [row] = await tenantQueryFor(accountId, run)<{ next_seq: number }>(
    `INSERT INTO order_code_counters (account_id, next_seq) VALUES ($1, 1)
     ON CONFLICT (account_id) DO UPDATE SET next_seq = order_code_counters.next_seq + 1
     RETURNING next_seq`,
    [accountId],
  );
  return `OS-${row.next_seq}`;
}

export async function linkClient(accountId: string, id: string, clientId: string, run?: Query) {
  await tenantQueryFor(accountId, run)(
    'UPDATE orders SET client_id = $3 WHERE account_id = $1 AND id = $2',
    [accountId, id, clientId],
  );
}

export async function remove(accountId: string, id: string) {
  return tenantTransaction(accountId, async (run) => {
    const found = await run('SELECT id FROM orders WHERE account_id = $1 AND id = $2 FOR UPDATE', [
      accountId,
      id,
    ]);
    if (!found.length) return false;
    await orderItems.replace(accountId, id, [], run);
    const rows = await run('DELETE FROM orders WHERE account_id = $1 AND id = $2 RETURNING id', [
      accountId,
      id,
    ]);
    return rows.length > 0;
  });
}
