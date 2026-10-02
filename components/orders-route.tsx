'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import OrderPaymentDialog from '@/components/order-payment-dialog';
import OrderPaymentStatus from '@/components/order-payment-status';
import OrdersTable from '@/components/orders-table';
import {
  OrderCreateModal,
  OrderEditModal,
  type OrderRow,
  type SaveOrder,
} from '@/components/order-modals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PageHeader from '@/components/ui/page-header';
import { formatMoney } from '@/lib/format';
import type { Order, OrderPayment, OrderStage } from '@/lib/types';
import { uploadOrderPhotos } from '@/lib/order-photo-upload';

type OrderView = 'grid' | 'kanban';

const orderStages: OrderStage[] = [
  'Recebido',
  'Diagnóstico',
  'Aguardando aprovação',
  'Em reparo',
  'Teste final',
  'Retirada',
];
const stages = ['Todas', ...orderStages];
const priorities = ['Todas', 'Normal', 'Urgente', 'Garantia'];

export default function OrdersRoute({
  initialOrders,
  defaultWarrantyDays = 90,
  initialQuery = '',
  initialView = 'grid',
}: {
  initialOrders: OrderRow[];
  defaultWarrantyDays?: number;
  initialQuery?: string;
  initialView?: OrderView;
}) {
  const { notify } = useFeedback();
  const [orders, setOrders] = useState(initialOrders),
    [modal, setModal] = useState<'create' | 'edit' | null>(null),
    [editing, setEditing] = useState<OrderRow | null>(null),
    [charging, setCharging] = useState<{ id: string; code: string; total: number } | null>(null),
    [query, setQuery] = useState(initialQuery),
    [stage, setStage] = useState('Todas'),
    [priority, setPriority] = useState('Todas'),
    [view, setView] = useState<OrderView>(initialView);
  const visible = orders.filter((order) => {
    const search = query.trim().toLowerCase();
    const matchesQuery =
      !search ||
      `${order.code} ${order.customer} ${order.device} ${order.phone}`
        .toLowerCase()
        .includes(search);
    const matchesStage = stage === 'Todas' || (order.stage || 'Recebido') === stage;
    const matchesPriority = priority === 'Todas' || (order.priority || 'Normal') === priority;
    return matchesQuery && matchesStage && matchesPriority;
  });
  const filtered = Boolean(query || stage !== 'Todas' || priority !== 'Todas');
  const save: SaveOrder = async (data: Order, id?: string, photos: File[] = []) => {
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Order };
        paymentDue?: { orderId: string; total: number } | null;
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar a ordem.');
      const saved = { id: result.record.id, ...result.record.data };
      if (!id && photos.length) {
        const uploaded = await uploadOrderPhotos(saved.id, photos);
        notify(
          uploaded === photos.length
            ? `OS criada com ${uploaded} foto(s) de prova.`
            : `OS criada; ${uploaded} de ${photos.length} foto(s) foram enviadas. Edite a OS para tentar novamente.`,
          uploaded === photos.length ? 'success' : 'error',
        );
      }
      if (id || !photos.length) notify(id ? 'OS atualizada.' : 'OS criada.', 'success');
      setOrders((current) =>
        id ? current.map((order) => (order.id === id ? saved : order)) : [saved, ...current],
      );
      if (result.paymentDue)
        setCharging({
          id: result.paymentDue.orderId,
          code: saved.code,
          total: result.paymentDue.total,
        });
      setEditing(null);
      setModal(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar a ordem.', 'error');
      throw error;
    }
  };
  const create = () => {
    setEditing(null);
    setModal('create');
  };
  const edit = (order: OrderRow) => {
    setEditing(order);
    setModal('edit');
  };
  const startCharging = (order: OrderRow) =>
    setCharging({ id: order.id, code: order.code, total: Number(order.total || 0) });
  const move = (order: OrderRow, direction: number) => {
    const current = orderStages.indexOf((order.stage || 'Recebido') as OrderStage);
    const next = Math.max(0, Math.min(orderStages.length - 1, current + direction));
    if (next === current) return;
    void save({ ...order, stage: orderStages[next] }, order.id);
  };
  const clearFilters = () => {
    setQuery('');
    setStage('Todas');
    setPriority('Todas');
  };

  return (
    <>
      <PageHeader
        title="Ordens de serviço"
        description="Nova OS: adicione fotos na etapa Aparelho. Garantia: Editar OS. Impressão: botão Imprimir OS."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div
              className="flex rounded-lg border p-1"
              role="group"
              aria-label="Visualização das ordens"
            >
              {(['grid', 'kanban'] as const).map((option) => (
                <Button
                  aria-pressed={view === option}
                  className="flex-1 sm:flex-none"
                  key={option}
                  onClick={() => setView(option)}
                  size="sm"
                  type="button"
                  variant={view === option ? 'default' : 'ghost'}
                >
                  {option === 'grid' ? 'Grid' : 'Kanban'}
                </Button>
              ))}
            </div>
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={create}>
              Nova ordem
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Encontre uma ordem</CardTitle>
            <CardDescription>Busque por OS, cliente ou aparelho.</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{visible.length}</span> de{' '}
              {orders.length} ordens
            </p>
            {filtered && (
              <Button onClick={clearFilters} size="sm" variant="ghost">
                Limpar filtros
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1.5fr)_minmax(12rem,1fr)_minmax(12rem,1fr)]">
          <div className="grid gap-2">
            <Label htmlFor="orders-search">Buscar</Label>
            <Input
              autoComplete="off"
              id="orders-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Número, cliente ou aparelho"
              value={query}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="orders-stage">Etapa</Label>
            <Select onValueChange={setStage} value={stage}>
              <SelectTrigger id="orders-stage">
                <SelectValue placeholder="Todas as etapas" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="orders-priority">Prioridade</Label>
            <Select onValueChange={setPriority} value={priority}>
              <SelectTrigger id="orders-priority">
                <SelectValue placeholder="Todas as prioridades" />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {view === 'grid' ? (
        <OrdersTable
          orders={visible}
          emptyMessage={
            orders.length && filtered ? 'Nenhuma ordem corresponde aos filtros.' : undefined
          }
          onCreate={create}
          onCharge={startCharging}
          onEdit={edit}
          onRemoved={(id) => setOrders((current) => current.filter((order) => order.id !== id))}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Fluxo de atendimento</CardTitle>
            <CardDescription>{visible.length} ordens nos filtros atuais.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto pb-4">
            {visible.length ? (
              <div className="flex min-w-max gap-4">
                {orderStages.map((column) => {
                  const inStage = visible.filter((order) => (order.stage || 'Recebido') === column);
                  return (
                    <section className="grid w-72 shrink-0 content-start gap-3" key={column}>
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold">{column}</h2>
                        <Badge variant="secondary">{inStage.length}</Badge>
                      </div>
                      {inStage.length ? (
                        inStage.map((order) => (
                          <article
                            className="grid gap-2 rounded-lg border bg-card p-3"
                            key={order.id}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <strong className="text-sm">{order.code}</strong>
                              <Badge variant="secondary">{order.priority || 'Normal'}</Badge>
                            </div>
                            <p className="text-sm font-medium">{order.device}</p>
                            <p className="text-sm text-muted-foreground">{order.customer}</p>
                            <OrderPaymentStatus
                              onCharge={() => startCharging(order)}
                              order={order}
                            />
                            <div className="flex items-center justify-between gap-2 border-t pt-2">
                              <Button
                                aria-label={`Voltar etapa de ${order.code}`}
                                disabled={column === orderStages[0]}
                                onClick={() => move(order, -1)}
                                size="icon"
                                title="Voltar etapa"
                                type="button"
                                variant="outline"
                              >
                                ←
                              </Button>
                              <span className="text-sm font-medium tabular-nums">
                                {formatMoney(Number(order.total || 0))}
                              </span>
                              <Button
                                aria-label={`Avançar etapa de ${order.code}`}
                                disabled={column === orderStages.at(-1)}
                                onClick={() => move(order, 1)}
                                size="icon"
                                title="Avançar etapa"
                                type="button"
                                variant="outline"
                              >
                                →
                              </Button>
                            </div>
                            <Button
                              onClick={() => edit(order)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Editar OS
                            </Button>
                          </article>
                        ))
                      ) : (
                        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                          Nenhuma ordem
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {orders.length && filtered
                  ? 'Nenhuma ordem corresponde aos filtros.'
                  : 'Nenhuma ordem cadastrada.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {modal === 'create' && (
        <OrderCreateModal
          close={() => setModal(null)}
          save={save}
          defaultWarrantyDays={defaultWarrantyDays}
        />
      )}
      {modal === 'edit' && editing && (
        <OrderEditModal item={editing} close={() => setModal(null)} save={save} />
      )}
      {charging && (
        <OrderPaymentDialog
          close={() => setCharging(null)}
          order={charging}
          saved={(payment: OrderPayment) => {
            setOrders((current) =>
              current.map((order) => (order.id === charging.id ? { ...order, payment } : order)),
            );
            setCharging(null);
          }}
        />
      )}
    </>
  );
}
