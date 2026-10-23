import { formatMoney } from '@/lib/format';
import type { QuickSaleRecord } from '@/lib/repos/quick-sales';
import type { Shop } from '@/lib/types';

/**
 * Comprovante de venda rápida no estilo da bobina do DANFE NFC-e, para impressora
 * térmica (58/80 mm) ou qualquer papel. Não é cupom fiscal: sem número, chave nem
 * QR Code da SEFAZ, porque nada é transmitido.
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
      <header>
        <h1>Comprovante de venda</h1>
        <p>Não é documento fiscal</p>
      </header>

      <section className="sale-receipt-section">
        <p className="sale-receipt-strong">
          {shop?.name || shop?.legalName || 'Assistência técnica'}
        </p>
        {shop?.legalName && shop.legalName !== shop.name && <p>{shop.legalName}</p>}
        {shop?.document && <p>{shop.document}</p>}
        {shop?.address && <p>{shop.address}</p>}
        {contact && <p>{contact}</p>}
        <p>{sale.issuedAt}</p>
      </section>

      <section className="sale-receipt-section">
        <p className="sale-receipt-strong">{sale.description}</p>
        <div className="sale-receipt-row">
          <span>
            {quantity.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} X{' '}
            {formatMoney(subtotal / quantity)}
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
          <dt>{sale.method}</dt>
          <dd>{formatMoney(sale.value)}</dd>
        </div>
      </dl>

      {shop?.footer && <p className="sale-receipt-section sale-receipt-footer">{shop.footer}</p>}
    </article>
  );
}
