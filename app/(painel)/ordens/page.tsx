import OrdersRoute from '@/components/orders-route';
import { orders, shops } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';
import { warrantyDaysFromSetting } from '@/lib/warranty';

export default async function OrdersPage() {
  const account = await requireServerAccount();
  const [records, shop] = await Promise.all([
    orders.list(account.id),
    shops.get(account.id, 'shop-main'),
  ]);
  const rows = records.map((record) => ({ id: record.id, ...record.data }));
  return (
    <OrdersRoute
      initialOrders={rows}
      defaultWarrantyDays={warrantyDaysFromSetting(shop?.data.warranty)}
    />
  );
}
