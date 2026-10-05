import { tenantQueryFor, type Query } from '@/lib/db';
import { money } from '@/lib/repos/rows';
import { todayInSaoPaulo } from '@/lib/warranty';

export type CashTotals = { income: number; expense: number; balance: number };
export type MethodTotal = { method: string; value: number };
export type OrderFinancialTotals = {
  gross: number;
  net: number;
  grossReceivable: number;
  netReceivable: number;
};
export type MonthlyCashTotals = CashTotals & {
  month: string;
  paidOrders: number;
  averageTicket: number;
};

/**
 * Data de competência: a informada pelo usuário ou, na falta dela, o dia em
 * São Paulo em que o lançamento foi criado. Sem o COALESCE um lançamento sem
 * data sumiria de todos os períodos e continuaria somando no total geral.
 */
const COMPETENCE = `COALESCE(c.date, (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date)`;

/** All non-cancelled orders; unpaid margin is proportional to the remaining balance. */
export async function orderFinancialTotals(accountId: string): Promise<OrderFinancialTotals> {
  const [row] = await tenantQueryFor(accountId)<{
    gross: string;
    net: string;
    gross_receivable: string;
    net_receivable: string;
  }>(
    `WITH amounts AS (
      SELECT o.total, o.cost,
        GREATEST(o.total - COALESCE(c.value, 0), 0) AS remaining
      FROM orders o LEFT JOIN cash_entries c
        ON c.account_id = o.account_id AND c.order_id = o.id AND c.kind = 'in'
      WHERE o.account_id = $1 AND o.status <> 'Cancelado'
    )
    SELECT COALESCE(SUM(total), 0) AS gross,
      COALESCE(SUM(total - cost), 0) AS net,
      COALESCE(SUM(remaining), 0) AS gross_receivable,
      COALESCE(ROUND(SUM(CASE WHEN total > 0
        THEN remaining * (total - cost) / total ELSE 0 END), 2), 0) AS net_receivable
    FROM amounts`,
    [accountId],
  );
  return {
    gross: money(row.gross),
    net: money(row.net),
    grossReceivable: money(row.gross_receivable),
    netReceivable: money(row.net_receivable),
  };
}

const totalsOf = (rows: Array<{ kind: string; value: string }>): CashTotals => {
  const income = rows
    .filter((row) => row.kind === 'in')
    .reduce((sum, row) => sum + money(row.value), 0);
  const expense = rows
    .filter((row) => row.kind === 'out')
    .reduce((sum, row) => sum + money(row.value), 0);
  return { income, expense, balance: income - expense };
};

const rangeTotals = async (
  execute: Query,
  accountId: string,
  from: string,
  to: string,
): Promise<CashTotals> => {
  const rows = await execute<{ kind: string; value: string }>(
    `SELECT c.kind, SUM(c.value) AS value FROM cash_entries c
     WHERE c.account_id = $1 AND ${COMPETENCE} BETWEEN $2::date AND $3::date
     GROUP BY c.kind`,
    [accountId, from, to],
  );
  return totalsOf(rows);
};

export async function today(accountId: string, asOfDate = todayInSaoPaulo()) {
  const execute = tenantQueryFor(accountId);
  const totals = await rangeTotals(execute, accountId, asOfDate, asOfDate);
  const methods = await execute<{ method: string; value: string }>(
    `SELECT COALESCE(NULLIF(BTRIM(c.method), ''), 'Não informado') AS method,
            SUM(c.value) AS value
     FROM cash_entries c
     WHERE c.account_id = $1 AND c.kind = 'in' AND ${COMPETENCE} = $2::date
     GROUP BY 1 ORDER BY 2 DESC`,
    [accountId, asOfDate],
  );
  return {
    ...totals,
    methods: methods.map((row) => ({ method: row.method, value: money(row.value) })),
  };
}

export async function month(accountId: string, asOfDate = todayInSaoPaulo()) {
  const execute = tenantQueryFor(accountId);
  const [window] = await execute<{
    current_from: string;
    previous_from: string;
    previous_to: string;
  }>(
    `SELECT date_trunc('month', $1::date)::date::text AS current_from,
            (date_trunc('month', $1::date) - interval '1 month')::date::text AS previous_from,
            -- O LEAST impede que a janela anterior invada o mês corrente:
            -- em 31/03, fevereiro + 30 dias cairia em 03/03.
            LEAST(
              (date_trunc('month', $1::date) - interval '1 month')::date
                + ($1::date - date_trunc('month', $1::date)::date),
              date_trunc('month', $1::date)::date - 1
            )::text AS previous_to`,
    [asOfDate],
  );
  const [current, previous] = await Promise.all([
    rangeTotals(execute, accountId, window.current_from, asOfDate),
    rangeTotals(execute, accountId, window.previous_from, window.previous_to),
  ]);
  return { current, previous };
}

