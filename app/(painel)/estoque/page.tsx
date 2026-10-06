import StockRoute from '@/components/stock-route';
import { parts } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const account = await requireServerAccount();
  const params = await searchParams;
  const records = await parts.list(account.id);
  const initialView =
    params.view === 'kardex' ? 'kardex' : params.view === 'inventory' ? 'inventory' : 'catalog';
  return (
    <StockRoute
      accountId={account.id}
      initialParts={records.map((record) => ({ id: record.id, ...record.data }))}
      initialView={initialView}
    />
  );
}
