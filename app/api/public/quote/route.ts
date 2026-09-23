import { transaction } from '@/lib/db';
import { orderFromQuote } from '@/lib/orders';
import { publicRecord } from '@/lib/public-data';
import { getAccount } from '@/lib/repos/accounts';
import { clients, orders, quotes } from '@/lib/repos';
import type { DataObject } from '@/lib/types';

const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  const found = id ? await quotes.findPublic(id) : null;
  return found
    ? Response.json({ record: publicRecord(found.record) })
    : Response.json({ record: null }, { status: 404 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Orçamento inválido' }, { status: 400 });
  }
  if (
    !isObject(body) ||
    typeof body.id !== 'string' ||
    (body.status !== 'Aprovado' && body.status !== 'Recusado')
  )
    return Response.json({ error: 'Orçamento inválido' }, { status: 400 });
  const quoteId = body.id;
  const status = body.status;

  // The row lock makes a second, concurrent answer wait and then see the first one.
  const outcome = await transaction(async (run) => {
    const found = await quotes.findPublic(quoteId, run, true);
    if (!found) return { error: 'Orçamento inválido', status: 400 };
    const { accountId, record } = found;
    const quote = record.data;
    const account = await getAccount(accountId, run);
    if (account?.status !== 'active') return { error: 'Assistência indisponível', status: 403 };
    if (quote.status === 'Aprovado' || quote.status === 'Recusado')
      return { error: 'Este orçamento já foi respondido.', status: 409 };
    if (quote.validUntil && quote.validUntil < new Date().toISOString().slice(0, 10))
      return { error: 'Orçamento vencido. Solicite uma atualização.', status: 410 };

    let orderId = quote.orderId;
    let clientId: string | null = null;
    if (status === 'Aprovado') {
      orderId = orderId || `order-from-${record.id}`;
      const order = orderFromQuote(quote, record.id, accountId, new Date().toISOString());
      await orders.save(accountId, orderId, order, run);
      clientId = await clients.upsertFromOrder(accountId, order, run);
      await orders.linkClient(orderId, clientId, run);
    }
    await quotes.answer(record.id, status, clientId, run);
    return { orderId };
  });

  if ('error' in outcome)
    return Response.json({ error: outcome.error }, { status: outcome.status });
  return Response.json({ ok: true, status, orderId: outcome.orderId });
}