/** Six calendar months, including zero-activity months; current month ends at asOfDate. */
export async function trend(
  accountId: string,
  asOfDate = todayInSaoPaulo(),
): Promise<MonthlyCashTotals[]> {
  const rows = await tenantQueryFor(accountId)<{
    month: string;
    income: string;
    expense: string;
    paid_orders: string;
    average_ticket: string;
  }>(
    `WITH months AS (
      SELECT generate_series(date_trunc('month', $2::date) - interval '5 months',
        date_trunc('month', $2::date), interval '1 month')::date AS month
    )
    SELECT m.month::text AS month,
      COALESCE(SUM(c.value) FILTER (WHERE c.kind = 'in'), 0) AS income,
      COALESCE(SUM(c.value) FILTER (WHERE c.kind = 'out'), 0) AS expense,
      COUNT(c.id) FILTER (WHERE c.kind = 'in' AND c.order_id IS NOT NULL) AS paid_orders,
      COALESCE(AVG(c.value) FILTER (WHERE c.kind = 'in' AND c.order_id IS NOT NULL), 0) AS average_ticket
    FROM months m LEFT JOIN cash_entries c ON c.account_id = $1
      AND ${COMPETENCE} >= m.month AND ${COMPETENCE} < m.month + interval '1 month'
      AND ${COMPETENCE} <= $2::date
    GROUP BY m.month ORDER BY m.month`,
    [accountId, asOfDate],
  );
  return rows.map((row) => {
    const income = money(row.income),
      expense = money(row.expense);
    return {
      month: row.month,
      income,
      expense,
      balance: income - expense,
      paidOrders: Number(row.paid_orders),
      averageTicket: money(row.average_ticket),
    };
  });
}

export type ReceivableGroup = { orders: number; amount: number };
export type ReceivableOrder = {
  id: string;
  code: string;
  customer: string;
  device: string;
  status: string;
  total: number;
};

const UNPAID = `LEFT JOIN cash_entries c
    ON c.account_id = o.account_id AND c.order_id = o.id AND c.kind = 'in'`;

export async function receivables(accountId: string) {
  const execute = tenantQueryFor(accountId);
  const rows = await execute<{
    id: string;
    code: string;
    customer: string;
    device: string;
    total: string;
    status: string;
  }>(
    `SELECT o.id, o.code, o.customer, o.device, o.total, o.status
     FROM orders o ${UNPAID}
     WHERE o.account_id = $1 AND o.total > 0 AND o.status <> 'Cancelado' AND c.id IS NULL
     ORDER BY o.updated_at DESC`,
    [accountId],
  );
  const group = (items: typeof rows): ReceivableGroup => ({
    orders: items.length,
    amount: items.reduce((sum, row) => sum + money(row.total), 0),
  });
  const list = rows.map((row) => ({ ...row, total: money(row.total) }));
  const ready = rows.filter((row) => row.status === 'Concluído');
  return {
    pending: { ...group(rows), list },
    ready: {
      ...group(ready),
      list: list.filter((row) => row.status === 'Concluído'),
    },
    inProgress: group(rows.filter((row) => row.status !== 'Concluído')),
  };
}

export async function review(accountId: string) {
  const execute = tenantQueryFor(accountId);
  // As diferenças são somadas em numeric no banco: comparar em float no
  // JavaScript erra em centavos. Positivas e negativas vão em colunas
  // separadas para que não se cancelem.
  const [row] = await execute<{
    divergent_orders: string;
    to_collect: string;
    overpaid: string;
    cancelled_orders: string;
    cancelled_amount: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE c.value <> o.total) AS divergent_orders,
       COALESCE(SUM(GREATEST(o.total - c.value, 0)), 0) AS to_collect,
       COALESCE(SUM(GREATEST(c.value - o.total, 0)), 0) AS overpaid,
       COUNT(*) FILTER (WHERE o.status = 'Cancelado') AS cancelled_orders,
       COALESCE(SUM(c.value) FILTER (WHERE o.status = 'Cancelado'), 0) AS cancelled_amount
     FROM orders o
     JOIN cash_entries c
       ON c.account_id = o.account_id AND c.order_id = o.id AND c.kind = 'in'
     WHERE o.account_id = $1`,
    [accountId],
  );
  return {
    divergent: {
      orders: Number(row.divergent_orders),
      toCollect: money(row.to_collect),
      overpaid: money(row.overpaid),
    },
    cancelledPaid: {
      orders: Number(row.cancelled_orders),
      amount: money(row.cancelled_amount),
    },
  };
}

export type CashPeriod = 'today' | 'month' | 'previous-month';
export type CashHistoryRow = {
  id: string;
  kind: 'in' | 'out';
  description: string;
  reference: string | null;
  method: string;
  date: string;
  value: number;
  order: { id: string; code: string } | null;
};

export async function history(
  accountId: string,
  period: CashPeriod,
  asOfDate = todayInSaoPaulo(),
): Promise<CashHistoryRow[]> {
  const execute = tenantQueryFor(accountId);
  const [window] = await execute<{ from: string; to: string }>(
    `SELECT
       CASE $2
         WHEN 'today' THEN $1::date
         WHEN 'month' THEN date_trunc('month', $1::date)::date
         ELSE (date_trunc('month', $1::date) - interval '1 month')::date
       END::text AS "from",
       CASE $2
         WHEN 'previous-month' THEN (date_trunc('month', $1::date) - interval '1 day')::date
         ELSE $1::date
       END::text AS "to"`,
    [asOfDate, period],
  );
  const rows = await execute<{
    id: string;
    kind: 'in' | 'out';
    description: string;
    reference: string | null;
    method: string | null;
    date: string;
    value: string;
    order_id: string | null;
    order_code: string | null;
  }>(
    `SELECT c.id, c.kind, c.description, c.reference, c.method, ${COMPETENCE}::text AS date, c.value,
            c.order_id, o.code AS order_code
     FROM cash_entries c
     LEFT JOIN orders o ON o.account_id = c.account_id AND o.id = c.order_id
     WHERE c.account_id = $1 AND ${COMPETENCE} BETWEEN $2::date AND $3::date
     ORDER BY ${COMPETENCE} DESC, c.created_at DESC`,
    [accountId, window.from, window.to],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    description: row.description,
    reference: row.reference,
    method: row.method?.trim() || 'Não informado',
    date: row.date,
    value: money(row.value),
    order: row.order_id && row.order_code ? { id: row.order_id, code: row.order_code } : null,
  }));
}
