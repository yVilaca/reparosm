import ReceivePayRoute from '@/components/receive-pay-route';
import * as payables from '@/lib/repos/payables';
import * as receivableOrders from '@/lib/repos/receivable-orders';
import { requireServerAccount } from '@/lib/server-auth';
import { isCashDateRange } from '@/lib/finance';
import { todayInSaoPaulo } from '@/lib/warranty';

const views = { receber: 'receive', pagar: 'pay' } as const;
const single = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

export default async function ReceivePayPage({
  searchParams,
}: {
  searchParams: Promise<{
    ver?: string | string[];
    pagar?: string | string[];
    from?: string;
    to?: string;
    historico?: string;
  }>;
}) {
  const account = await requireServerAccount();
  const params = await searchParams;
  const today = todayInSaoPaulo();
  const requested = { from: params.from || '', to: params.to || '' };
  const range = isCashDateRange(requested)
    ? requested
    : { from: receivableOrders.historyStart(today), to: today };
  const since = range.from;
  const [orders, receipts, bills] = await Promise.all([
    receivableOrders.open(account.id),
    receivableOrders.received(account.id, since, range.to),
    payables.list(account.id),
  ]);
  const ver = single(params.ver);
  return (
    <ReceivePayRoute
      historySince={since}
      historyUntil={range.to}
      showHistory={params.historico === '1'}
      initialOrders={orders}
      initialPayables={bills}
      initialReceipts={receipts}
      payId={single(params.pagar)}
      view={ver && ver in views ? views[ver as keyof typeof views] : undefined}
    />
  );
}
