import ReceivePayRoute from '@/components/receive-pay-route';
import * as payables from '@/lib/repos/payables';
import * as receivableOrders from '@/lib/repos/receivable-orders';
import { requireServerAccount } from '@/lib/server-auth';

const views = { receber: 'receive', pagar: 'pay' } as const;
const single = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

export default async function ReceivePayPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string | string[]; pagar?: string | string[] }>;
}) {
  const account = await requireServerAccount();
  const params = await searchParams;
  const since = receivableOrders.historyStart();
  const [orders, receipts, bills] = await Promise.all([
    receivableOrders.open(account.id),
    receivableOrders.received(account.id, since),
    payables.list(account.id),
  ]);
  const ver = single(params.ver);
  return (
    <ReceivePayRoute
      historySince={since}
      initialOrders={orders}
      initialPayables={bills}
      initialReceipts={receipts}
      payId={single(params.pagar)}
      view={ver && ver in views ? views[ver as keyof typeof views] : undefined}
    />
  );
}
