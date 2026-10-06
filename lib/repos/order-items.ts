import { tenantQueryFor, tenantTransaction, type Query } from '@/lib/db';
import { money } from '@/lib/repos/rows';
import type { OrderItem } from '@/lib/types';
import { policy, movementContext } from '@/lib/repos/stock';

type OrderItemRow = {
  part_id: string;
  name: string;
  quantity: number;
  unit_price: string;
  unit_cost: string;
};

export class OrderItemError extends Error {
  constructor(
    message: string,
    public code?: 'INSUFFICIENT_STOCK',
  ) {
    super(message);
  }
}

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
  stockMode: 'keep' | 'cancel' | 'reopen' = 'keep',
  acknowledgeNegativeStock = false,
) {
  const work = async (execute: Query) => {
    const [order] = await execute<{ code: string }>(
      'SELECT code FROM orders WHERE account_id = $1 AND id = $2 FOR UPDATE',
      [accountId, orderId],
    );
    const previous = await execute<OrderItemRow & { stock_quantity: number }>(
      'SELECT part_id, name, quantity, unit_price, unit_cost, stock_quantity FROM order_items WHERE account_id = $1 AND order_id = $2',
      [accountId, orderId],
    );
    const oldItems = new Map(previous.map((item) => [item.part_id, item]));
    const quantities = new Map<string, number>();
    for (const item of items) {
      if (quantities.has(item.partId))
        throw new OrderItemError('Um produto foi selecionado mais de uma vez.');
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 2147483647)
        throw new OrderItemError(
          'A quantidade de cada produto deve ser maior que zero e caber no estoque.',
        );
      quantities.set(item.partId, item.quantity);
    }
    const ids = [...new Set([...oldItems.keys(), ...quantities.keys()])].sort();
    const parts = ids.length
      ? await execute<{ id: string; name: string; price: string; cost: string }>(
          'SELECT id, name, price, cost FROM parts WHERE account_id = $1 AND id = ANY($2::text[]) ORDER BY id FOR UPDATE',
          [accountId, ids],
        )
      : [];
    const catalog = new Map(parts.map((part) => [part.id, part]));
    const allowNegative = acknowledgeNegativeStock && (await policy(accountId, execute));
    let total = 0,
      cost = 0;
    // Todas as baixas e devoluções seguem a mesma ordem de locks, inclusive ao trocar produtos.
    for (const id of ids) {
      const old = oldItems.get(id);
      const quantity = quantities.get(id) || 0;
      const part = catalog.get(id);
      if (!part) throw new OrderItemError('Um dos produtos selecionados não está disponível.');
      // ponytail: itens legados não tiveram baixa. Só movimentamos novas unidades;
      // uma reconciliação física deve preceder qualquer ajuste retroativo do estoque.
      const stockQuantity =
        !quantity || stockMode === 'cancel'
          ? 0
          : stockMode === 'reopen'
            ? quantity
            : old
              ? Math.max(0, old.stock_quantity + quantity - old.quantity)
              : quantity;
      const delta = stockQuantity - (old?.stock_quantity || 0);
      if (delta) {
        await movementContext(
          execute,
          delta > 0 ? 'order' : 'order-return',
          orderId,
          order?.code || orderId,
        );
        const updated = await execute<{ id: string }>(
          `UPDATE parts SET stock = stock - $3, updated_at = now()
           WHERE account_id = $1 AND id = $2 AND ($3 <= 0 OR stock >= $3 OR $4)
             AND stock::bigint - $3 BETWEEN -2147483648 AND 2147483647 RETURNING id`,
          [accountId, id, delta, allowNegative],
        );
        if (!updated.length)
          throw new OrderItemError(`Estoque insuficiente para ${part.name}.`, 'INSUFFICIENT_STOCK');
      }
      if (!quantity) continue;
      const name = old?.name || part.name;
      const unitPrice = money(old?.unit_price ?? part.price);
      const unitCost = money(old?.unit_cost ?? part.cost);
      await execute(
        `INSERT INTO order_items (id, account_id, order_id, part_id, name, quantity, unit_price, unit_cost, stock_quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (account_id, order_id, part_id) DO UPDATE
         SET quantity = EXCLUDED.quantity, stock_quantity = EXCLUDED.stock_quantity`,
        [
          `order-item-${crypto.randomUUID()}`,
          accountId,
          orderId,
          id,
          name,
          quantity,
          unitPrice,
          unitCost,
          stockQuantity,
        ],
      );
      total += quantity * Math.round(unitPrice * 100);
      cost += quantity * Math.round(unitCost * 100);
    }
    await execute(
      'DELETE FROM order_items WHERE account_id = $1 AND order_id = $2 AND NOT (part_id = ANY($3::text[]))',
      [accountId, orderId, [...quantities.keys()]],
    );
    return { total: total / 100, cost: cost / 100 };
  };
  return run ? work(run) : tenantTransaction(accountId, work);
}
