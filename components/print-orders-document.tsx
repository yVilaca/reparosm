import PrintOrderButton from '@/components/print-order-button';
import CompactOrderPrint from '@/components/compact-order-print';
import FullOrderPrint from '@/components/full-order-print';
import type { Order, Shop } from '@/lib/types';
import type { PrintLayout } from '@/lib/print';

export default function PrintOrdersDocument({
  orders,
  shop,
  layout,
  copies,
}: {
  orders: { id: string; data: Order; photos: { id: string; contentType: string }[] }[];
  shop?: Shop;
  layout: PrintLayout;
  copies: number;
}) {
  const issuedAt = new Date().toISOString();
  return (
    <div className="mx-auto max-w-3xl print:max-w-none print:bg-white print:p-0 print:text-black print:[--background:white] print:[--foreground:black] print:[--card:white] print:[--card-foreground:black] print:[--muted-foreground:#404040] print:[--border:#bdbdbd] print:[--ui-muted:#f5f5f5]">
      <div className="mb-4 grid gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">
          {orders.length} OS ·{' '}
          {layout === 'compact'
            ? 'Impressão reduzida · folha A4 com recorte no meio'
            : `Impressão completa · ${copies} via(s) por OS`}
        </p>
        <PrintOrderButton copies={copies} layout={layout} />
        {layout === 'compact' && (
          <p className="text-xs text-muted-foreground">
            Fotos ficam na versão completa. Para textos extensos, use a versão completa para maior
            legibilidade. Imprima em A4, escala 100%, sem cabeçalhos e rodapés do navegador.
          </p>
        )}
      </div>
      {layout === 'compact' ? (
        <div className="overflow-x-auto print:overflow-visible">
          <CompactOrderPrint orders={orders} shop={shop} issuedAt={issuedAt} />
        </div>
      ) : (
        orders.map((order, index) => (
          <div className={index < orders.length - 1 ? 'print-copy-break' : ''} key={order.id}>
            <FullOrderPrint
              data={order.data}
              photos={order.photos}
              shop={shop}
              copies={copies}
              issuedAt={issuedAt}
            />
          </div>
        ))
      )}
    </div>
  );
}
