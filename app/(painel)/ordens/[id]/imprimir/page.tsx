import { notFound } from 'next/navigation';
import PrintOrdersDocument from '@/components/print-orders-document';
import { normalizePrintCopies, normalizePrintLayout } from '@/lib/print';
import { orders, shops } from '@/lib/repos';
import * as orderPhotos from '@/lib/repos/order-photos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function PrintOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ copies?: string | string[]; layout?: string | string[] }>;
}) {
  const queryParams =
    searchParams || Promise.resolve<{ copies?: string | string[]; layout?: string | string[] }>({});
  const [{ id }, account, query] = await Promise.all([params, requireServerAccount(), queryParams]);
  const layout = normalizePrintLayout(query.layout);
  const [order, shop, photos] = await Promise.all([
    orders.get(account.id, id),
    shops.get(account.id, 'shop-main'),
    layout === 'full' ? orderPhotos.list(account.id, id) : Promise.resolve([]),
  ]);
  if (!order) notFound();
  return (
    <PrintOrdersDocument
      orders={[{ id, data: order.data, photos }]}
      shop={shop?.data}
      layout={layout}
      copies={layout === 'compact' ? 2 : normalizePrintCopies(query.copies)}
    />
  );
}
