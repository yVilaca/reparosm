import MesaRoute from '@/components/mesa-route';
import { orders } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function MesaPage() {
  const account = await requireServerAccount();
  const records = await orders.list(account.id);
  return <MesaRoute initialOrders={records.map((record) => ({ id: record.id, ...record.data }))} />;
}
