import { currentAccount } from '@/lib/auth';
import { history, type CashPeriod } from '@/lib/repos/cash';

const periods = new Set<CashPeriod>(['today', 'month', 'previous-month']);

export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const value = new URL(request.url).searchParams.get('period') || 'today';
  if (!periods.has(value as CashPeriod))
    return Response.json({ error: 'Período inválido' }, { status: 400 });
  return Response.json({ rows: await history(account.id, value as CashPeriod) });
}
