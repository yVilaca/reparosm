import { tenantQueryFor, type Query } from '@/lib/db';
import { money } from '@/lib/repos/rows';
import type { CashDateRange } from '@/lib/finance';

export const stockSources = [
  'opening',
  'adjustment',
  'quick-sale',
  'sale-reversal',
  'order',
  'order-return',
] as const;
export type StockSource = (typeof stockSources)[number];

export async function policy(accountId: string, run?: Query) {
  const [shop] = await tenantQueryFor(accountId, run)<{ allowed: boolean }>(
    `SELECT profile->'allowNegativeStock' = 'true'::jsonb AS allowed FROM shops WHERE account_id=$1 LIMIT 1`,
    [accountId],
  );
  return shop?.allowed === true;
}

export async function movementContext(
  run: Query,
  source: StockSource,
  id: string,
  reference: string,
) {
  await run(
    `SELECT set_config('app.stock_source',$1,true), set_config('app.stock_reference_id',$2,true), set_config('app.stock_reference',$3,true)`,
    [source, id, reference],
  );
}

export async function availability(accountId: string, ids: string[], orderId?: string) {
  const execute = tenantQueryFor(accountId);
  const [allowNegativeStock, parts] = await Promise.all([
    policy(accountId),
    ids.length
      ? execute<{ id: string; name: string; stock: number; available: number }>(
          `SELECT p.id,p.name,p.stock,(CASE WHEN i.quantity>0 AND o.status <> 'Cancelado' THEN GREATEST(p.stock,0)::bigint+i.quantity ELSE p.stock END)::float8 AS available
       FROM parts p LEFT JOIN order_items i ON i.account_id=p.account_id AND i.part_id=p.id AND i.order_id=$3
       LEFT JOIN orders o ON o.account_id=i.account_id AND o.id=i.order_id
       WHERE p.account_id=$1 AND p.id=ANY($2::text[]) ORDER BY p.id`,
          [accountId, ids, orderId || null],
        )
      : Promise.resolve([]),
  ]);
  return { allowNegativeStock, parts };
}

type MovementRow = {
  id: string;
  part_id: string;
  name: string;
  sku: string | null;
  source: StockSource;
  reference: string | null;
  reference_id: string | null;
  quantity: number;
  stock_before: number;
  stock_after: number;
  unit_cost: string;
  created_at: string;
};
export async function movements(
  accountId: string,
  filters: CashDateRange & {
    partId?: string;
    source?: StockSource;
    direction?: 'in' | 'out';
    search?: string;
    before?: string;
    beforeId?: string;
  },
) {
  const params: unknown[] = [accountId, filters.from, filters.to];
  const where = [
    `account_id=$1`,
    `created_at >= ($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
    `created_at < (($3::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
  ];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.partId) where.push(`part_id=${bind(filters.partId)}`);
  if (filters.source) where.push(`source=${bind(filters.source)}`);
  if (filters.direction) where.push(filters.direction === 'in' ? 'quantity>0' : 'quantity<0');
  if (filters.search) {
    const search = bind(`%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(name ILIKE ${search} OR sku ILIKE ${search})`);
  }
  if (filters.before && filters.beforeId)
    where.push(`(created_at,id)<(${bind(filters.before)}::timestamptz,${bind(filters.beforeId)})`);
  const result = await tenantQueryFor(accountId)<MovementRow>(
    `SELECT *, to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at FROM stock_movements WHERE ${where.join(' AND ')} ORDER BY stock_movements.created_at DESC,id DESC LIMIT 101`,
    params,
  );
  const rows = result.slice(0, 100).map((row) => ({
    id: row.id,
    partId: row.part_id,
    name: row.name,
    sku: row.sku || '',
    source: row.source,
    reference: row.reference || '',
    referenceId: row.reference_id || '',
    quantity: row.quantity,
    before: row.stock_before,
    after: row.stock_after,
    unitCost: money(row.unit_cost),
    createdAt: row.created_at,
  }));
  const last = rows.at(-1);
  return {
    rows,
    nextCursor: result.length > 100 && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}
