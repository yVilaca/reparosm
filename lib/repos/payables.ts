import { tenantQueryFor, type Query } from '@/lib/db';
import { dateOrNull, iso, money, textOrNull, type Timestamp } from '@/lib/repos/rows';
import type { Payable, PayableStatus } from '@/lib/types';

type PayableRow = {
  id: string;
  description: string;
  supplier: string | null;
  category: string | null;
  source: Payable['source'];
  amount: string;
  due_date: string | null;
  status: PayableStatus;
  paid_at: Timestamp | null;
  method: string | null;
  notes: string | null;
  cash_entry_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export class PayableError extends Error {}
export type PayableRecord = { id: string; data: Payable };

const toPayable = (row: PayableRow): PayableRecord => ({
  id: row.id,
  data: {
    description: row.description,
    supplier: row.supplier || undefined,
    category: row.category || undefined,
    source: row.source,
    amount: money(row.amount),
    dueDate: row.due_date || undefined,
    status: row.status,
    paidAt: row.paid_at ? iso(row.paid_at) : undefined,
    method: row.method || undefined,
    notes: row.notes || undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  } satisfies Payable,
});

const select = `SELECT id, description, supplier, category, source, amount,
    due_date::text AS due_date, status, paid_at, method, notes, cash_entry_id, created_at, updated_at
  FROM payables`;

export async function list(accountId: string, run?: Query) {
  const rows = await tenantQueryFor(accountId, run)<PayableRow>(
    `${select} WHERE account_id = $1 ORDER BY (status = 'pending') DESC, due_date NULLS LAST, updated_at DESC`,
    [accountId],
  );
  return rows.map(toPayable);
}

export async function save(accountId: string, id: string, data: Payable, run?: Query) {
  const execute = tenantQueryFor(accountId, run);
  const status: PayableStatus = data.status === 'paid' ? 'paid' : 'pending';
  const [saved] = await execute<{ id: string }>(
    `INSERT INTO payables AS p
       (id, account_id, description, supplier, category, source, amount, due_date, status,
        paid_at, method, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 = 'paid' THEN coalesce($10::timestamptz, now()) END, $11, $12)
     ON CONFLICT (id) DO UPDATE SET description = excluded.description,
       supplier = excluded.supplier, category = excluded.category, source = excluded.source,
       amount = excluded.amount, due_date = excluded.due_date,
       status = CASE WHEN p.status = 'paid' THEN 'paid' ELSE excluded.status END,
       paid_at = CASE WHEN p.status = 'paid' THEN p.paid_at ELSE excluded.paid_at END,
       method = excluded.method, notes = excluded.notes, updated_at = now()
     WHERE p.account_id = excluded.account_id
     RETURNING id`,
    [
      id,
      accountId,
      data.description.trim(),
      textOrNull(data.supplier),
      textOrNull(data.category),
      data.source || 'other',
      money(data.amount),
      dateOrNull(data.dueDate),
      status,
      data.paidAt || null,
      textOrNull(data.method),
      textOrNull(data.notes),
    ],
  );
  if (!saved) return null;

  const [current] = await execute<PayableRow>(
    `${select} WHERE account_id = $1 AND id = $2 FOR UPDATE`,
    [accountId, id],
  );
  if (current.status === 'paid' && !current.cash_entry_id) {
    throw new PayableError('Conta paga sem vínculo de caixa.');
  }
  if (current.status === 'paid' && !current.cash_entry_id) return null;
  return toPayable(current);
}

export async function markPaid(accountId: string, id: string, method: string, run?: Query) {
  const execute = tenantQueryFor(accountId, run);
  const [current] = await execute<PayableRow & { cash_entry_id: string | null }>(
    `${select} WHERE account_id = $1 AND id = $2 FOR UPDATE`,
    [accountId, id],
  );
  if (!current) return null;
  if (current.status === 'paid') return toPayable(current);
  const cashEntryId = `cash-payable-${id}`;
  await execute(
    `INSERT INTO cash_entries (id, account_id, kind, description, reference, value, method, date)
     VALUES ($1, $2, 'out', $3, $4, $5, $6, (now() AT TIME ZONE 'America/Sao_Paulo')::date)`,
    [cashEntryId, accountId, current.description, current.supplier, current.amount, method],
  );
  await execute(
    `UPDATE payables SET status = 'paid', paid_at = now(), method = $3,
        cash_entry_id = $4, updated_at = now()
     WHERE account_id = $1 AND id = $2`,
    [accountId, id, method, cashEntryId],
  );
  const [updated] = await execute<PayableRow>(`${select} WHERE account_id = $1 AND id = $2`, [
    accountId,
    id,
  ]);
  return toPayable(updated);
}

export async function remove(accountId: string, id: string) {
  const rows = await tenantQueryFor(accountId)(
    `DELETE FROM payables WHERE account_id = $1 AND id = $2 AND status = 'pending' RETURNING id`,
    [accountId, id],
  );
  return rows.length > 0;
}
