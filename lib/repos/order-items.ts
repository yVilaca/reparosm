import { tenantQueryFor, type Query } from '@/lib/db';
import { money } from '@/lib/repos/rows';
import type { OrderItem } from '@/lib/types';

type OrderItemRow = {
  part_id: string;
  name: string;
  quantity: number;
  unit_price: string;
  unit_cost: string;
};

export class OrderItemError extends Error {}

export async function list(accountId: string, orderId: string, run?: Query): Promise<OrderItem[]> {
  const rows = await tenantQueryFor(accountId, run)<OrderItemRow>(
    `SELECT part_id, name, quantity, unit_price, unit_cost
       FROM order_items
      WHERE account_id = $1 AND order_id = $2
      ORDER BY created_at, id`,
    [accountId, orderId],
  );
  return rows.map((row) => ({
    partId: row.part_id,
    name: row.name,
    quantity: row.quantity,
    unitPrice: money(row.unit_price),
    unitCost: money(row.unit_cost),
  }));
}

export async function replace(
  accountId: string,
  orderId: string,
  items: Pick<OrderItem, 'partId' | 'quantity'>[],
  run?: Query,
) {
  const execute = tenantQueryFor(accountId, run);
  await execute('DELETE FROM order_items WHERE account_id = $1 AND order_id = $2', [
    accountId,
    orderId,
  ]);

  const seen = new Set<string>();
  let total = 0;
  let cost = 0;
  for (const item of items) {
    if (seen.has(item.partId))
      throw new OrderItemError('Um produto foi selecionado mais de uma vez.');
    seen.add(item.partId);
    if (!Number.isInteger(item.quantity) || item.quantity < 1)
      throw new OrderItemError('A quantidade de cada produto deve ser maior que zero.');

    const [part] = await execute<{
      id: string;
      name: string;
      price: string;
      cost: string | null;
    }>(
      `SELECT id, name, price, cost
         FROM parts
        WHERE account_id = $1 AND id = $2`,
      [accountId, item.partId],
    );
    if (!part) throw new OrderItemError('Um dos produtos selecionados não está disponível.');
    await execute(
      `INSERT INTO order_items
         (id, account_id, order_id, part_id, name, quantity, unit_price, unit_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `order-item-${crypto.randomUUID()}`,
        accountId,
        orderId,
        part.id,
        part.name,
        item.quantity,
        money(part.price),
        money(part.cost),
      ],
    );
    total += item.quantity * money(part.price);
    cost += item.quantity * money(part.cost);
  }
  return { total, cost };
}
