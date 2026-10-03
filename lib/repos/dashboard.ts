import { tenantQueryFor } from '@/lib/db';
import { money } from '@/lib/repos/rows';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { OrderStage } from '@/lib/types';

export type DashboardActionKind = 'ready' | 'charge' | 'quote' | 'stalled' | 'overdue' | 'restock';

export type DashboardAction = {
  kind: DashboardActionKind;
  id: string;
  code?: string;
  who: string;
  what?: string;
  phone?: string;
  amount?: number;
  /** Dias de espera, em dias de São Paulo. */
  days: number;
};

export type BenchStage = { stage: OrderStage; orders: number };

const STAGES: OrderStage[] = [
  'Recebido',
  'Diagnóstico',
  'Aguardando aprovação',
  'Em reparo',
  'Teste final',
  'Retirada',
];

// A OS segue em serviço até ser concluída ou cancelada; "Retirada" é a última
// etapa, então etapa sozinha não diz se o aparelho ainda está na loja.
const IN_SERVICE = `o.status NOT IN ('Concluído', 'Cancelado')`;
const QUOTE_WAIT_DAYS = 2;
const STALLED_DAYS = 2;
const LIMIT = 20;

/** Idade em dias de São Paulo entre um timestamp e a data de referência. */
const ageOf = (column: string) =>
  `($2::date - (${column} AT TIME ZONE 'America/Sao_Paulo')::date)`;

type Row = {
  kind: DashboardActionKind;
  id: string;
  code: string | null;
  who: string;
  what: string | null;
  phone: string | null;
  amount: string | null;
  days: number;
};

/**
 * O que precisa de alguém agora, com nome, motivo e valor. A data de
 * referência é injetável para que os testes não dependam do dia em que rodam.
 */
export async function actions(
  accountId: string,
  asOfDate = todayInSaoPaulo(),
): Promise<DashboardAction[]> {
  const execute = tenantQueryFor(accountId);
  const rows = await execute<Row>(
    `(SELECT 'ready' AS kind, o.id, o.code, o.customer AS who, o.device AS what, o.phone,
             o.total AS amount, ${ageOf('o.updated_at')} AS days
      FROM orders o
      WHERE o.account_id = $1 AND o.stage = 'Retirada' AND ${IN_SERVICE}
      LIMIT ${LIMIT})
     UNION ALL
     (SELECT 'charge', o.id, o.code, o.customer, o.device, o.phone, o.total, ${ageOf('o.updated_at')}
      FROM orders o
      LEFT JOIN cash_entries c
        ON c.account_id = o.account_id AND c.order_id = o.id AND c.kind = 'in'
      WHERE o.account_id = $1 AND o.status = 'Concluído' AND o.total > 0 AND c.id IS NULL
      LIMIT ${LIMIT})
     UNION ALL
     (SELECT 'stalled', o.id, o.code, o.customer, o.device, o.phone, o.total, ${ageOf('o.updated_at')}
      FROM orders o
      WHERE o.account_id = $1 AND o.priority = 'Urgente' AND ${IN_SERVICE}
        AND o.stage <> 'Retirada' AND ${ageOf('o.updated_at')} >= ${STALLED_DAYS}
      LIMIT ${LIMIT})
     UNION ALL
     (SELECT 'quote', q.id, q.code, q.customer, q.device, q.phone, q.total, ${ageOf('q.created_at')}
      FROM quotes q
      WHERE q.account_id = $1 AND q.status = 'Aguardando'
        AND ${ageOf('q.created_at')} >= ${QUOTE_WAIT_DAYS}
      LIMIT ${LIMIT})
     UNION ALL
     (SELECT 'overdue', b.id, NULL, COALESCE(NULLIF(b.supplier, ''), b.description), b.description,
             NULL, b.amount, ($2::date - b.due_date)
      FROM payables b
      WHERE b.account_id = $1 AND b.status = 'pending' AND b.due_date < $2::date
      LIMIT ${LIMIT})
     UNION ALL
     (SELECT 'restock', p.id, NULL, p.name, p.category, NULL, NULL, 0
      FROM parts p
      WHERE p.account_id = $1 AND p.stock = 0
      LIMIT ${LIMIT})`,
    [accountId, asOfDate],
  );
  return rows
    .map((row) => ({
      kind: row.kind,
      id: row.id,
      ...(row.code ? { code: row.code } : {}),
      who: row.who,
      ...(row.what ? { what: row.what } : {}),
      ...(row.phone ? { phone: row.phone } : {}),
      ...(row.amount !== null ? { amount: money(row.amount) } : {}),
      days: Number(row.days),
    }))
    .sort((left, right) => {
      // Reposição não tem data de espera: vai para o fim.
      if ((left.kind === 'restock') !== (right.kind === 'restock'))
        return left.kind === 'restock' ? 1 : -1;
      return right.days - left.days;
    });
}

/** Quantas OS ainda em serviço estão em cada etapa, na ordem do fluxo. */
export async function bench(accountId: string): Promise<BenchStage[]> {
  const rows = await tenantQueryFor(accountId)<{ stage: string; orders: string }>(
    `SELECT o.stage, count(*) AS orders FROM orders o
     WHERE o.account_id = $1 AND ${IN_SERVICE}
     GROUP BY o.stage`,
    [accountId],
  );
  const counts = new Map(rows.map((row) => [row.stage, Number(row.orders)]));
  return STAGES.map((stage) => ({ stage, orders: counts.get(stage) ?? 0 }));
}
