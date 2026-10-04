import { notFound } from 'next/navigation';
import PrintOrdersDocument from '@/components/print-orders-document';
import { normalizePrintCopies, normalizePrintLayout, parsePrintOrderIds } from '@/lib/print';
import { orders, shops } from '@/lib/repos';
import * as orderPhotos from '@/lib/repos/order-photos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function PrintSelectedOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string | string[];
    copies?: string | string[];
    layout?: string | string[];
  }>;
}) {
  const [account, query] = await Promise.all([requireServerAccount(), searchParams]);
  const ids = parsePrintOrderIds(query.id);
  if (!ids) notFound();
  const layout = normalizePrintLayout(query.layout);
  const [records, shop] = await Promise.all([
    Promise.all(
      ids.map(async (id) => {
        const order = await orders.get(account.id, id);
        if (!order) notFound();
        const photos = layout === 'full' ? await orderPhotos.list(account.id, id) : [];
        return { id, data: order.data, photos };
      }),
    ),
    shops.get(account.id, 'shop-main'),
  ]);
  return (
    <PrintOrdersDocument
      orders={records}
      shop={shop?.data}
      layout={layout}
      copies={layout === 'compact' ? 2 : normalizePrintCopies(query.copies)}
    />
  );
}
