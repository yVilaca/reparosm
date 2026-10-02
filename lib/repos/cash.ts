import { tenantQueryFor, type Query } from '@/lib/db';
import { money } from '@/lib/repos/rows';
import { todayInSaoPaulo } from '@/lib/warranty';

export type CashTotals = { income: number; expense: number; balance: number };
export type MethodTotal = { method: string; value: number };

/**
 * Data de competência: a informada pelo usuário ou, na falta dela, o dia em
 * São Paulo em que o lançamento foi criado. Sem o COALESCE um lançamento sem
 * data sumiria de todos os períodos e continuaria somando no total geral.
 */
const COMPETENCE = `COALESCE(c.date, (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date)`;

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
