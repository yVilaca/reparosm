import { formatMoney } from '@/lib/format';
import type { QuickSaleRecord } from '@/lib/repos/quick-sales';
import type { Shop } from '@/lib/types';

/**
 * Comprovante de venda rápida para bobina térmica (58/80 mm) ou qualquer papel.
 * Não é cupom fiscal: nada é transmitido à SEFAZ.
 */
export default function SaleReceipt({
  sale,
  shop,
}: {
  sale: QuickSaleRecord & { issuedAt: string };
  shop?: Shop;
}) {
  const quantity = sale.quantity || 1;
  // O que entrou no caixa mais o desconto é o preço cheio (unitário × quantidade).
  const subtotal = (Math.round(sale.value * 100) + Math.round(sale.discount * 100)) / 100;
  const contact = [shop?.phone, shop?.email].filter(Boolean).join(' · ');
  return (
    <article aria-label="Comprovante de venda" className="sale-receipt">
      <header className="sale-receipt-center">
        {shop?.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- documento para impressão
          <img alt="" className="sale-receipt-logo" src={shop.logo} />
        )}
        <h1>{shop?.name || shop?.legalName || 'Assistência técnica'}</h1>
        {shop?.legalName && shop.legalName !== shop.name && <p>{shop.legalName}</p>}
        {shop?.document && <p>Documento: {shop.document}</p>}
        {shop?.address && <p>{shop.address}</p>}
        {contact && <p>{contact}</p>}
      </header>

      <section className="sale-receipt-section sale-receipt-center">
        <p className="sale-receipt-title">Comprovante de venda</p>
        <p>Não é documento fiscal</p>
        <p>{sale.issuedAt}</p>
      </section>

      <section className="sale-receipt-section">
        <p className="sale-receipt-item">{sale.description}</p>
        <div className="sale-receipt-row">
          <span>
            {quantity} × {formatMoney(subtotal / quantity)}
          </span>
          <span>{formatMoney(subtotal)}</span>
        </div>
      </section>

      <dl className="sale-receipt-section">
        {sale.discount > 0 && (
          <div className="sale-receipt-row">
            <dt>Desconto</dt>
            <dd>−{formatMoney(sale.discount)}</dd>
          </div>
        )}
        <div className="sale-receipt-row sale-receipt-total">
          <dt>Total</dt>
          <dd>{formatMoney(sale.value)}</dd>
        </div>
        <div className="sale-receipt-row">
          <dt>Pagamento</dt>
          <dd>{sale.method}</dd>
        </div>
      </dl>

      {shop?.footer && <p className="sale-receipt-section sale-receipt-footer">{shop.footer}</p>}
    </article>
  );
}
