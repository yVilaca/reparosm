import { nextPayableDueDate, type PayableRecurrence } from '@/lib/payable-recurrence';
import { installmentDueDates, splitInstallments } from '@/lib/payable-schedule';
import { tenantQueryFor, type Query } from '@/lib/db';
import { dateOrNull, iso, money, textOrNull, type Timestamp } from '@/lib/repos/rows';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { Payable, PayableStatus } from '@/lib/types';

type PayableRow = {
  id: string;
  description: string;
  supplier: string | null;
  category: string | null;
  source: NonNullable<Payable['source']>;
  amount: string;
  series_id: string | null;
  generated_from: string | null;
  recurrence: PayableRecurrence | null;
  recurrence_day: number | null;
  installment_number: number | null;
  installment_count: number | null;
  payment_code: string | null;
  due_date: string | null;
  status: PayableStatus;
  paid_at: Timestamp | null;
  paid_on: string | null;
  paid_amount: string | null;
  method: string | null;
  notes: string | null;
  cash_entry_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

/** Regra de negócio violada; a rota responde 409 com a mensagem. */
export class PayableError extends Error {}
export type PayableRecord = { id: string; data: Payable };

const toPayable = (row: PayableRow): PayableRecord => ({
  id: row.id,
  data: {
    description: row.description,
    supplier: row.supplier || undefined,
    category: row.category || undefined,
    source: row.source,
    recurrence: row.recurrence || undefined,
    seriesId: row.series_id || undefined,
    installmentNumber: row.installment_number ?? undefined,
    installmentCount: row.installment_count ?? undefined,
    paymentCode: row.payment_code || undefined,
    amount: money(row.amount),
    dueDate: row.due_date || undefined,
    status: row.status,
    paidAt: row.paid_at ? iso(row.paid_at) : undefined,
    paidOn: row.paid_on || undefined,
    paidAmount: row.paid_amount === null ? undefined : money(row.paid_amount),
    method: row.method || undefined,
    notes: row.notes || undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  } satisfies Payable,
});

const select = `SELECT id, description, supplier, category, source, amount, series_id, generated_from,
    recurrence, recurrence_day, installment_number, installment_count, payment_code,
    due_date::text AS due_date, status, paid_at, paid_on::text AS paid_on, paid_amount, method,
    notes, cash_entry_id, created_at, updated_at
  FROM payables`;

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const dayOf = (isoDate: string) => Number(isoDate.slice(8));
const brDate = (isoDate: string) => isoDate.split('-').reverse().join('/');

async function lock(execute: Query, accountId: string, id: string) {
  const [row] = await execute<PayableRow>(
    `${select} WHERE account_id = $1 AND id = $2 FOR UPDATE`,
    [accountId, id],
  );
  return row;
}

async function read(execute: Query, accountId: string, id: string) {
  const [row] = await execute<PayableRow>(`${select} WHERE account_id = $1 AND id = $2`, [
    accountId,
    id,
  ]);
  return toPayable(row);
}

export async function list(accountId: string, run?: Query) {
  const rows = await tenantQueryFor(accountId, run)<PayableRow>(
    `${select} WHERE account_id = $1
     ORDER BY (status = 'pending') DESC,
       CASE WHEN status = 'pending' THEN due_date END NULLS LAST,
       CASE WHEN status = 'paid' THEN paid_on END DESC NULLS LAST,
       installment_number NULLS FIRST, created_at DESC, id DESC`,
    [accountId],
  );
  return rows.map(toPayable);
}

const insert = (
  execute: Query,
  accountId: string,
  id: string,
  data: Payable,
  extra: {
    amount: number;
    dueDate: string | null;
    seriesId?: string;
    generatedFrom?: string;
    recurrenceDay?: number | null;
    installmentNumber?: number;
    installmentCount?: number;
  },
) =>
  execute(
    `INSERT INTO payables (id, account_id, description, supplier, category, source, amount, due_date,
       status, notes, payment_code, series_id, generated_from, recurrence, recurrence_day,
       installment_number, installment_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      accountId,
      data.description,
      textOrNull(data.supplier),
      textOrNull(data.category),
      data.source || 'other',
      extra.amount,
      extra.dueDate,
      textOrNull(data.notes),
      textOrNull(data.paymentCode),
      extra.seriesId ?? null,
      extra.generatedFrom ?? null,
      data.recurrence || null,
      extra.recurrenceDay ?? null,
      extra.installmentNumber ?? null,
      extra.installmentCount ?? null,
    ],
  );

/** Cria uma conta, ou uma por parcela, numa só transação. */
export async function create(
  accountId: string,
  data: Payable,
  installments: number | undefined,
  run: Query,
): Promise<PayableRecord[]> {
  const dueDate = dateOrNull(data.dueDate);
  if (installments) {
    const amounts = splitInstallments(data.amount, installments);
    const dates = dueDate ? installmentDueDates(dueDate, installments) : [];
    if (!amounts || dates.length !== installments)
      throw new PayableError('Não foi possível dividir esta compra nas parcelas pedidas.');
    const seriesId = newId('series');
    const ids: string[] = [];
    for (const [index, amount] of amounts.entries()) {
      const id = newId('payable');
      ids.push(id);
      await insert(
        run,
        accountId,
        id,
        { ...data, recurrence: undefined },
        {
          amount,
          dueDate: dates[index],
          seriesId,
          installmentNumber: index + 1,
          installmentCount: installments,
        },
      );
    }
    return Promise.all(ids.map((id) => read(run, accountId, id)));
  }
  const id = newId('payable');
  await insert(run, accountId, id, data, {
    amount: money(data.amount),
    dueDate,
    seriesId: data.recurrence ? newId('series') : undefined,
    recurrenceDay: data.recurrence && dueDate ? dayOf(dueDate) : null,
  });
  return [await read(run, accountId, id)];
}

/** Edita uma conta em aberto. Conta paga só muda depois de desfazer o pagamento. */
export async function update(accountId: string, id: string, data: Payable, run: Query) {
  const current = await lock(run, accountId, id);
  if (!current) return null;
  if (current.status === 'paid')
    throw new PayableError('Conta paga não pode ser editada. Desfaça o pagamento para corrigir.');
  if (data.recurrence && current.installment_count)
    throw new PayableError('Uma parcela não pode virar conta repetida.');
  const dueDate = dateOrNull(data.dueDate);
  const recurrenceDay = !data.recurrence
    ? null
    : current.recurrence_day &&
        current.due_date === dueDate &&
        current.recurrence === data.recurrence
      ? current.recurrence_day
      : dayOf(dueDate!);
  await run(
    `UPDATE payables SET description = $3, supplier = $4, category = $5, source = $6, amount = $7,
       due_date = $8, notes = $9, payment_code = $10, recurrence = $11, recurrence_day = $12,
       series_id = CASE WHEN $11::text IS NULL THEN series_id ELSE coalesce(series_id, $13) END,
       updated_at = now()
     WHERE account_id = $1 AND id = $2`,
    [
      accountId,
      id,
      data.description,
      textOrNull(data.supplier),
      textOrNull(data.category),
      current.installment_count ? current.source : data.source || 'other',
      money(data.amount),
      dueDate,
      textOrNull(data.notes),
      textOrNull(data.paymentCode),
      data.recurrence || null,
      recurrenceDay,
      newId('series'),
    ],
  );
  return read(run, accountId, id);
}

/**
 * Paga a conta com o valor, a data e a forma realmente usados e lança a saída
 * no caixa. Numa conta repetida, gera a próxima ocorrência. Pagar de novo uma
 * conta já paga devolve o registro sem duplicar nada.
 */
export async function pay(
  accountId: string,
  id: string,
  payment: { method: string; amount?: number; paidOn?: string },
  run: Query,
) {
  const current = await lock(run, accountId, id);
  if (!current) return null;
  if (current.status === 'paid') return { record: toPayable(current) };
  const nextDueDate = current.recurrence
    ? nextPayableDueDate(current.due_date!, current.recurrence, current.recurrence_day!)
    : undefined;
  if (nextDueDate === null)
    throw new PayableError(
      'Não foi possível calcular o próximo vencimento. Desligue a repetição antes de pagar.',
    );
  const amount = payment.amount ?? money(current.amount);
  const paidOn = payment.paidOn ?? todayInSaoPaulo();
  const cashEntryId = `cash-payable-${id}`;
  const label = current.installment_count
    ? `${current.description} (${current.installment_number}/${current.installment_count})`
    : current.description;
  await run(
    `INSERT INTO cash_entries (id, account_id, kind, description, reference, value, method, date)
     VALUES ($1, $2, 'out', $3, $4, $5, $6, $7)`,
    [cashEntryId, accountId, label, current.supplier, amount, payment.method, paidOn],
  );
  await run(
    `UPDATE payables SET status = 'paid', paid_at = now(), paid_on = $3, paid_amount = $4,
       method = $5, cash_entry_id = $6, updated_at = now()
     WHERE account_id = $1 AND id = $2`,
    [accountId, id, paidOn, amount, payment.method, cashEntryId],
  );
  let nextRecord: PayableRecord | undefined;
  if (nextDueDate) {
    const nextId = newId('payable');
    // O código do boleto é de um vencimento só: não passa para o próximo.
    await insert(
      run,
      accountId,
      nextId,
      { ...toPayable(current).data, paymentCode: undefined },
      {
        amount: money(current.amount),
        dueDate: nextDueDate,
        seriesId: current.series_id || undefined,
        generatedFrom: id,
        recurrenceDay: current.recurrence_day,
      },
    );
    nextRecord = await read(run, accountId, nextId);
  }
  return { record: await read(run, accountId, id), nextRecord };
}

/**
 * Desfaz o pagamento: a conta volta a ficar em aberto e a saída sai do caixa.
 * A próxima ocorrência que esse pagamento gerou é removida enquanto estiver em
 * aberto; se já foi paga, é ela que precisa ser desfeita primeiro.
 */
export async function undo(accountId: string, id: string, run: Query) {
  const current = await lock(run, accountId, id);
  if (!current) return null;
  if (current.status === 'pending') return { record: toPayable(current) };
  const [next] = await run<PayableRow>(
    `${select} WHERE account_id = $1 AND generated_from = $2 FOR UPDATE`,
    [accountId, id],
  );
  if (next?.status === 'paid')
    throw new PayableError(
      `Desfaça primeiro o pagamento da ocorrência seguinte (vencimento ${brDate(next.due_date!)}).`,
    );
  if (next)
    await run('DELETE FROM payables WHERE account_id = $1 AND id = $2', [accountId, next.id]);
  await run(
    `UPDATE payables SET status = 'pending', paid_at = NULL, paid_on = NULL, paid_amount = NULL,
       method = NULL, cash_entry_id = NULL, updated_at = now()
     WHERE account_id = $1 AND id = $2`,
    [accountId, id],
  );
  await run('DELETE FROM cash_entries WHERE account_id = $1 AND id = $2', [
    accountId,
    current.cash_entry_id,
  ]);
  return { record: await read(run, accountId, id), removedNextId: next?.id };
}

export async function remove(accountId: string, id: string) {
  const rows = await tenantQueryFor(accountId)(
    `DELETE FROM payables WHERE account_id = $1 AND id = $2 AND status = 'pending' RETURNING id`,
    [accountId, id],
  );
  return rows.length > 0;
}
