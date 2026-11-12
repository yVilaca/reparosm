import { currentAccount } from '@/lib/auth';
import * as quickSales from '@/lib/repos/quick-sales';

type Context = { params: Promise<{ clientId: string }> };

/** Histórico de compras do cliente em vendas rápidas, com os itens de cada venda. */
export async function GET(request: Request, { params }: Context) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const { clientId } = await params;
  const sales = await quickSales.byClient(account.id, clientId);
  return Response.json({ sales }, { headers: { 'Cache-Control': 'no-store' } });
}
