'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/ui/page-header';
import FilterPills from '@/components/ui/filter-pills';
import StatCard from '@/components/ui/stat-card';
import { Clock, HelpCircle, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { badgeFor, warrantyStatusTone } from '@/lib/status-tones';
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
type WarrantyStatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'unknown';
type WarrantyFilter = WarrantyStatusFilter | 'returns';

const warrantyBadgeVariant = (status: string) => badgeFor(warrantyStatusTone(status));

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
  const returns = orders.filter((order) => order.priority === 'Garantia').length;
  const filter: WarrantyFilter = returnsOnly ? 'returns' : statusFilter;

  return (
    <>
      <PageHeader
        title="Garantias"
        description="Acompanhe o prazo de garantia das ordens já entregues."
      />
      <section
        aria-label="Resumo de garantias"
        className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        <StatCard
          detail="Dentro do prazo"
          icon={ShieldCheck}
          label="Garantias ativas"
          tone="success"
          value={active}
        />
        <StatCard
          detail="Em até 15 dias"
          icon={Clock}
          label="Vencem em breve"
          tone="warning"
          value={expiring}
          valueTone={expiring ? 'warning' : undefined}
        />
        <StatCard
          detail="Sem data de entrega registrada"
          icon={HelpCircle}
          label="Garantia desconhecida"
          value={unknown}
        />
        <StatCard
          detail="Aparelhos que voltaram"
          icon={RotateCcw}
          label="Retornos"
          tone="danger"
          value={returns}
        />
      </section>
      <p className="mb-6 text-sm text-muted-foreground">
        Prazo padrão da loja:{' '}
        <strong className="text-foreground">{defaultWarrantyDays} dias</strong> (altere em{' '}
        <Link className="underline underline-offset-4" href="/minha-assistencia">
          Minha assistência
        </Link>
        ). Para uma OS específica, edite a ordem.
      </p>
      <section
        aria-label="Filtros de garantias"
        className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
      >
        <FilterPills<WarrantyFilter>
          label="Mostrar garantias"
          onChange={(value) => {
            setReturnsOnly(value === 'returns');
            setStatusFilter(value === 'returns' ? 'all' : value);
          }}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'active', label: 'Ativas' },
            { value: 'expiring', label: 'Vencendo' },
            { value: 'expired', label: 'Vencidas' },
            { value: 'unknown', label: 'Prazo pendente' },
            { value: 'returns', label: 'Retornos', icon: RotateCcw },
          ]}
          value={filter}
        />
        <div className="relative lg:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Buscar por OS, cliente ou aparelho"
            className="pl-8"
            id="warranty-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar OS, cliente ou aparelho"
            type="search"
            value={query}
          />
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
                        <TableHead>Cliente e aparelho</TableHead>
                        <TableHead>Serviço</TableHead>
                        <TableHead>Entrega</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.code}</TableCell>
                          <TableCell>
                            <p className="font-medium">{order.customer}</p>
                            <p className="text-xs text-muted-foreground">{order.device}</p>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {order.problem || order.service || '—'}
                          </TableCell>
                          {/* O que falta já está na etiqueta de status: aqui só um traço. */}
                          <TableCell>
                            {order.deliveredAt ? dateLabel(order.deliveredAt) : '—'}
                          </TableCell>
                          <TableCell>
                            <p>
                              {order.period.expiresAt ? dateLabel(order.period.expiresAt) : '—'}
                            </p>
                            {order.warrantyDays ? (
                              <p className="text-xs text-muted-foreground">
                                {order.warrantyDays} dias
                              </p>
                            ) : null}
                          </TableCell>
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
