import { notFound } from 'next/navigation';
import PrintOrderButton from '@/components/print-order-button';
import PrintOrderPhotos from '@/components/print-order-photos';
import { formatMoney } from '@/lib/format';
import { orders, shops } from '@/lib/repos';
import * as orderPhotos from '@/lib/repos/order-photos';
import { requireServerAccount } from '@/lib/server-auth';
import { warrantyPeriod } from '@/lib/warranty';

export default async function PrintOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, account] = await Promise.all([params, requireServerAccount()]);
  const [order, shop, photos] = await Promise.all([
    orders.get(account.id, id),
    shops.get(account.id, 'shop-main'),
    orderPhotos.list(account.id, id),
  ]);
  if (!order) notFound();

  const data = order.data;
  const warrantyDays = data.warrantyDays;
  const expiresAt = warrantyPeriod(data.deliveredAt, warrantyDays).expiresAt;

  return (
    <div className="print-order-page">
      <div className="print-order-controls no-print">
        <span>Visualização para impressão</span>
        <PrintOrderButton />
      </div>
      <article className="print-order-sheet">
        <header className="print-order-header">
          <div>
            <h1>{shop?.data.name || shop?.data.legalName || 'Assistência técnica'}</h1>
            {shop?.data.legalName && <p>{shop.data.legalName}</p>}
            {shop?.data.document && <p>Documento: {shop.data.document}</p>}
            {shop?.data.address && <p>{shop.data.address}</p>}
            <p>
              {[shop?.data.phone, shop?.data.email].filter(Boolean).join(' · ') ||
                'Dados de contato não informados'}
            </p>
          </div>
          <div className="print-order-code">
            <strong>ORDEM DE SERVIÇO</strong>
            <b>{data.code}</b>
            <span>Emitida em {dateLabel(new Date().toISOString())}</span>
          </div>
        </header>

        <section className="print-order-section">
          <h2>Cliente</h2>
          <div className="print-order-grid">
            <Field label="Nome" value={data.customer} />
            <Field label="Telefone" value={data.phone} />
          </div>
        </section>

        <section className="print-order-section">
          <h2>Aparelho e atendimento</h2>
          <div className="print-order-grid">
            <Field label="Aparelho" value={data.device} />
            <Field label="IMEI / número de série" value={data.imei} />
            <Field label="Etapa" value={data.stage || 'Recebido'} />
            <Field label="Técnico" value={data.technician || shop?.data.technician} />
          </div>
          <Field label="Problema relatado" value={data.problem} />
          <Field label="Serviço" value={data.service} />
          <Field label="Observações" value={data.notes} />
        </section>

        <section className="print-order-section">
          <h2>Valores e garantia</h2>
          <div className="print-order-grid">
            <Field label="Mão de obra" value={formatMoney(data.labor)} />
            <Field label="Peças" value={formatMoney(data.parts)} />
            <Field label="Total" value={formatMoney(data.total)} />
            <Field
              label="Data de retirada"
              value={data.deliveredAt ? dateOnlyLabel(data.deliveredAt) : 'Não entregue'}
            />
            <Field
              label="Garantia"
              value={
                warrantyDays
                  ? `${warrantyDays} dias${expiresAt ? ` · válida até ${dateOnlyLabel(expiresAt)}` : ''}`
                  : 'Não informada'
              }
            />
          </div>
        </section>

        <PrintOrderPhotos photos={photos} />

        {shop?.data.terms && (
          <section className="print-order-section">
            <h2>Termos da assistência</h2>
            <p className="print-order-terms">{shop.data.terms}</p>
          </section>
        )}

        <footer className="print-order-signatures">
          <div>
            <span />
            <b>Assinatura do cliente</b>
            <small>{data.customer}</small>
          </div>
          <div>
            <span />
            <b>Assinatura da assistência</b>
            <small>{data.technician || shop?.data.technician || 'Responsável técnico'}</small>
          </div>
        </footer>
      </article>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: unknown }) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return (
    <div className="print-order-field">
      <small>{label}</small>
      <p>{text || '—'}</p>
    </div>
  );
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(value),
  );
}

function dateOnlyLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`),
  );
}
