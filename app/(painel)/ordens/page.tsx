import OrdersRoute from '@/components/orders-route';
import { orders, shops } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';
import { warrantyDaysFromSetting } from '@/lib/warranty';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string | string[] }>;
}) {
  const account = await requireServerAccount();
  const params = await searchParams;
  const initialQuery = Array.isArray(params.busca) ? params.busca[0] || '' : params.busca || '';
  const [records, shop] = await Promise.all([
    orders.list(account.id),
    shops.get(account.id, 'shop-main'),
  ]);
  const rows = records.map((record) => ({ id: record.id, ...record.data }));
  return (
    <OrdersRoute
      initialOrders={rows}
      defaultWarrantyDays={warrantyDaysFromSetting(shop?.data.warranty)}
      initialQuery={initialQuery}
    />
  );
}
