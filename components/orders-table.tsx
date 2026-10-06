'use client';

import Link from 'next/link';
import { Eye } from 'lucide-react';
import { type Dispatch, type SetStateAction } from 'react';
import OrderActions from '@/components/order-actions';
import OrderPaymentStatus from '@/components/order-payment-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { toneChip } from '@/components/ui/tone';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/format';
import { badgeFor, isNotablePriority, orderPriorityTone, orderStageTone } from '@/lib/status-tones';
import type { Order, OrderStage } from '@/lib/types';

type OrderRow = Order & { id: string };
// Cores com significado fixo: veja lib/status-tones.ts.
export const orderStageVariant = (stage: string | undefined) => badgeFor(orderStageTone(stage));
export const orderPriorityVariant = (priority: string | undefined) =>
  badgeFor(orderPriorityTone(priority));

/** Só a prioridade que foge do normal vira etiqueta. */
function PriorityBadge({ priority }: { priority?: string }) {
  return isNotablePriority(priority) ? (
    <Badge variant={orderPriorityVariant(priority)}>{priority}</Badge>
  ) : null;
}

export default function OrdersTable({
  orders,
  emptyMessage,
  onCreate,
  onEdit,
  onView,
  onCharge,
  onRemoved,
  selectedIds,
  setSelectedIds,
  stages = [],
  onStageChange,
  changingStage = false,
}: {
  orders: OrderRow[];
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  emptyMessage?: string;
  onCreate?: () => void;
  onEdit?: (order: OrderRow) => void;
  onView?: (order: OrderRow) => void;
  onCharge?: (order: OrderRow) => void;
  onRemoved?: (id: string) => void;
  stages?: readonly OrderStage[];
  onStageChange?: (order: OrderRow, stage: OrderStage) => void;
  changingStage?: boolean;
}) {
  const selectedOrders = orders.filter((order) => selectedIds.has(order.id));
  const allSelected = orders.length > 0 && selectedOrders.length === orders.length;
  const stageControl = (order: OrderRow) =>
    onStageChange ? (
      <select
        aria-label={`Etapa da ordem ${order.code}`}
        className={`h-8 max-w-full rounded-md border px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-50 ${toneChip[orderStageTone(order.stage || 'Recebido')]}`}
        value={order.stage || 'Recebido'}
        disabled={changingStage}
        onChange={(event) => onStageChange(order, event.target.value as OrderStage)}
      >
        {stages.map((stage) => (
          <option key={stage} value={stage}>
            {stage}
          </option>
        ))}
      </select>
    ) : (
      <Badge variant={orderStageVariant(order.stage || 'Recebido')}>
        {order.stage || 'Recebido'}
      </Badge>
    );

  const toggleSelected = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelected) orders.forEach((order) => next.delete(order.id));
      else orders.forEach((order) => next.add(order.id));
      return next;
    });

  if (!orders.length)
    return (
      <EmptyState
        action={
          onCreate ? (
            <Button onClick={onCreate}>Nova ordem</Button>
          ) : (
            <Button asChild>
              <Link href="/">Abrir painel completo</Link>
            </Button>
          )
        }
        description={
          emptyMessage
            ? 'Tente remover os filtros ou buscar outro cliente.'
            : 'Cadastre uma ordem completa com aparelho, senha, custo e previsão.'
        }
        title={emptyMessage || 'Nenhuma ordem cadastrada'}
      />
    );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Ordens encontradas</CardTitle>
          <span className="text-sm text-muted-foreground">
            {orders.length} {orders.length === 1 ? 'ordem' : 'ordens'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-live="polite" className="text-sm text-muted-foreground">
            {selectedOrders.length
              ? `${selectedOrders.length} ${selectedOrders.length === 1 ? 'selecionada' : 'selecionadas'}`
              : 'Selecione uma ordem'}
          </span>
          <OrderActions
            selectedOrders={selectedOrders}
            setSelectedIds={setSelectedIds}
            onEdit={onEdit}
            onCharge={onCharge}
            onRemoved={onRemoved}
          />
        </div>
      </CardHeader>
      <CardContent>
        <ul aria-label="Ordens de serviço" className="grid gap-3 md:hidden">
          {orders.map((order) => (
            <li key={order.id}>
              <Card
                className={selectedIds.has(order.id) ? 'gap-3 border-primary' : 'gap-3'}
                size="sm"
              >
                <CardContent className="grid gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <Input
                        aria-label={`Selecionar ordem ${order.code}`}
                        checked={selectedIds.has(order.id)}
                        className="mt-1 size-4 shrink-0"
                        onChange={() => toggleSelected(order.id)}
                        type="checkbox"
                      />
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 font-semibold">
                          <span className="truncate">{order.code}</span>
                          <PriorityBadge priority={order.priority} />
                        </h3>
                      </div>
                    </div>
                    {stageControl(order)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {order.customer || 'Cliente não informado'}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {order.device || 'Aparelho não informado'}
                    </p>
                  </div>
                  <div className="flex items-end justify-between gap-3 border-t pt-3">
                    {onView ? (
                      <Button
                        aria-label={`Ver OS ${order.code}`}
                        onClick={() => onView(order)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Eye aria-hidden="true" />
                        Ver OS
                      </Button>
                    ) : null}
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-semibold tabular-nums">
                        {formatMoney(Number(order.total || 0))}
                      </p>
                    </div>
                  </div>
                  <OrderPaymentStatus
                    onCharge={onCharge ? () => onCharge(order) : undefined}
                    order={order}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Input
                    aria-label={
                      allSelected ? 'Desmarcar todas as ordens' : 'Selecionar todas as ordens'
                    }
                    checked={allSelected}
                    className="size-4"
                    onChange={toggleAll}
                    type="checkbox"
                  />
                </TableHead>
                <TableHead>OS</TableHead>
                <TableHead>Cliente e aparelho</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Custo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow
                  aria-selected={selectedIds.has(order.id)}
                  data-state={selectedIds.has(order.id) ? 'selected' : undefined}
                  key={order.id}
                >
                  <TableCell>
                    <Input
                      aria-label={`Selecionar ordem ${order.code}`}
                      checked={selectedIds.has(order.id)}
                      className="size-4"
                      onChange={() => toggleSelected(order.id)}
                      type="checkbox"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="grid justify-items-start gap-2">
                      <div className="flex items-center gap-2 font-medium">
                        {order.code}
                        <PriorityBadge priority={order.priority} />
                      </div>
                      {onView ? (
                        <Button
                          aria-label={`Ver OS ${order.code}`}
                          onClick={() => onView(order)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Eye aria-hidden="true" />
                          Ver OS
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{order.customer || '—'}</p>
                    <p className="text-xs text-muted-foreground">{order.device || '—'}</p>
                  </TableCell>
                  <TableCell>{stageControl(order)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(Number(order.total || 0))}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const payment = paymentBadge(order);
                      // Sem valor não há o que cobrar: um traço basta.
                      return payment ? (
                        <Badge variant={payment.variant}>{payment.label}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {formatMoney(Number(order.cost || 0))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  function paymentBadge(order: OrderRow) {
    const total = Number(order.total || 0);
    if (total <= 0) return null;
    if (!order.payment) return { label: 'Pendente', variant: 'warning' as const };
    const value = Number(order.payment.value || 0);
    if (value < total) return { label: 'Parcial', variant: 'warning' as const };
    return { label: value > total ? 'Acima' : 'Recebido', variant: 'success' as const };
  }
}
