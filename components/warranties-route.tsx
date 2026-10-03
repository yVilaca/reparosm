'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
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
type WarrantyStatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'unknown';

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
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<WarrantyStatusFilter>('all');
  const [returnsOnly, setReturnsOnly] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = covered.filter((order) => {
    const matchesQuery = normalizedQuery
      ? `${order.code} ${order.customer} ${order.device} ${order.problem || order.service || ''}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      : true;
    const matchesStatus = statusFilter === 'all' || order.period.status === statusFilter;
    const matchesReturn = !returnsOnly || order.priority === 'Garantia';
    return matchesQuery && matchesStatus && matchesReturn;
  });
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
      <section aria-label="Filtros de garantias" className="mb-4 rounded-xl border bg-card p-4">
        <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)_auto] md:items-end">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium" htmlFor="warranty-search">
            Buscar
            <Input
              id="warranty-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="OS, cliente ou aparelho"
              value={query}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="warranty-status">
            Status
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              id="warranty-status"
              onChange={(event) => setStatusFilter(event.target.value as WarrantyStatusFilter)}
              value={statusFilter}
            >
              <option value="all">Todos</option>
              <option value="active">Ativas</option>
              <option value="expiring">Vencendo</option>
              <option value="expired">Vencidas</option>
              <option value="unknown">Prazo pendente</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-pressed={returnsOnly}
              onClick={() => setReturnsOnly((current) => !current)}
              type="button"
              variant={returnsOnly ? 'secondary' : 'outline'}
            >
              Só retornos
            </Button>
            <Button
              disabled={!query && statusFilter === 'all' && !returnsOnly}
              onClick={() => {
                setQuery('');
                setStatusFilter('all');
                setReturnsOnly(false);
              }}
              type="button"
              variant="ghost"
            >
              Limpar
            </Button>
          </div>
        </div>
      </section>
      {covered.length ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Ordens entregues</CardTitle>
              <span className="text-sm text-muted-foreground">
                {filtered.length} de {covered.length}
              </span>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {filtered.length ? (
              <>
                <div className="grid gap-3 md:hidden">
                  {filtered.map((order) => (
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
                <div className="hidden min-w-0 overflow-x-auto md:block">
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
                      {filtered.map((order) => (
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
              </>
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma garantia corresponde aos filtros selecionados.
              </p>
            )}
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
