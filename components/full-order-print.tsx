import PrintOrderPhotos from '@/components/print-order-photos';
import { Card, CardContent } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import type { Order, Shop } from '@/lib/types';
import { warrantyPeriod } from '@/lib/warranty';

export default function FullOrderPrint({
  data,
  shop: shopData,
  photos,
  copies,
  issuedAt,
}: {
  data: Order;
  shop?: Shop;
  photos: { id: string; contentType: string }[];
  copies: number;
  issuedAt: string;
}) {
  const shop = shopData ? { data: shopData } : undefined;
  const warrantyDays = data.warrantyDays;
  const expiresAt = warrantyPeriod(data.deliveredAt, warrantyDays).expiresAt;
  return (
    <>
      {Array.from({ length: copies }, (_, copyIndex) => (
        <Card
          className={`mb-6 print:rounded-none print:border-0 print:shadow-none print:ring-0 print:mb-0 ${copyIndex < copies - 1 ? 'print-copy-break' : ''}`}
          key={copyIndex}
        >
          <CardContent className="grid gap-6 p-6 sm:p-8 print:p-0">
            {copyIndex === 1 && shop?.data.customerPrintMessage && (
              <p className="whitespace-pre-line break-words text-sm font-medium">
                {shop.data.customerPrintMessage}
              </p>
            )}
            <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
              <div className="flex items-start gap-3">
                {shop?.data.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`Logo de ${shop.data.name || 'assistência técnica'}`}
                    className="max-h-16 max-w-40 object-contain object-left"
                    src={shop.data.logo}
                  />
                )}
                <div>
                  <h1 className="text-lg font-semibold">
                    {shop?.data.name || shop?.data.legalName || 'Assistência técnica'}
                  </h1>
                  {shop?.data.legalName && (
                    <p className="text-sm text-muted-foreground">{shop.data.legalName}</p>
                  )}
                  {shop?.data.document && (
                    <p className="text-sm text-muted-foreground">Documento: {shop.data.document}</p>
                  )}
                  {shop?.data.address && (
                    <p className="text-sm text-muted-foreground">{shop.data.address}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {[shop?.data.phone, shop?.data.email].filter(Boolean).join(' · ') ||
                      'Dados de contato não informados'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <strong className="text-xs tracking-wide uppercase">Ordem de serviço</strong>
                <p className="text-2xl font-semibold">{data.code}</p>
                <p className="text-xs text-muted-foreground">Emitida em {dateLabel(issuedAt)}</p>
              </div>
            </header>

            <section className="break-inside-avoid">
              <h2 className="mb-2 font-semibold">Cliente</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome" value={data.customer} />
                <Field label="Telefone" value={data.phone} />
              </div>
            </section>

            <section className="break-inside-avoid">
              <h2 className="mb-2 font-semibold">Aparelho e atendimento</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Aparelho" value={data.device} />
                <Field label="IMEI / número de série" value={data.imei} />
                <Field label="Etapa" value={data.stage || 'Recebido'} />
                <Field label="Técnico" value={data.technician || shop?.data.technician} />
              </div>
              <div className="mt-4 grid gap-4">
                <Field label="Problema relatado" value={data.problem} />
                <Field label="Serviço" value={data.service} />
                <Field label="Observações" value={data.notes} />
              </div>
            </section>

            <section className="break-inside-avoid">
              <h2 className="mb-2 font-semibold">Valores e garantia</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {shop?.data.showLaborOnPrint !== false && (
                  <Field label="Mão de obra" value={formatMoney(data.labor)} />
                )}
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
              <section className="break-inside-avoid">
                <h2 className="mb-2 font-semibold">Termos da assistência</h2>
                <p className="text-sm whitespace-pre-line text-muted-foreground">
                  {shop.data.terms}
                </p>
              </section>
            )}

            <footer className="mt-6 grid gap-6 border-t pt-6 sm:grid-cols-2">
              <div className="border-t pt-2 text-center">
                <p className="text-sm font-medium">Assinatura do cliente</p>
                <p className="text-xs text-muted-foreground">{data.customer}</p>
              </div>
              <div className="border-t pt-2 text-center">
                <p className="text-sm font-medium">Assinatura da assistência</p>
                <p className="text-xs text-muted-foreground">
                  {data.technician || shop?.data.technician || 'Responsável técnico'}
                </p>
              </div>
            </footer>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function Field({ label, value }: { label: string; value?: unknown }) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{text || '—'}</p>
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
