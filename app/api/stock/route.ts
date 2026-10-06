import { currentAccount } from '@/lib/auth';
import { availability } from '@/lib/repos/stock';

export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const ids = [...new Set((params.get('ids') || '').split(',').filter(Boolean))];
  const orderId = params.get('orderId') || undefined;
  if (
    ids.length > 100 ||
    ids.some((id) => id.length > 200 || !id.trim()) ||
    (orderId && orderId.length > 200)
  )
    return Response.json({ error: 'Produtos inválidos.' }, { status: 400 });
  return Response.json(await availability(account.id, ids, orderId), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
