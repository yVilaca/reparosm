'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
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
type OrderStageVariant = 'success' | 'warning' | 'secondary';
type OrderPriorityVariant = 'destructive' | 'warning' | 'secondary';

export function orderStageVariant(stage: string | undefined): OrderStageVariant {
  if (stage === 'Retirada') return 'success';
  if (stage === 'Aguardando aprovação') return 'warning';
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
  onRemoved,
}: {
  orders: OrderRow[];
  emptyMessage?: string;
  onCreate?: () => void;
  onEdit?: (order: OrderRow) => void;
  onRemoved?: (id: string) => void;
}) {
  const { notify, confirm } = useFeedback();
  const router = useRouter();
  const [busy, setBusy] = useState('');
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
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Ordens encontradas</CardTitle>
        <span className="text-sm text-muted-foreground">
          {orders.length} {orders.length === 1 ? 'ordem' : 'ordens'}
        </span>
      </CardHeader>
      <CardContent>
        <ul aria-label="Ordens de serviço" className="grid gap-3 md:hidden">
          {orders.map((order) => (
            <li key={order.id}>
              <Card className="gap-3" size="sm">
                <CardContent className="grid gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">OS</p>
                      <h3 className="truncate font-semibold">{order.code}</h3>
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
                  <div
                    aria-label={`Ações da ordem ${order.code}`}
                    className="flex flex-wrap gap-2 border-t pt-3"
                    role="group"
                  >
                    {actions(order)}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OS</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Aparelho</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
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
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(Number(order.cost || 0))}
                  </TableCell>
                  <TableCell>
                    <div
                      aria-label={`Ações da ordem ${order.code}`}
                      className="flex justify-end gap-1"
                      role="group"
                    >
                      {actions(order)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  function actions(order: OrderRow) {
    return (
      <>
        <Button
          onClick={() =>
            window.open(
              `/ordens/${encodeURIComponent(order.id)}/imprimir`,
              '_blank',
              'noopener,noreferrer',
            )
          }
          size="sm"
          variant="outline"
        >
          Imprimir OS
        </Button>
        <Button onClick={() => send(order)} size="sm" variant="outline">
          WhatsApp
        </Button>
        {onEdit && (
          <Button onClick={() => onEdit(order)} size="sm" variant="ghost">
            Editar
          </Button>
        )}
        <Button
          disabled={busy === order.id}
          onClick={() => void remove(order)}
          size="sm"
          variant="destructive"
        >
          {busy === order.id ? 'Excluindo…' : 'Excluir'}
        </Button>
      </>
    );
  }
}
