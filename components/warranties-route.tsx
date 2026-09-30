import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Order } from '@/lib/types';
import { todayInSaoPaulo, warrantyPeriod } from '@/lib/warranty';

type OrderRow = Order & { id: string };
type WarrantyBadgeVariant = 'success' | 'warning' | 'destructive' | 'outline';

function warrantyBadgeVariant(status: string): WarrantyBadgeVariant {
  if (status === 'active') return 'success';
  if (status === 'expiring') return 'warning';
  if (status === 'expired') return 'destructive';
  return 'outline';
}

export default function WarrantiesRoute({
  orders,
  defaultWarrantyDays,
}: {
  orders: OrderRow[];
  defaultWarrantyDays: number;
}) {
  const today = todayInSaoPaulo();
  const covered = orders
    .filter(
      (order) =>
        order.stage === 'Retirada' || order.status === 'Concluído' || Boolean(order.deliveredAt),
    )
    .map((order) => ({
      ...order,
      period: warrantyPeriod(order.deliveredAt, order.warrantyDays, today),
    }));
  const active = covered.filter(
    (order) => order.period.status === 'active' || order.period.status === 'expiring',
  ).length;
  const expiring = covered.filter((order) => order.period.status === 'expiring').length;
  // Orders delivered before deliveredAt started being recorded have no valid date to
  // compute a warranty from; surfacing them separately explains why they are not
  // counted as active instead of silently under-reporting "Garantias ativas".
  const unknown = covered.filter((order) => order.period.status === 'unknown').length;
  const metrics = [
    { title: 'Garantias ativas', value: String(active), detail: 'Dentro do prazo' },
    { title: 'Vencem em breve', value: String(expiring), detail: 'Até 15 dias' },
    {
      title: 'Garantia desconhecida',
      value: String(unknown),
      detail: 'Sem data de entrega registrada',
    },
    {
      title: 'Retornos',
      value: String(orders.filter((order) => order.priority === 'Garantia').length),
      detail: 'Em atendimento',
    },
    {
      title: 'Prazo padrão',
      value: `${defaultWarrantyDays} dias`,
      detail: 'Novas ordens desta loja',
    },
  ];

  return (
    <>
      <PageHeader
        title="Garantias"
        description="Acompanhe o prazo de garantia das ordens já entregues."
        action={
          <Button asChild variant="outline">
            <Link href="/">Painel completo</Link>
          </Button>
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Prazo por OS: <Link href="/ordens">Editar ordem</Link>. Padrão da loja:{' '}
        <Link href="/minha-assistencia">Minha assistência</Link>.
      </p>
      <section
        aria-label="Resumo de garantias"
        className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        {metrics.map((metric) => (
          <Card key={metric.title} size="sm">
            <CardContent className="grid gap-1">
              <p className="text-sm text-muted-foreground">{metric.title}</p>
              {/* Value stays in a <strong> tag: tests/warranties-route.test.mjs
                  regexes for "<strong>(\d+)</strong>" right after the metric title. */}
              <p className="text-2xl font-semibold tabular-nums">
                <strong>{metric.value}</strong>
              </p>
              <p className="text-xs text-muted-foreground">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      {covered.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Ordens entregues</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:hidden">
              {covered.map((order) => (
                <article className="grid gap-2 rounded-lg border p-4" key={order.id}>
                  <div className="flex items-center justify-between gap-2">
                    <strong>{order.code}</strong>
                    <Badge variant={warrantyBadgeVariant(order.period.status)}>
                      {statusLabel(order.period.status, order.deliveredAt)}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{order.customer}</p>
                  <p className="text-sm text-muted-foreground">{order.device}</p>
                  <p className="text-sm">{order.problem || order.service || '—'}</p>
                  <div className="grid grid-cols-2 gap-2 border-t pt-2 text-sm">
                    <p>
                      Entrega: <strong>{dateLabel(order.deliveredAt)}</strong>
                    </p>
                    <p>
                      Prazo:{' '}
                      <strong>
                        {order.warrantyDays ? `${order.warrantyDays} dias` : 'Pendente'}
                      </strong>
                    </p>
                    <p className="col-span-2">
                      Vencimento: <strong>{dateLabel(order.period.expiresAt)}</strong>
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OS</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Aparelho</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {covered.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.code}</TableCell>
                      <TableCell>{order.customer}</TableCell>
                      <TableCell>{order.device}</TableCell>
                      <TableCell>{order.problem || order.service || '—'}</TableCell>
                      <TableCell>{dateLabel(order.deliveredAt)}</TableCell>
                      <TableCell>
                        {order.warrantyDays ? `${order.warrantyDays} dias` : 'Pendente'}
                      </TableCell>
                      <TableCell>{dateLabel(order.period.expiresAt)}</TableCell>
                      <TableCell>
                        <Badge variant={warrantyBadgeVariant(order.period.status)}>
                          {statusLabel(order.period.status, order.deliveredAt)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          description="Ao marcar a OS como retirada, o prazo de garantia aparecerá aqui."
          title="Nenhuma ordem entregue"
        />
      )}
    </>
  );
}

function dateLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
    : 'Pendente';
}

function statusLabel(status: string, deliveredAt?: string) {
  if (status === 'active') return 'Ativa';
  if (status === 'expiring') return 'Vencendo';
  if (status === 'expired') return 'Vencida';
  return deliveredAt ? 'Prazo pendente' : 'Data pendente';
}
