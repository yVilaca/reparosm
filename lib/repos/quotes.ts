import { tenantQueryFor, type Query } from '@/lib/db';
import {
  compact,
  dateOrNull,
  iso,
  money,
  textOrNull,
  toRecord,
  type Timestamp,
} from '@/lib/repos/rows';
import type { Quote, QuoteStatus } from '@/lib/types';

type QuoteRow = {
  id: string;
  account_id: string;
  code: string | null;
  customer: string;
  phone: string;
  device: string;
  problem: string | null;
  service: string;
  notes: string | null;
  labor: string;
  parts: string;
  total: string;
  valid_until: string | null;
  status: QuoteStatus;
  answered_at: Timestamp | null;
  order_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

const STATUSES: readonly QuoteStatus[] = ['Aguardando', 'Aprovado', 'Recusado'];

const select = `SELECT q.id, q.account_id, q.code, q.customer, q.phone, q.device, q.problem,
    q.service, q.notes, q.labor, q.parts, q.total, q.valid_until::text AS valid_until, q.status,
    q.answered_at, q.created_at, q.updated_at, o.id AS order_id
  FROM quotes q
  LEFT JOIN LATERAL (
    SELECT id FROM orders WHERE quote_id = q.id ORDER BY created_at LIMIT 1
  ) o ON true`;

const toQuote = (row: QuoteRow) =>
  toRecord(
    'quote',
    row.id,
    compact({
      code: row.code,
      customer: row.customer,
      phone: row.phone,
      device: row.device,
      problem: row.problem,
      service: row.service,
      notes: row.notes,
      labor: money(row.labor),
      parts: money(row.parts),
      total: money(row.total),
      validUntil: row.valid_until,
      status: row.status,
      orderId: row.order_id,
      answeredAt: row.answered_at && iso(row.answered_at),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }),
  );

export async function list(accountId: string, run?: Query) {
  const rows = await tenantQueryFor(accountId, run)<QuoteRow>(
    `${select} WHERE q.account_id = $1 ORDER BY q.updated_at DESC`,
    [accountId],
  );
  return rows.map(toQuote);
}

export async function get(accountId: string, id: string, run?: Query) {
  const execute = tenantQueryFor(accountId, run);
  const [row] = await execute<QuoteRow>(`${select} WHERE q.account_id = $1 AND q.id = $2`, [
    accountId,
    id,
  ]);
  return row ? toQuote(row) : null;
}

/**
 * A quote by id for the public approval page, with its owner. `lock` takes a row lock so
 * concurrent approvals of the same quote run one at a time (use inside a transaction).
 */
export async function findPublic(id: string, run: Query, lock = false) {
  const [row] = await run<QuoteRow>(`${select} WHERE q.id = $1${lock ? ' FOR UPDATE OF q' : ''}`, [
    id,
  ]);
  return row ? { accountId: row.account_id, record: toQuote(row) } : null;
}

/** Creates or updates the quote; null when the id belongs to another account. */
export async function save(accountId: string, id: string, data: Quote, run?: Query) {
  const execute = tenantQueryFor(accountId, run);
  const labor = money(data.labor);
  const parts = money(data.parts);
  const saved = await execute(
    `INSERT INTO quotes AS q (id, account_id, code, customer, phone, device, problem, service,
       notes, labor, parts, total, valid_until, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO UPDATE SET code = excluded.code, customer = excluded.customer,
       phone = excluded.phone, device = excluded.device, problem = excluded.problem,
       service = excluded.service, notes = excluded.notes, labor = excluded.labor,
       parts = excluded.parts, total = excluded.total, valid_until = excluded.valid_until,
       status = excluded.status, updated_at = now()
     WHERE q.account_id = excluded.account_id
     RETURNING q.id`,
    [
      id,
      accountId,
      textOrNull(data.code),
      data.customer,
      data.phone ?? '',
      data.device,
      textOrNull(data.problem),
      data.service,
      textOrNull(data.notes),
      labor,
      parts,
      data.total === undefined ? labor + parts : money(data.total),
      dateOrNull(data.validUntil),
      STATUSES.includes(data.status as QuoteStatus) ? data.status : 'Aguardando',
    ],
  );
  return saved.length ? get(accountId, id, execute) : null;
}

/** Records the customer's answer from the public page. */
export async function answer(
  accountId: string,
  id: string,
  status: 'Aprovado' | 'Recusado',
  clientId: string | null,
  run?: Query,
) {
  await tenantQueryFor(accountId, run)(
    `UPDATE quotes SET status = $3, answered_at = now(), updated_at = now(),
       client_id = coalesce($4, client_id)
     WHERE account_id = $1 AND id = $2`,
    [accountId, id, status, clientId],
  );
}

export async function remove(accountId: string, id: string) {
  const rows = await tenantQueryFor(accountId)(
    'DELETE FROM quotes WHERE account_id = $1 AND id = $2 RETURNING id',
    [accountId, id],
  );
  return rows.length > 0;
}
