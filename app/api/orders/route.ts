import { currentAccount, sameOrigin } from '@/lib/auth';
import { saveOrder } from '@/lib/orders';
import { OrderItemError } from '@/lib/repos/order-items';
import { orders } from '@/lib/repos';
import { resourceRoute } from '@/lib/resource-route';
import type { DataObject, Order } from '@/lib/types';
import { validateRecord } from '@/lib/validation';

const base = resourceRoute('order');

export const { GET } = base;

export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
  if (!id.startsWith('order-')) return Response.json({ error: 'Acesso negado' }, { status: 403 });

  // order_photos rows (and their bytes) cascade-delete with the order (FK ON DELETE CASCADE).
  if (!(await orders.remove(account.id, id)))
    return Response.json({ error: 'Acesso negado' }, { status: 403 });
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  const data = (body as DataObject).data;
  const validation = validateRecord('order', data);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });
  const id = (body as DataObject).id;
  if (typeof id !== 'undefined' && typeof id !== 'string')
    return Response.json({ error: 'Identificador inválido' }, { status: 400 });
  const orderId = id || `order-${crypto.randomUUID()}`;
  if (!orderId.startsWith('order-'))
    return Response.json({ error: 'Identificador inválido para este cadastro' }, { status: 400 });
  let result;
  try {
    result = await saveOrder(account.id, orderId, validation.data as Order);
  } catch (error) {
    if (error instanceof OrderItemError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.code ? 409 : 400 },
      );
    throw error;
  }
  return result
    ? Response.json(result, { status: 201 })
    : Response.json({ error: 'Acesso negado' }, { status: 403 });
}
