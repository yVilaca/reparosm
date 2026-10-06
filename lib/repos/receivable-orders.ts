import { tenantQueryFor } from '@/lib/db';
import { money } from '@/lib/repos/rows';
import { todayInSaoPaulo } from '@/lib/warranty';
import { RECEIPT_COST } from '@/lib/repos/cash';
import type { Receipt, ReceivableOrder } from '@/lib/agenda';

// Sem entrada no caixa vinculada, a OS ainda não foi recebida.
const UNPAID = `LEFT JOIN cash_entries c
    ON c.account_id = o.account_id AND c.order_id = o.id AND c.kind = 'in'`;

/**
 * OS com valor a receber: não cancelada, com total e sem recebimento. A idade
 * conta da última atualização, como no painel Hoje.
 */
export async function open(
  accountId: string,
  asOfDate = todayInSaoPaulo(),
): Promise<ReceivableOrder[]> {
  const rows = await tenantQueryFor(accountId)<{
    id: string;
    code: string;
    customer: string;
    device: string;
    phone: string | null;
    total: string;
    cost: string;
    stage: string | null;
    status: string | null;
    days: number;
  }>(
    `SELECT o.id, o.code, o.customer, o.device, o.phone, o.total, o.stage, o.status, o.cost,
            ($2::date - (o.updated_at AT TIME ZONE 'America/Sao_Paulo')::date) AS days
     FROM orders o ${UNPAID}
     WHERE o.account_id = $1 AND o.total > 0 AND o.status IS DISTINCT FROM 'Cancelado'
       AND c.id IS NULL
     ORDER BY o.updated_at, o.id`,
    [accountId, asOfDate],
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    customer: row.customer,
    device: row.device,
    ...(row.phone ? { phone: row.phone } : {}),
    total: money(row.total),
    cost: money(row.cost),
    stage: row.stage || 'Recebido',
    status: row.status || 'Aberto',
    days: Math.max(0, Number(row.days)),
  }));
}

/** Recebimentos de OS desde `since` (data de competência), do mais recente ao mais antigo. */
export async function received(
  accountId: string,
  since: string,
  until?: string,
): Promise<Receipt[]> {
  const rows = await tenantQueryFor(accountId)<{
    id: string;
    order_id: string | null;
    code: string;
    customer: string;
    device: string;
    value: string;
    cost: string;
    method: string | null;
    date: string;
    created_at: Date;
  }>(
    `SELECT c.id, c.order_id, COALESCE(o.code, '') AS code,
            COALESCE(o.customer, c.description) AS customer,
            COALESCE(o.device, c.reference, '') AS device, c.value, c.method,
            COALESCE(c.date, (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date)::text AS date,
            c.created_at, ROUND(${RECEIPT_COST},2) AS cost
     FROM cash_entries c
     LEFT JOIN orders o ON o.account_id = c.account_id AND o.id = c.order_id
     WHERE c.account_id = $1 AND c.kind = 'in'
       AND COALESCE(c.date, (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date) >= $2::date
       AND ($3::date IS NULL OR COALESCE(c.date, (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date) <= $3::date)
     ORDER BY 8 DESC, c.created_at DESC, c.id DESC`,
    [accountId, since, until || null],
  );
  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    code: row.code,
    customer: row.customer,
    device: row.device,
    value: money(row.value),
    cost: money(row.cost),
    ...(row.method ? { method: row.method } : {}),
    date: row.date,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/** Primeiro dia do mês, dois meses antes de `asOfDate`: a janela de "Pagos e recebidos". */
export const historyStart = (asOfDate = todayInSaoPaulo()) => {
  const [year, month] = asOfDate.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 3, 1));
  return start.toISOString().slice(0, 10);
};
