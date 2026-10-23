import { formatMoney } from '@/lib/format';
import type { QuickSaleRecord } from '@/lib/repos/quick-sales';
import type { Shop } from '@/lib/types';

type ReceiptProps = { sale: QuickSaleRecord & { issuedAt: string }; shop?: Shop };

/** Preço cheio: o que entrou no caixa mais o desconto (unitário × quantidade). */
const amounts = ({ sale, shop }: ReceiptProps) => {
  const quantity = sale.quantity || 1;
  const subtotal = (Math.round(sale.value * 100) + Math.round(sale.discount * 100)) / 100;
  return {
    quantity,
    subtotal,
    unit: subtotal / quantity,
    name: shop?.name || shop?.legalName || 'Assistência técnica',
    contact: [shop?.phone, shop?.email].filter(Boolean).join(' · '),
  };
};

/**
 * Comprovante de venda rápida no estilo da bobina do DANFE NFC-e, para impressora
 * térmica (58/80 mm) ou qualquer papel. Não é cupom fiscal: sem número, chave nem
 * QR Code da SEFAZ, porque nada é transmitido.
 */
export default function SaleReceipt(props: ReceiptProps) {
  const { sale, shop } = props;
  const { quantity, subtotal, unit, name, contact } = amounts(props);
  return (
    <article aria-label="Comprovante de venda" className="sale-receipt">
      <header>
        <h1>Comprovante de venda</h1>
        <p>Não é documento fiscal</p>
      </header>

      <section className="sale-receipt-section">
        <p className="sale-receipt-strong">{name}</p>
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
            {quantity.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} X {formatMoney(unit)}
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

/** O mesmo comprovante em folha A4 (ou PDF), para quem não tem impressora térmica. */
export function SaleReceiptA4(props: ReceiptProps) {
  const { sale, shop } = props;
  const { quantity, subtotal, unit, name, contact } = amounts(props);
  return (
    <article
      aria-label="Comprovante de venda"
      className="mx-auto w-full max-w-3xl rounded-xl bg-white p-6 text-sm text-neutral-900 shadow-sm ring-1 ring-black/10 sm:p-10 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-200 pb-6">
        <div className="flex min-w-0 items-start gap-4">
          {shop?.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- documento para impressão
            <img alt="" className="max-h-16 max-w-40 object-contain object-left" src={shop.logo} />
          )}
          <div className="min-w-0 text-neutral-600">
            <h1 className="text-xl font-semibold text-neutral-900">{name}</h1>
            {shop?.legalName && shop.legalName !== shop.name && <p>{shop.legalName}</p>}
            {shop?.document && <p>Documento: {shop.document}</p>}
            {shop?.address && <p>{shop.address}</p>}
            {contact && <p>{contact}</p>}
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold tracking-widest text-neutral-500 uppercase">
            Comprovante de venda
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{sale.issuedAt}</p>
          <p className="mt-2 inline-block rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
            Sem valor fiscal
          </p>
        </div>
      </header>

      <table className="mt-6 w-full">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
            <th className="py-2 pr-3 font-medium" scope="col">
              Descrição
            </th>
            <th className="px-3 py-2 text-right font-medium" scope="col">
              Qtd.
            </th>
            <th className="px-3 py-2 text-right font-medium" scope="col">
              Unitário
            </th>
            <th className="py-2 pl-3 text-right font-medium" scope="col">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-neutral-200 align-top">
            <td className="py-3 pr-3 font-medium break-words">{sale.description}</td>
            <td className="px-3 py-3 text-right tabular-nums">{quantity}</td>
            <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
              {formatMoney(unit)}
            </td>
            <td className="py-3 pl-3 text-right whitespace-nowrap tabular-nums">
              {formatMoney(subtotal)}
            </td>
          </tr>
        </tbody>
      </table>

      <dl className="mt-6 ml-auto grid w-full max-w-xs gap-2">
        {sale.discount > 0 && (
          <>
            <div className="flex justify-between gap-4 text-neutral-600">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4 text-neutral-600">
              <dt>Desconto</dt>
              <dd className="tabular-nums">−{formatMoney(sale.discount)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between gap-4 border-t border-neutral-200 pt-3 text-base font-semibold">
          <dt>Total pago</dt>
          <dd className="tabular-nums">{formatMoney(sale.value)}</dd>
        </div>
        <div className="flex justify-between gap-4 text-neutral-600">
          <dt>Forma de pagamento</dt>
          <dd className="text-right">{sale.method}</dd>
        </div>
      </dl>

      {shop?.footer && <p className="mt-10 whitespace-pre-line text-neutral-600">{shop.footer}</p>}
      <p className="mt-10 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-500">
        Documento sem valor fiscal. Nada foi transmitido à SEFAZ.
      </p>
    </article>
  );
}
