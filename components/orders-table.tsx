'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import OrderPaymentStatus from '@/components/order-payment-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Order } from '@/lib/types';

type OrderRow = Order & { id: string };
type OrderStageVariant = 'default' | 'success' | 'warning' | 'secondary';
type OrderPriorityVariant = 'destructive' | 'warning' | 'secondary';

export function orderStageVariant(stage: string | undefined): OrderStageVariant {
  if (stage === 'Retirada') return 'success';
  if (stage === 'Aguardando aprovação' || stage === 'Teste final') return 'warning';
  if (stage === 'Recebido' || stage === 'Em reparo') return 'default';
  return 'secondary';
}

export function orderPriorityVariant(priority: string | undefined): OrderPriorityVariant {
  if (priority === 'Urgente') return 'destructive';
  if (priority === 'Garantia') return 'warning';
  return 'secondary';
}

export default function OrdersTable({
  orders,
  emptyMessage,
  onCreate,
  onEdit,
  onCharge,
  onRemoved,
}: {
  orders: OrderRow[];
  emptyMessage?: string;
  onCreate?: () => void;
  onEdit?: (order: OrderRow) => void;
  onCharge?: (order: OrderRow) => void;
  onRemoved?: (id: string) => void;
}) {
  const { notify, confirm } = useFeedback();
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectedOrders = orders.filter((order) => selectedIds.has(order.id));
  const selectedOrder = selectedOrders.length === 1 ? selectedOrders[0] : null;
  const allSelected = orders.length > 0 && selectedOrders.length === orders.length;

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
  const print = (order: OrderRow) =>
    window.open(
      `/ordens/${encodeURIComponent(order.id)}/imprimir`,
      '_blank',
      'noopener,noreferrer',
    );
  const send = (order: OrderRow) => {
    const phone = order.phone || '';
    if (!hasValidWhatsapp(phone)) {
      notify('Cadastre um WhatsApp válido nesta ordem.', 'error');
      return;
    }
    const message = `Olá, ${order.customer}! Atualização da ${order.code}: seu ${order.device} está na etapa “${order.stage || 'Recebido'}”.`;
    window.open(whatsappUrl(phone, message), '_blank', 'noopener,noreferrer');
    void fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          customer: order.customer,
          phone,
          kind: 'Atualização da OS',
          message,
          status: 'Aberto no WhatsApp',
          sentAt: new Date().toISOString(),
        },
      }),
    });
  };
  const remove = async (order: OrderRow) => {
    if (!(await confirm(`Excluir definitivamente a ordem ${order.code}?`))) return;
    setBusy(order.id);
    try {
      const response = await fetch(`/api/orders?id=${encodeURIComponent(order.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Não foi possível excluir a ordem.');
      onRemoved?.(order.id);
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(order.id);
        return next;
      });
      notify('Ordem excluída.', 'success');
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível excluir a ordem.', 'error');
    } finally {
      setBusy('');
    }
  };

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
          {bulkActions()}
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
                        <p className="text-xs text-muted-foreground">OS</p>
                        <h3 className="truncate font-semibold">{order.code}</h3>
                      </div>
                    </div>
                    <Badge variant={orderStageVariant(order.stage || 'Recebido')}>
                      {order.stage || 'Recebido'}
                    </Badge>
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
                    <div>
                      <p className="text-xs text-muted-foreground">Prioridade</p>
                      <Badge variant={orderPriorityVariant(order.priority || 'Normal')}>
                        {order.priority || 'Normal'}
                      </Badge>
                    </div>
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
                <TableHead>Cliente</TableHead>
                <TableHead>Aparelho</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Prioridade</TableHead>
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
                  <TableCell className="font-medium">{order.code}</TableCell>
                  <TableCell>{order.customer || '—'}</TableCell>
                  <TableCell>{order.device || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={orderStageVariant(order.stage || 'Recebido')}>
                      {order.stage || 'Recebido'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={orderPriorityVariant(order.priority || 'Normal')}>
                      {order.priority || 'Normal'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(Number(order.total || 0))}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const payment = paymentBadge(order);
                      return <Badge variant={payment.variant}>{payment.label}</Badge>;
                    })()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
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
    if (total <= 0) return { label: 'Sem cobrança', variant: 'secondary' as const };
    if (!order.payment) return { label: 'Pendente', variant: 'warning' as const };
    const value = Number(order.payment.value || 0);
    if (value < total) return { label: 'Parcial', variant: 'warning' as const };
    return { label: value > total ? 'Acima' : 'Recebido', variant: 'success' as const };
  }

  function bulkActions() {
    const hasSelection = selectedOrders.length > 0;
    const canCharge = Boolean(
      selectedOrder && onCharge && !selectedOrder.payment && Number(selectedOrder.total || 0) > 0,
    );

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={!hasSelection} size="sm" variant="outline">
            Ações
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuLabel>
            {selectedOrders.length === 1
              ? `Ações da ${selectedOrder?.code}`
              : `${selectedOrders.length} ordens selecionadas`}
          </DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!hasSelection}
            onSelect={() => selectedOrders.forEach((order) => print(order))}
          >
            Imprimir OS
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!hasSelection} onSelect={() => selectedOrders.forEach(send)}>
            WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!selectedOrder || !onEdit}
            onSelect={() => selectedOrder && onEdit?.(selectedOrder)}
          >
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canCharge}
            onSelect={() => selectedOrder && onCharge?.(selectedOrder)}
          >
            Registrar recebimento
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!selectedOrder || busy === selectedOrder.id}
            onSelect={() => selectedOrder && void remove(selectedOrder)}
            variant="destructive"
          >
            {selectedOrder && busy === selectedOrder.id ? 'Excluindo…' : 'Excluir'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
}
