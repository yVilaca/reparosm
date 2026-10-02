import { tenantQueryFor, tenantTransaction } from '@/lib/db';
import { dateOrNull, money, textOrNull } from '@/lib/repos/rows';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { OrderPayment } from '@/lib/types';

const UNIQUE_VIOLATION = '23505';

export async function get(accountId: string, orderId: string): Promise<OrderPayment | null> {
  const [row] = await tenantQueryFor(accountId)<{
    id: string;
    value: string;
    method: string | null;
    date: string | null;
  }>(
    `SELECT id, value, method, date::text AS date
     FROM cash_entries
     WHERE account_id = $1 AND order_id = $2 AND kind = 'in'`,
    [accountId, orderId],
  );
  return row
    ? { id: row.id, value: money(row.value), method: row.method || '', date: row.date || '' }
    : null;
}

/**
 * Registers the single income entry of an order. The value is never taken
 * from the caller: it is always the order's current total, read in the same
 * transaction.
 *
 * Returns null when the order does not belong to the account, 'no-value'
 * when it has nothing to charge, 'invalid-method' when the required payment
 * method is missing, and 'conflict' when another tab won the race.
 */
export async function create(
  accountId: string,
  orderId: string,
  input: { method?: string; date?: string },
): Promise<OrderPayment | 'conflict' | 'no-value' | 'invalid-method' | null> {
  return tenantTransaction(accountId, async (run) => {
    const [order] = await run<{ total: string }>(
      'SELECT total FROM orders WHERE account_id = $1 AND id = $2',
      [accountId, orderId],
    );
    if (!order) return null;
    const total = money(order.total);
    if (total <= 0) return 'no-value';
    const method = input.method?.trim();
    if (!method) return 'invalid-method';

    const id = `payment-${crypto.randomUUID()}`;
    const date = dateOrNull(input.date) ?? todayInSaoPaulo();
    try {
      const [row] = await run<{ id: string; value: string; method: string | null; date: string }>(
        `INSERT INTO cash_entries (id, account_id, kind, description, value, method, date, order_id)
         VALUES ($1, $2, 'in', $3, $4, $5, $6, $7)
         RETURNING id, value, method, date::text AS date`,
        [id, accountId, 'Recebimento da OS', total, textOrNull(method), date, orderId],
      );
      return { id: row.id, value: money(row.value), method: row.method || '', date: row.date };
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return 'conflict';
      throw error;
    }
  });
}
