import { publicQuoteTransaction, setTenantContext } from '@/lib/db';
import { orderFromQuote } from '@/lib/orders';
import { publicRecord } from '@/lib/public-data';
import { getAccountStatus } from '@/lib/repos/accounts';
import { clients, orders, quotes } from '@/lib/repos';
import type { DataObject } from '@/lib/types';

const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

class QuoteOrderConflict extends Error {}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  const found = id?.trim()
    ? await publicQuoteTransaction(id, (run) => quotes.findPublic(id, run))
    : null;
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
    !body.id.trim() ||
    (body.status !== 'Aprovado' && body.status !== 'Recusado')
  )
    return Response.json({ error: 'Orçamento inválido' }, { status: 400 });
  const quoteId = body.id;
  const status = body.status;

  // Find the owner through the bearer capability, then lock after narrowing to that tenant.
  let outcome;
  try {
    outcome = await publicQuoteTransaction(quoteId, async (run) => {
      const visible = await quotes.findPublic(quoteId, run);
      if (!visible) return { error: 'Orçamento inválido', status: 400 };
      await setTenantContext(run, visible.accountId);
      const found = await quotes.findPublic(quoteId, run, true);
      if (!found || found.accountId !== visible.accountId)
        return { error: 'Orçamento inválido', status: 400 };
      const { accountId, record } = found;
      const quote = record.data;
      const accountStatus = await getAccountStatus(accountId, run);
      if (accountStatus !== 'active') return { error: 'Assistência indisponível', status: 403 };
      if (quote.status === 'Aprovado' || quote.status === 'Recusado')
        return { error: 'Este orçamento já foi respondido.', status: 409 };
      if (quote.validUntil && quote.validUntil < new Date().toISOString().slice(0, 10))
        return { error: 'Orçamento vencido. Solicite uma atualização.', status: 410 };

      let orderId = quote.orderId;
      let clientId: string | null = null;
      if (status === 'Aprovado') {
        orderId = orderId || `order-from-${record.id}`;
        const code = await orders.nextCode(accountId, run);
        const order = orderFromQuote(quote, record.id, new Date().toISOString(), code);
        if (!(await orders.save(accountId, orderId, order, run))) throw new QuoteOrderConflict();
        clientId = await clients.upsertFromOrder(accountId, order, run);
        if (clientId) await orders.linkClient(accountId, orderId, clientId, run);
      }
      await quotes.answer(accountId, record.id, status, clientId, run);
      return { orderId };
    });
  } catch (error) {
    if (error instanceof QuoteOrderConflict)
      return Response.json(
        { error: 'Não foi possível criar a ordem deste orçamento.' },
        { status: 409 },
      );
    throw error;
  }

  if ('error' in outcome)
    return Response.json({ error: outcome.error }, { status: outcome.status });
  return Response.json({ ok: true, status, orderId: outcome.orderId });
}
