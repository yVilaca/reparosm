'use client';

import { useLayoutEffect, useRef } from 'react';
import { formatMoney } from '@/lib/format';
import type { Order, Shop } from '@/lib/types';
import { warrantyPeriod } from '@/lib/warranty';

export default function CompactOrderPrint({
  orders,
  shop,
  issuedAt,
}: {
  orders: { id: string; data: Order }[];
  shop?: Shop;
  issuedAt: string;
}) {
  const documentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const contents = Array.from(
      documentRef.current?.querySelectorAll<HTMLElement>('.compact-content') || [],
    );
    const fit = () => {
      for (const content of contents) {
        const copy = content.parentElement;
        if (!copy) continue;
        const style = getComputedStyle(copy);
        const available =
          copy.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        if (available > 0)
          content.style.transform = `scale(${Math.min(1, available / (content.scrollHeight + 1))})`;
      }
    };
    const observer = new ResizeObserver(fit);
    contents.forEach((content) => observer.observe(content));
    window.addEventListener('beforeprint', fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener('beforeprint', fit);
    };
  }, [orders, shop, issuedAt]);

  return (
    <div className="compact-print" ref={documentRef}>
      {orders.map(({ id, data }) => (
        <div className="compact-sheet" key={id} data-order-id={id}>
          {(['Via da assistência', 'Via do cliente'] as const).map((copy, index) => {
            const warranty = warrantyPeriod(data.deliveredAt, data.warrantyDays);
            return (
              <section className="compact-copy" aria-label={`${data.code} — ${copy}`} key={copy}>
                <div className="compact-content">
                  {index === 1 && shop?.customerPrintMessage && (
                    <p className="compact-message">{shop.customerPrintMessage}</p>
                  )}
                  <header className="compact-header">
                    <div>
                      {shop?.logo && (
                        // eslint-disable-next-line @next/next/no-img-element -- documento para impressão
                        <img
                          className="compact-logo"
                          src={shop.logo}
                          alt={`Logo de ${shop.name}`}
                        />
                      )}
                      <strong>{shop?.name || shop?.legalName || 'Assistência técnica'}</strong>
                      {shop?.document && <p>{shop.document}</p>}
                      {shop?.address && <p>{shop.address}</p>}
                      <p>{[shop?.phone, shop?.email].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="compact-number">
                      <h1>{data.code}</h1>
                      <p>{copy}</p>
                      <p>
                        {new Date(issuedAt).toLocaleDateString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                        })}
                      </p>
                    </div>
                  </header>
                  <dl className="compact-fields">
                    <Field label="Cliente" value={data.customer} />
                    <Field label="Telefone" value={data.phone} />
                    <Field label="Aparelho" value={data.device} />
                    <Field label="IMEI / série" value={data.imei} />
                    <Field label="Etapa" value={data.stage || 'Recebido'} />
                    <Field label="Técnico" value={data.technician || shop?.technician} />
                  </dl>
                  <dl className="compact-details">
                    <Field label="Problema relatado" value={data.problem} />
                    <Field label="Serviço" value={data.service} />
                    {data.notes && <Field label="Observações" value={data.notes} />}
                  </dl>
                  <dl className="compact-fields compact-totals">
                    {shop?.showLaborOnPrint !== false && (
                      <Field label="Mão de obra" value={formatMoney(data.labor)} />
                    )}
                    <Field label="Peças" value={formatMoney(data.parts)} />
                    <Field label="Total" value={formatMoney(data.total)} />
                    <Field
                      label="Retirada"
                      value={data.deliveredAt ? dateOnlyLabel(data.deliveredAt) : 'Não entregue'}
                    />
                    <Field
                      label="Garantia"
                      value={
                        data.warrantyDays
                          ? `${data.warrantyDays} dias${warranty.expiresAt ? ` — até ${dateOnlyLabel(warranty.expiresAt)}` : ''}`
                          : 'Não informada'
                      }
                    />
                  </dl>
                  {shop?.terms && (
                    <p className="compact-terms">
                      <strong>Termos da assistência: </strong>
                      {shop.terms}
                    </p>
                  )}
                  <footer className="compact-signatures">
                    <div>
                      Assinatura do cliente<p>{data.customer}</p>
                    </div>
                    <div>
                      Assinatura da assistência
                      <p>{data.technician || shop?.technician || 'Responsável técnico'}</p>
                    </div>
                  </footer>
                </div>
              </section>
            );
          })}
          <div className="compact-cut" aria-label="Linha de recorte">
            <span>✂ Recorte aqui</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

function dateOnlyLabel(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
