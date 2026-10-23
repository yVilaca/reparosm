import Link from 'next/link';
import { notFound } from 'next/navigation';
import PrintOrderButton from '@/components/print-order-button';
import SaleReceipt, { SaleReceiptA4 } from '@/components/sale-receipt';
import { Button } from '@/components/ui/button';
import { shops } from '@/lib/repos';
import * as quickSales from '@/lib/repos/quick-sales';
import { requireServerAccount } from '@/lib/server-auth';

export default async function SaleReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ layout?: string | string[] }>;
}) {
  const [{ id }, account, query] = await Promise.all([
    params,
    requireServerAccount(),
    searchParams,
  ]);
  const [sale, shop] = await Promise.all([
    quickSales.get(account.id, id),
    shops.get(account.id, 'shop-main'),
  ]);
  if (!sale) notFound();
  const a4 = query.layout === 'a4';
  const href = `/pagamentos/${encodeURIComponent(id)}/comprovante`;
  return (
    <div className="grid gap-4">
      <div className="mx-auto grid max-w-md gap-3 text-center print:hidden">
        <div aria-label="Formato do comprovante" className="flex justify-center gap-2" role="group">
          <Button asChild variant={a4 ? 'outline' : 'default'}>
            <Link aria-current={a4 ? undefined : 'page'} href={href} replace>
              Bobina térmica
            </Link>
          </Button>
          <Button asChild variant={a4 ? 'default' : 'outline'}>
            <Link aria-current={a4 ? 'page' : undefined} href={`${href}?layout=a4`} replace>
              Folha A4
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {a4
            ? 'Imprima em A4, escala 100%, sem cabeçalhos e rodapés do navegador, ou salve em PDF.'
            : 'Escolha a impressora térmica (58 ou 80 mm) ou salve em PDF.'}{' '}
          Este comprovante não tem valor fiscal.
        </p>
        <div className="flex justify-center">
          <PrintOrderButton />
        </div>
      </div>
      {a4 ? (
        <SaleReceiptA4 sale={sale} shop={shop?.data} />
      ) : (
        <SaleReceipt sale={sale} shop={shop?.data} />
      )}
    </div>
  );
}
