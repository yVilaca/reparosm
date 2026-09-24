import OrdersRoute from '@/components/orders-route';
import { orders } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function OrdersPage() {
  const account = await requireServerAccount();
  const records = await orders.list(account.id);
  const rows = records.map((record) => ({ id: record.id, ...record.data }));
  return <OrdersRoute initialOrders={rows} />;
}
