import { notFound } from 'next/navigation';
import PrintOrderButton from '@/components/print-order-button';
import SaleReceipt from '@/components/sale-receipt';
import { shops } from '@/lib/repos';
import * as quickSales from '@/lib/repos/quick-sales';
import { requireServerAccount } from '@/lib/server-auth';

export default async function SaleReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, account] = await Promise.all([params, requireServerAccount()]);
  const [sale, shop] = await Promise.all([
    quickSales.get(account.id, id),
    shops.get(account.id, 'shop-main'),
  ]);
  if (!sale) notFound();
  return (
    <div className="grid gap-4">
      <div className="mx-auto grid max-w-sm gap-3 text-center print:hidden">
        <p className="text-sm text-muted-foreground">
          Escolha a impressora térmica (58 ou 80 mm) ou salve em PDF. Este comprovante não tem valor
          fiscal.
        </p>
        <div className="flex justify-center">
          <PrintOrderButton />
        </div>
      </div>
      <SaleReceipt sale={sale} shop={shop?.data} />
    </div>
  );
}
