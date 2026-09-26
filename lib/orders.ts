import { transaction } from '@/lib/db';
import * as clients from '@/lib/repos/clients';
import * as orders from '@/lib/repos/orders';
import { notifyOrder } from '@/lib/whatsapp';
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
  const result = await transaction(async (run) => {
    const previous = await orders.get(accountId, id, run);
    // The display code is server-assigned and immutable: keep it on update,
    // generate the next one for the account on creation. Never trust the client.
    const code = previous ? previous.data.code : await orders.nextCode(accountId, run);
    const record = await orders.save(accountId, id, { ...order, code }, run);
    if (!record) return null;
    const clientId = await clients.upsertFromOrder(accountId, order, run);
    await orders.linkClient(id, clientId, run);
    return { previous, record, client: await clients.get(accountId, clientId, run) };
  });
  if (!result) return null;

  let notification: unknown = null;
  if (!result.previous || result.previous.data.stage !== order.stage) {
    try {
      notification = await notifyOrder(
        accountId,
        id,
        order,
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
