import { currentAccount } from '@/lib/auth';
import { history, type CashPeriod } from '@/lib/repos/cash';
import { isCashDateRange } from '@/lib/finance';

const periods = new Set<CashPeriod>(['today', 'month', 'previous-month']);

export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const value = params.get('period') || 'today';
  if (value === 'custom') {
    const range = { from: params.get('from') || '', to: params.get('to') || '' };
    if (!isCashDateRange(range))
      return Response.json({ error: 'Informe um intervalo de datas válido.' }, { status: 400 });
    return Response.json({ rows: await history(account.id, range) });
  }
  if (!periods.has(value as CashPeriod))
    return Response.json({ error: 'Período inválido' }, { status: 400 });
  return Response.json({ rows: await history(account.id, value as CashPeriod) });
}
