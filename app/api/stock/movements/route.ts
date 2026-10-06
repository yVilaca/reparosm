import { currentAccount } from '@/lib/auth';
import { isCashDateRange } from '@/lib/finance';
import { todayInSaoPaulo } from '@/lib/warranty';
import { movements, stockSources, type StockSource } from '@/lib/repos/stock';

export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const today = todayInSaoPaulo();
  const range = {
    from: params.get('from') || `${today.slice(0, 7)}-01`,
    to: params.get('to') || today,
  };
  const source = params.get('source') || undefined;
  const direction = params.get('direction') || undefined;
  const partId = params.get('partId') || undefined;
  const search = params.get('search')?.trim() || undefined;
  const before = params.get('before') || undefined;
  const beforeId = params.get('beforeId') || undefined;
  if (
    !isCashDateRange(range) ||
    (source && !stockSources.includes(source as StockSource)) ||
    (direction && direction !== 'in' && direction !== 'out') ||
    (partId && partId.length > 200) ||
    (search && search.length > 200) ||
    Boolean(before) !== Boolean(beforeId) ||
    (before && (!/^\d{4}-\d\d-\d\dT/.test(before) || !Number.isFinite(Date.parse(before)))) ||
    (beforeId && beforeId.length > 200)
  )
    return Response.json({ error: 'Filtros inválidos.' }, { status: 400 });
  return Response.json(
    await movements(account.id, {
      ...range,
      source: source as StockSource | undefined,
      direction: direction as 'in' | 'out' | undefined,
      partId,
      search,
      before,
      beforeId,
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
