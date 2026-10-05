import { tenantQueryFor } from '@/lib/db';
import { money } from '@/lib/repos/rows';
import type { PaymentMethod } from '@/lib/payment-methods';

/** Venda rápida: entrada no caixa sem OS vinculada. */
export type QuickSaleRecord = {
  id: string;
  description: string;
  /** O que entrou no caixa: preço menos desconto. */
  value: number;
  discount: number;
  cost?: number;
  method: string;
  date: string;
};

type Row = {
  id: string;
  description: string;
  value: string;
  discount: string | null;
  cost: string | null;
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
    method: PaymentMethod;
  },
  date: string,
): Promise<QuickSaleRecord> {
  const value = (Math.round(sale.price * 100) - Math.round(sale.discount * 100)) / 100;
  const [row] = await tenantQueryFor(accountId)<Row>(
    `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date, cost, discount)
     VALUES ($1, $2, 'in', $3, $4, $5, $6, $7, $8)
     RETURNING id, description, value, discount, cost, method, date::text AS date`,
    [
      `payment-${crypto.randomUUID()}`,
      accountId,
      sale.description,
      value,
      sale.method,
      date,
      sale.cost ?? null,
      sale.discount || null,
    ],
  );
  return toRecord(row);
}

/** Vendas rápidas desde `from` (data de competência), da mais recente para a mais antiga. */
export async function since(accountId: string, from: string): Promise<QuickSaleRecord[]> {
  const rows = await tenantQueryFor(accountId)<Row>(
    `SELECT id, description, value, discount, cost, method, ${DATE}::text AS date
     FROM cash_entries
     WHERE account_id = $1 AND kind = 'in' AND order_id IS NULL AND ${DATE} >= $2::date
     ORDER BY ${DATE} DESC, created_at DESC`,
    [accountId, from],
  );
  return rows.map(toRecord);
}
