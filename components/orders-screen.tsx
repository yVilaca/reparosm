import OrdersRoute from '@/components/orders-route';
import { orders, parts, shops } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';
import { warrantyDaysFromSetting } from '@/lib/warranty';

export type OrdersSearchParams = {
  busca?: string | string[];
  nova?: string | string[];
  view?: string | string[];
};

export default async function OrdersScreen({
  view,
  searchParams,
}: {
  view: 'grid' | 'kanban';
  searchParams: Promise<OrdersSearchParams>;
}) {
  const [account, params] = await Promise.all([requireServerAccount(), searchParams]);
  const [records, shop, partRecords] = await Promise.all([
    orders.list(account.id),
    shops.get(account.id, 'shop-main'),
    parts.list(account.id),
  ]);
  return (
    <OrdersRoute
      initialOrders={records.map((record) => ({ id: record.id, ...record.data }))}
      initialParts={partRecords.map((record) => ({ id: record.id, ...record.data }))}
      defaultWarrantyDays={warrantyDaysFromSetting(shop?.data.warranty)}
      initialQuery={Array.isArray(params.busca) ? params.busca[0] || '' : params.busca || ''}
      view={view}
      startCreating={Boolean(params.nova)}
    />
  );
}
