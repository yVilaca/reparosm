import WarrantiesRoute from '@/components/warranties-route';
import { orders, shops } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';
import { warrantyDaysFromSetting } from '@/lib/warranty';

export default async function WarrantiesPage() {
  const account = await requireServerAccount();
  const [records, shop] = await Promise.all([
    orders.list(account.id),
    shops.get(account.id, 'shop-main'),
  ]);
  return (
    <WarrantiesRoute
      orders={records.map((record) => ({ id: record.id, ...record.data }))}
      defaultWarrantyDays={warrantyDaysFromSetting(shop?.data.warranty)}
    />
  );
}
