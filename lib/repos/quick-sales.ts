import { tenantQueryFor, tenantTransaction, type Query } from '@/lib/db';
import { money } from '@/lib/repos/rows';
import type { PaymentMethod } from '@/lib/payment-methods';

export class QuickSaleError extends Error {
  status = 409;
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

export async function create(
  accountId: string,
  sale: {
    description: string;
    price: number;
    discount: number;
    cost?: number;
    quantity: number;
    partId?: string;
    method: PaymentMethod;
  },
  date: string,
): Promise<QuickSaleRecord> {
  return tenantTransaction(accountId, async (run) => {
    const quantity = sale.quantity;
    let cost = sale.cost;
    if (sale.partId) {
      const [part] = await run<{ cost: string }>(
        `UPDATE parts
            SET stock = stock - $3, updated_at = now()
          WHERE account_id = $1 AND id = $2 AND stock >= $3
          RETURNING cost`,
        [accountId, sale.partId, quantity],
      );
      if (!part) throw new QuickSaleError('Estoque insuficiente para essa quantidade.');
      cost = money(part.cost) * quantity;
    } else if (cost !== undefined) {
      cost *= quantity;
    }

    const value = (Math.round(sale.price * 100) * quantity - Math.round(sale.discount * 100)) / 100;
    const [row] = await run<Row>(
      `INSERT INTO cash_entries
         (id, account_id, kind, description, value, method, date, cost, discount, quantity, part_id)
       VALUES ($1, $2, 'in', $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, description, value, discount, cost, quantity, part_id, method, date::text AS date`,
      [
        `payment-${crypto.randomUUID()}`,
        accountId,
        sale.description,
        value,
        sale.method,
        date,
        cost ?? null,
        sale.discount || null,
        quantity,
        sale.partId ?? null,
      ],
    );
    return toRecord(row);
  });
}

/** Vendas rápidas desde `from` (data de competência), da mais recente para a mais antiga. */
export async function since(accountId: string, from: string): Promise<QuickSaleRecord[]> {
  const rows = await tenantQueryFor(accountId)<Row>(
    `SELECT id, description, value, discount, cost, quantity, part_id, method, ${DATE}::text AS date
     FROM cash_entries
     WHERE account_id = $1 AND kind = 'in' AND order_id IS NULL AND ${DATE} >= $2::date
     ORDER BY ${DATE} DESC, created_at DESC`,
    [accountId, from],
  );
  return rows.map(toRecord);
}

export async function remove(accountId: string, id: string, run?: Query) {
  const work = async (execute: Query) => {
    const [sale] = await execute<{
      part_id: string | null;
      order_id: string | null;
      quantity: number;
    }>(
      `SELECT part_id, order_id, quantity
         FROM cash_entries
        WHERE account_id = $1 AND id = $2 AND kind = 'in'
        FOR UPDATE`,
      [accountId, id],
    );
    if (!sale || sale.order_id) return false;
    if (sale.part_id) {
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
