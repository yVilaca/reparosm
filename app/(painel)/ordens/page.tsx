import OrdersRoute from '@/components/orders-route';
import { orders, shops } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';
import { warrantyDaysFromSetting } from '@/lib/warranty';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string | string[]; view?: string | string[] }>;
}) {
  const account = await requireServerAccount();
  const params = await searchParams;
  const initialQuery = Array.isArray(params.busca) ? params.busca[0] || '' : params.busca || '';
  const initialView =
    (Array.isArray(params.view) ? params.view[0] : params.view) === 'kanban' ? 'kanban' : 'grid';
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
      initialView={initialView}
    />
  );
}
