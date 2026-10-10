import { tenantTransaction } from '@/lib/db';
import { forecastMonth, type DayTotals, type ForecastInput } from '@/lib/forecast';
import { isPayableRecurrence } from '@/lib/payable-recurrence';
import { COMPETENCE, RECEIPT_COST } from '@/lib/repos/cash';
import { money } from '@/lib/repos/rows';
import { todayInSaoPaulo } from '@/lib/warranty';

/**
 * Dados da previsão do mês, com as mesmas definições dos totais do Início
 * (data de competência e custo das peças de cada recebimento).
 */
export async function forecastInput(
  accountId: string,
  asOfDate = todayInSaoPaulo(),
): Promise<ForecastInput> {
  return tenantTransaction(accountId, async (run) => {
    // Desde o início do mês passado ou 8 semanas atrás, o que vier antes.
    const [{ from }] = await run<{ from: string }>(
      `SELECT LEAST((date_trunc('month', $1::date) - interval '1 month')::date,
                    $1::date - 56)::text AS from`,
      [asOfDate],
    );
    const days = await run<{
      day: string;
      income: string;
      cost: string;
      loose_expense: string;
      bill_expense: string;
    }>(
      `SELECT ${COMPETENCE}::text AS day,
         COALESCE(SUM(c.value) FILTER (WHERE c.kind IN ('in', 'payment')), 0) AS income,
         COALESCE(SUM(ROUND(${RECEIPT_COST}, 2)), 0) AS cost,
         COALESCE(SUM(c.value) FILTER (
           WHERE c.kind NOT IN ('in', 'payment') AND p.id IS NULL), 0) AS loose_expense,
         COALESCE(SUM(c.value) FILTER (
           WHERE c.kind NOT IN ('in', 'payment') AND p.id IS NOT NULL
             AND p.source IS DISTINCT FROM 'purchase'), 0) AS bill_expense
       FROM cash_entries c
       LEFT JOIN orders o ON o.account_id = c.account_id AND o.id = c.order_id
       -- Saída que pagou uma conta cadastrada: a conta já entra pelo valor exato.
       -- Compra (peças, materiais) não é gasto do mês: o custo sai de cada OS.
       LEFT JOIN payables p ON p.account_id = c.account_id AND p.cash_entry_id = c.id
       WHERE c.account_id = $1 AND ${COMPETENCE} BETWEEN $2::date AND $3::date
       GROUP BY 1 ORDER BY 1`,
      [accountId, from, asOfDate],
    );
    const [first] = await run<{ day: string | null }>(
      `SELECT min(${COMPETENCE})::text AS day FROM cash_entries c WHERE c.account_id = $1`,
      [accountId],
    );
    // Contas pendentes que vencem até o fim do mês, inclusive atrasadas (sem compras).
    const bills = await run<{
      amount: string;
      due_date: string;
      recurrence: string | null;
      recurrence_day: number | null;
    }>(
      `SELECT amount, due_date::text AS due_date, recurrence, recurrence_day
       FROM payables
       WHERE account_id = $1 AND status = 'pending' AND due_date IS NOT NULL
         AND source IS DISTINCT FROM 'purchase'
         AND due_date <= (date_trunc('month', $2::date) + interval '1 month - 1 day')::date`,
      [accountId, asOfDate],
    );
    // OS prontas (para retirada ou concluídas) com saldo a receber, e a margem dele.
    const [ready] = await run<{ income: string; margin: string }>(
      `SELECT COALESCE(SUM(remaining), 0) AS income,
         COALESCE(ROUND(SUM(CASE WHEN total > 0 THEN remaining * (total - cost) / total
                                 ELSE 0 END), 2), 0) AS margin
       FROM (
         SELECT o.total, COALESCE(o.cost, 0) AS cost,
           GREATEST(o.total - COALESCE(SUM(c.value), 0), 0) AS remaining
         FROM orders o
         LEFT JOIN cash_entries c
           ON c.account_id = o.account_id AND c.order_id = o.id AND c.kind = 'in'
         WHERE o.account_id = $1 AND o.status <> 'Cancelado' AND o.total > 0
           AND (o.status = 'Concluído' OR o.stage = 'Retirada')
         GROUP BY o.id, o.total, o.cost
       ) ready`,
      [accountId],
    );
    return {
      asOfDate,
      days: days.map((row): DayTotals => ({
        day: row.day,
        income: money(row.income),
        cost: money(row.cost),
        looseExpense: money(row.loose_expense),
        billExpense: money(row.bill_expense),
      })),
      firstActivity: first?.day ?? undefined,
      pendingBills: bills.map((row) => ({
        amount: money(row.amount),
        dueDate: row.due_date,
        recurrence: isPayableRecurrence(row.recurrence) ? row.recurrence : undefined,
        recurrenceDay: row.recurrence_day ?? undefined,
      })),
      ready: { income: money(ready.income), margin: money(ready.margin) },
    };
  });
}

export async function monthForecast(accountId: string, asOfDate = todayInSaoPaulo()) {
  return forecastMonth(await forecastInput(accountId, asOfDate));
}
