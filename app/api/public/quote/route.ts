import { getRecord, listRecords, saveRecord } from '@/lib/db';
import { clientFromOrder, findMatchingClient, orderFromQuote } from '@/lib/orders';
import { publicRecord } from '@/lib/public-data';
import type { DataObject } from '@/lib/types';

const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  const record = id ? await getRecord(id) : null;
  return record?.type === 'quote'
    ? Response.json({ record: publicRecord(record) })
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

  const record = await getRecord(body.id);
  if (!record || record.type !== 'quote')
    return Response.json({ error: 'Orçamento inválido' }, { status: 400 });

  const status = body.status;
  const quote = record.data;
  const answeredAt = new Date().toISOString();
  const owner = quote._accountId || 'account-admin';
  const account = await getRecord(owner);
  if (!account || account.type !== 'account' || account.data.status !== 'active')
    return Response.json({ error: 'Assistência indisponível' }, { status: 403 });
  if (quote.status && ['Aprovado', 'Recusado'].includes(quote.status))
    return Response.json({ error: 'Este orçamento já foi respondido.' }, { status: 409 });
  if (quote.validUntil && quote.validUntil < new Date().toISOString().slice(0, 10))
    return Response.json(
      { error: 'Orçamento vencido. Solicite uma atualização.' },
      { status: 410 },
    );

  let orderId = quote.orderId;
  if (status === 'Aprovado') {
    orderId = orderId || `order-from-${record.id}`;
    const order = orderFromQuote(quote, record.id, owner, answeredAt);
    await saveRecord(orderId, 'order', order);
    const clients = await listRecords('client');
    const existing = findMatchingClient(clients, order, owner);
    const clientId = existing?.id || `client-${crypto.randomUUID()}`;
    await saveRecord(
      clientId,
      'client',
      clientFromOrder(order, owner, orderId, existing, answeredAt),
    );
  }
  await saveRecord(record.id, 'quote', { ...quote, status, orderId, answeredAt });
  return Response.json({ ok: true, status, orderId });
}
