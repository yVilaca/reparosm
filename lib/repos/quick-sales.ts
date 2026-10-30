import { tenantQueryFor, tenantTransaction, type Query } from '@/lib/db';
import { money } from '@/lib/repos/rows';
import type { PaymentMethod } from '@/lib/payment-methods';
import { policy, movementContext } from '@/lib/repos/stock';

export class QuickSaleError extends Error {
  status = 409;
  code = 'INSUFFICIENT_STOCK';
}

/** Venda rápida: entrada no caixa sem OS vinculada. */
export type QuickSaleRecord = {
  id: string;
  description: string;
  /** O que entrou no caixa: preço menos desconto. */
  value: number;
  discount: number;
  cost?: number;
  quantity: number;
  partId?: string;
  method: string;
  date: string;
  items?: QuickSaleItem[];
};

export type QuickSaleItem = {
  description: string;
  price: number;
  discount: number;
  cost?: number;
  quantity: number;
  partId?: string;
};

type Row = {
  id: string;
  description: string;
  value: string;
  discount: string | null;
  cost: string | null;
  quantity: number;
  part_id: string | null;
  method: string | null;
  date: string;
};

type ItemRow = {
  description: string;
  price: string;
  discount: string;
  cost: string | null;
  quantity: number;
  part_id: string | null;
};

const DATE = `COALESCE(date, (created_at AT TIME ZONE 'America/Sao_Paulo')::date)`;

const toRecord = (row: Row): QuickSaleRecord => ({
  id: row.id,
  description: row.description,
  value: money(row.value),
  discount: row.discount === null ? 0 : money(row.discount),
  ...(row.cost === null ? {} : { cost: money(row.cost) }),
  quantity: row.quantity || 1,
  ...(row.part_id === null ? {} : { partId: row.part_id }),
  method: row.method || '',
  date: row.date,
});

const toItem = (row: ItemRow): QuickSaleItem => ({
  description: row.description,
  price: money(row.price),
  discount: money(row.discount),
  ...(row.cost === null ? {} : { cost: money(row.cost) }),
  quantity: row.quantity,
  ...(row.part_id === null ? {} : { partId: row.part_id }),
});

const itemsFor = async (accountId: string, saleId: string, run?: Query) =>
  (
    await tenantQueryFor(accountId, run)<ItemRow>(
      `SELECT description, price, discount, cost, quantity, part_id
         FROM quick_sale_items
        WHERE account_id=$1 AND sale_id=$2
        ORDER BY position`,
      [accountId, saleId],
    )
  ).map(toItem);

const summary = (items: QuickSaleItem[]) =>
  items.length === 1
    ? items[0].description
    : `${items.length} itens: ${items
        .map((item) => item.description)
        .join(', ')
        .slice(0, 180)}`;

