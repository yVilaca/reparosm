import { currentAccount, sameOrigin } from '@/lib/auth';
import * as orderPayments from '@/lib/repos/order-payments';

type Context = { params: Promise<{ orderId: string }> };

export async function POST(request: Request, { params }: Context) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const { orderId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  // O valor não é lido do cliente: quem manda é o total atual da OS.
  const { method, date } = (body ?? {}) as { method?: unknown; date?: unknown };

  const result = await orderPayments.create(account.id, orderId, {
    method: typeof method === 'string' ? method : undefined,
    date: typeof date === 'string' ? date : undefined,
  });
  if (result === 'conflict')
    return Response.json(
      {
        error: 'Esta ordem já tem recebimento registrado.',
        payment: await orderPayments.get(account.id, orderId),
      },
      { status: 409 },
    );
  if (result === 'no-value')
    return Response.json({ error: 'Esta ordem não tem valor a receber.' }, { status: 400 });
  if (result === 'invalid-method')
    return Response.json({ error: 'Informe a forma de pagamento.' }, { status: 400 });
  if (!result) return Response.json({ error: 'Ordem não encontrada.' }, { status: 404 });
  return Response.json({ payment: result }, { status: 201 });
}
