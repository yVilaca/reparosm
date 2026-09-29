import { tenantTransaction } from '@/lib/db';
import * as clients from '@/lib/repos/clients';
import * as orders from '@/lib/repos/orders';
import * as shops from '@/lib/repos/shops';
import { notifyOrder } from '@/lib/whatsapp';
import { resolveDeliveredAt, warrantyDaysFromSetting } from '@/lib/warranty';
import type { Order, Quote } from '@/lib/types';

export function orderFromQuote(
  quote: Quote,
  quoteId: string,
  answeredAt: string,
  code: string,
): Order {
  const labor = Number(quote.labor || 0);
  const parts = Number(quote.parts || 0);
  const total = Number(quote.total ?? labor + parts);
  return {
    code,
    customer: quote.customer,
    phone: quote.phone,
    device: quote.device,
    problem: quote.problem,
    service: quote.service,
    notes: quote.notes,
    labor,
    parts,
    cost: 0,
    total,
    profit: total,
    stage: 'Recebido',
    status: 'Aberto',
    priority: 'Normal',
    quoteId,
    quoteCode: quote.code,
    createdAt: answeredAt,
  };
}

export async function saveOrder(accountId: string, id: string, order: Order) {
  const result = await tenantTransaction(accountId, async (run) => {
    const previous = await orders.get(accountId, id, run);
    // The display code is server-assigned and immutable: keep it on update,
    // generate the next one for the account on creation. Never trust the client.
    const code = previous ? previous.data.code : await orders.nextCode(accountId, run);
    const stage = order.stage || 'Recebido';
    // A missing/cleared warrantyDays (0, normalized away by validation) always means
    // "use the shop's current default" — it never falls back to the order's own
    // previous value, since the only way to get here is the field being cleared.
    const warrantyDays = Number.isInteger(order.warrantyDays)
      ? order.warrantyDays
      : warrantyDaysFromSetting((await shops.get(accountId, 'shop-main', run))?.data.warranty);
    const deliveredAt = resolveDeliveredAt(previous?.data.deliveredAt, previous?.data.stage, stage);
    const savedOrder = { ...order, code, stage, warrantyDays, deliveredAt };
    const record = await orders.save(accountId, id, savedOrder, run);
    if (!record) return null;
    const clientId = await clients.upsertFromOrder(accountId, savedOrder, run);
    await orders.linkClient(accountId, id, clientId, run);
    return { previous, record, client: await clients.get(accountId, clientId, run) };
  });
  if (!result) return null;

  let notification: unknown = null;
  if (!result.previous || result.previous.data.stage !== order.stage) {
    try {
      notification = await notifyOrder(
        accountId,
        id,
        result.record.data,
        result.previous ? 'status' : 'created',
      );
    } catch {
      notification = {
        status: 'failed',
        reason: 'OS salva, mas não foi possível registrar a notificação.',
      };
    }
  }
  const record = (await orders.get(accountId, id)) ?? result.record;
  return { record, client: result.client, notification };
}