export async function create(
  accountId: string,
  sale: {
    description?: string;
    price?: number;
    discount?: number;
    cost?: number;
    quantity?: number;
    partId?: string;
    items?: QuickSaleItem[];
    acknowledgeNegativeStock?: boolean;
    method: PaymentMethod;
  },
  date: string,
): Promise<QuickSaleRecord> {
  return tenantTransaction(accountId, async (run) => {
    const items = sale.items?.length
      ? sale.items
      : [
          {
            description: sale.description!,
            price: sale.price!,
            discount: sale.discount || 0,
            ...(sale.cost === undefined ? {} : { cost: sale.cost }),
            quantity: sale.quantity || 1,
            ...(sale.partId ? { partId: sale.partId } : {}),
          },
        ];
    const id = `payment-${crypto.randomUUID()}`;
    const allowNegative = sale.acknowledgeNegativeStock === true && (await policy(accountId, run));
    const persisted: QuickSaleItem[] = [];
    for (const item of items) {
      let partId = item.partId;
      if (!partId) {
        const matches = await run<{ id: string }>(
          `SELECT id FROM parts WHERE account_id=$1 AND (LOWER(BTRIM(name))=LOWER($2) OR LOWER(BTRIM(sku))=LOWER($2)) LIMIT 2`,
          [accountId, item.description.trim()],
        );
        if (matches.length === 1) partId = matches[0].id;
      }
      let cost = item.cost;
      if (partId) {
        await movementContext(run, 'quick-sale', id, item.description);
        const [part] = await run<{ cost: string }>(
          `UPDATE parts
              SET stock = stock - $3, updated_at = now()
            WHERE account_id = $1 AND id = $2 AND (stock >= $3 OR $4)
              AND stock::bigint - $3 >= -2147483648
            RETURNING cost`,
          [accountId, partId, item.quantity, allowNegative],
        );
        if (!part) throw new QuickSaleError('Estoque insuficiente para essa quantidade.');
        cost = money(part.cost);
      }
      persisted.push({
        ...item,
        discount: item.discount || 0,
        ...(cost === undefined ? {} : { cost }),
        ...(partId ? { partId } : {}),
      });
    }
    const value =
      persisted.reduce(
        (total, item) =>
          total + Math.round(item.price * 100) * item.quantity - Math.round(item.discount * 100),
        0,
      ) / 100;
    const discount = persisted.reduce((total, item) => total + item.discount, 0);
    const cost = persisted.every((item) => item.cost !== undefined)
      ? persisted.reduce((total, item) => total + item.cost! * item.quantity, 0)
      : undefined;
    const quantity = persisted.reduce((total, item) => total + item.quantity, 0);
    const [row] = await run<Row>(
      `INSERT INTO cash_entries
         (id, account_id, kind, description, value, method, date, cost, discount, quantity, part_id)
       VALUES ($1, $2, 'in', $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, description, value, discount, cost, quantity, part_id, method, date::text AS date`,
      [
        id,
        accountId,
        summary(persisted),
        value,
        sale.method,
        date,
        cost ?? null,
        discount || null,
        quantity,
        persisted.length === 1 ? (persisted[0].partId ?? null) : null,
      ],
    );
    for (const [position, item] of persisted.entries())
      await run(
        `INSERT INTO quick_sale_items
           (account_id,sale_id,position,description,price,discount,cost,quantity,part_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          accountId,
          id,
          position,
          item.description,
          item.price,
          item.discount,
          item.cost ?? null,
          item.quantity,
          item.partId ?? null,
        ],
      );
    return { ...toRecord(row), items: persisted };
  });
}

/** Vendas rápidas desde `from` (data de competência), da mais recente para a mais antiga. */
export async function since(accountId: string, from: string): Promise<QuickSaleRecord[]> {
  const rows = await tenantQueryFor(accountId)<Row>(
    `SELECT id, description, value, discount, cost, quantity, part_id, method, ${DATE}::text AS date
     FROM cash_entries
     WHERE account_id = $1 AND kind = 'in' AND order_id IS NULL AND ${DATE} >= $2::date
     ORDER BY ${DATE} DESC, created_at DESC, id DESC`,
    [accountId, from],
  );
  return rows.map(toRecord);
}

/** Uma venda rápida com a hora do registro (horário de Brasília), para o comprovante. */
export async function get(accountId: string, id: string) {
  const [row] = await tenantQueryFor(accountId)<Row & { issued_at: string }>(
    `SELECT id, description, value, discount, cost, quantity, part_id, method, ${DATE}::text AS date,
            to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS issued_at
     FROM cash_entries
     WHERE account_id = $1 AND id = $2 AND kind = 'in' AND order_id IS NULL`,
    [accountId, id],
  );
  return row
    ? { ...toRecord(row), items: await itemsFor(accountId, id), issuedAt: row.issued_at }
    : undefined;
}

export async function remove(accountId: string, id: string, run?: Query) {
  const work = async (execute: Query) => {
    const [sale] = await execute<{
      part_id: string | null;
      order_id: string | null;
      quantity: number;
      description: string;
    }>(
      `SELECT part_id, order_id, quantity, description
         FROM cash_entries
        WHERE account_id = $1 AND id = $2 AND kind = 'in'
        FOR UPDATE`,
      [accountId, id],
    );
    if (!sale || sale.order_id) return false;
    const items = await itemsFor(accountId, id, execute);
    if (items.length) {
      for (const item of items) {
        if (!item.partId) continue;
        await movementContext(execute, 'sale-reversal', id, item.description);
        await execute(
          `UPDATE parts SET stock = stock + $3, updated_at = now()
            WHERE account_id = $1 AND id = $2`,
          [accountId, item.partId, item.quantity],
        );
      }
    } else if (sale.part_id) {
      await movementContext(execute, 'sale-reversal', id, sale.description);
      await execute(
        `UPDATE parts SET stock = stock + $3, updated_at = now()
          WHERE account_id = $1 AND id = $2`,
        [accountId, sale.part_id, sale.quantity || 1],
      );
    }
    const deleted = await execute<{ id: string }>(
      'DELETE FROM cash_entries WHERE account_id = $1 AND id = $2 RETURNING id',
      [accountId, id],
    );
    return deleted.length > 0;
  };
  return run ? work(run) : tenantTransaction(accountId, work);
}
