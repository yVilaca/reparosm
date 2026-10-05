import { currentAccount, sameOrigin } from '@/lib/auth';
import { tenantTransaction } from '@/lib/db';
import * as quickSales from '@/lib/repos/quick-sales';
import { resourceRoute } from '@/lib/resource-route';

const payments = resourceRoute('payment');

export const { GET, POST } = payments;

export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const removed = await tenantTransaction(account.id, (run) =>
      quickSales.remove(account.id, id, run),
    );
    if (removed) return Response.json({ ok: true });
  }
  return payments.DELETE(request);
}
