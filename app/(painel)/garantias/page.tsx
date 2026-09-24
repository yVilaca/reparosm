import WarrantiesRoute from '@/components/warranties-route';
import { orders } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function WarrantiesPage() {
  const account = await requireServerAccount();
  const records = await orders.list(account.id);
  return <WarrantiesRoute orders={records.map((record) => ({ id: record.id, ...record.data }))} />;
}
