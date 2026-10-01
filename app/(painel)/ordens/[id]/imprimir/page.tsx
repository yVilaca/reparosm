import { notFound } from 'next/navigation';
import PrintOrderButton from '@/components/print-order-button';
import PrintOrderPhotos from '@/components/print-order-photos';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="mx-auto max-w-3xl p-4 sm:p-6 print:max-w-none print:bg-white print:p-0 print:text-black print:[--background:white] print:[--foreground:black] print:[--card:white] print:[--card-foreground:black] print:[--muted-foreground:#404040] print:[--border:#bdbdbd] print:[--ui-muted:#f5f5f5]">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <span className="text-sm text-muted-foreground">Visualização para impressão</span>
        <PrintOrderButton />
      </div>
      <Card className="print:rounded-none print:border-0 print:shadow-none print:ring-0">
        <CardContent className="grid gap-6 p-6 sm:p-8 print:p-0">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
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
            <div className="text-right">
              <strong className="text-xs tracking-wide uppercase">Ordem de serviço</strong>
              <p className="text-2xl font-semibold">{data.code}</p>
              <p className="text-xs text-muted-foreground">
                Emitida em {dateLabel(new Date().toISOString())}
              </p>
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
            <section className="break-inside-avoid">
              <h2 className="mb-2 font-semibold">Termos da assistência</h2>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{shop.data.terms}</p>
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
    </div>
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
