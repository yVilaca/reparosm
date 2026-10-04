'use client';

import { useState, useSyncExternalStore } from 'react';
import { useFeedback } from '@/components/feedback';
import OrderPaymentDialog from '@/components/order-payment-dialog';
import OrderPaymentStatus from '@/components/order-payment-status';
import OrdersTable from '@/components/orders-table';
import OrderActions from '@/components/order-actions';
import {
  OrderCreateModal,
  OrderEditModal,
  type PartRow,
  type OrderRow,
  type SaveOrder,
} from '@/components/order-modals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Filters, { type Filter, type FilterField } from '@/components/ui/filters';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/ui/page-header';
import Segmented from '@/components/ui/segmented';
import { toneDot } from '@/components/ui/tone';
import { Columns3, Plus, Rows3 } from 'lucide-react';
import { badgeFor, isNotablePriority, orderPriorityTone, orderStageTone } from '@/lib/status-tones';
import { formatMoney } from '@/lib/format';
import type { Order, OrderPayment, OrderStage } from '@/lib/types';
import { uploadOrderPhotos } from '@/lib/order-photo-upload';

type OrderView = 'grid' | 'kanban';

const orderViewStorageKey = 'reparosm:orders:view';
const subscribeOrderView = (onChange: () => void) => {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
};
const storedOrderView = (): OrderView => {
  try {
    return window.localStorage.getItem(orderViewStorageKey) === 'kanban' ? 'kanban' : 'grid';
  } catch {
    return 'grid';
  }
};

const orderStages: OrderStage[] = [
  'Recebido',
  'Diagnóstico',
  'Aguardando aprovação',
  'Em reparo',
  'Teste final',
  'Retirada',
];
const filterFields: FilterField[] = [
  { key: 'search', label: 'Busca' },
  { key: 'code', label: 'OS' },
  { key: 'customer', label: 'Cliente' },
  { key: 'device', label: 'Aparelho' },
  { key: 'phone', label: 'WhatsApp' },
  { key: 'stage', label: 'Etapa', options: orderStages },
  { key: 'priority', label: 'Prioridade', options: ['Normal', 'Urgente', 'Garantia'] },
];

export function matchesOrderFilters(order: OrderRow, filters: Filter[]) {
  return filters.every(({ field, value }) => {
    if (field === 'stage') return (order.stage || 'Recebido') === value;
    if (field === 'priority') return (order.priority || 'Normal') === value;
    const text =
      field === 'search'
        ? `${order.code} ${order.customer} ${order.device} ${order.phone}`
        : String(order[field as 'code' | 'customer' | 'device' | 'phone'] || '');
    return text.toLocaleLowerCase('pt-BR').includes(value.trim().toLocaleLowerCase('pt-BR'));
  });
}

export default function OrdersRoute({
  initialOrders,
  initialParts = [],
  defaultWarrantyDays = 90,
  initialQuery = '',
  initialView,
  startCreating = false,
}: {
  initialOrders: OrderRow[];
  initialParts?: PartRow[];
  defaultWarrantyDays?: number;
  initialQuery?: string;
  initialView?: OrderView;
  startCreating?: boolean;
}) {
  const { notify } = useFeedback();
  const [orders, setOrders] = useState(initialOrders),
    [modal, setModal] = useState<'create' | 'edit' | null>(startCreating ? 'create' : null),
    [editing, setEditing] = useState<OrderRow | null>(null),
    [charging, setCharging] = useState<{ id: string; code: string; total: number } | null>(null),
    [filters, setFilters] = useState<Filter[]>(
      initialQuery ? [{ field: 'search', value: initialQuery }] : [],
    ),
    [movingId, setMovingId] = useState<string | null>(null),
    [dropStage, setDropStage] = useState<OrderStage | null>(null),
    [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set()),
    [selectedView, setSelectedView] = useState<OrderView | null>(null);
  const savedView = useSyncExternalStore(
    subscribeOrderView,
    storedOrderView,
    (): OrderView => 'grid',
  );
  const view = selectedView ?? initialView ?? savedView;
  const setView = (nextView: OrderView) => {
    setSelectedView(nextView);
    try {
      window.localStorage.setItem(orderViewStorageKey, nextView);
    } catch {
      // A preferência ainda funciona nesta página quando o navegador bloqueia o storage.
    }
  };
  const visible = orders.filter((order) => matchesOrderFilters(order, filters));
  const filtered = filters.length > 0;
  const selectedOrders = visible.filter((order) => selectedIds.has(order.id));
  const allSelected = visible.length > 0 && selectedOrders.length === visible.length;
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
      visible.forEach((order) => (allSelected ? next.delete(order.id) : next.add(order.id)));
      return next;
    });
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
  const moveTo = async (order: OrderRow, nextStage: OrderStage) => {
    if (movingId || (order.stage || 'Recebido') === nextStage) return;
    setMovingId(order.id);
    try {
      await save({ ...order, stage: nextStage }, order.id);
    } catch {
      // save já informa a falha; a ordem permanece na etapa anterior.
    } finally {
      setMovingId(null);
      setDropStage(null);
    }
  };
  const move = (order: OrderRow, direction: number) => {
    const current = orderStages.indexOf((order.stage || 'Recebido') as OrderStage);
    const next = Math.max(0, Math.min(orderStages.length - 1, current + direction));
    void moveTo(order, orderStages[next]);
  };

  return (
    <>
      <PageHeader
        title="Ordens de serviço"
        description="Acompanhe e organize os atendimentos da assistência."
        action={
          <Button onClick={create}>
            <Plus aria-hidden="true" />
            Nova ordem
          </Button>
        }
      />
      <div className="mb-4 grid gap-3">
        <Segmented<OrderView>
          label="Visualização das ordens"
          onChange={setView}
          options={[
            { value: 'grid', label: 'Lista', icon: Rows3 },
            { value: 'kanban', label: 'Quadro', icon: Columns3 },
          ]}
          value={view}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Filters fields={filterFields} value={filters} onChange={setFilters} />
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {visible.length} de {orders.length} ordens
          </p>
        </div>
      </div>

      {view === 'grid' ? (
        <OrdersTable
          orders={visible}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
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
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Fluxo de atendimento</CardTitle>
              <CardDescription>{selectedOrders.length} selecionada(s)</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Input
                  className="size-4"
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={!visible.length}
                />
                Selecionar todas
              </label>
              {selectedIds.size > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                  Limpar seleção
                </Button>
              )}
              <OrderActions
                selectedOrders={selectedOrders}
                setSelectedIds={setSelectedIds}
                onEdit={edit}
                onCharge={startCharging}
                onRemoved={(id) =>
                  setOrders((current) => current.filter((order) => order.id !== id))
                }
                disabled={Boolean(movingId)}
              />
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto pb-4">
            {visible.length ? (
              <div className="flex min-w-max gap-4">
                {orderStages.map((column) => {
                  const inStage = visible.filter((order) => (order.stage || 'Recebido') === column);
                  return (
                    <section
                      className={`grid min-h-48 w-72 shrink-0 content-start gap-3 rounded-lg p-2 transition-colors ${dropStage === column ? 'bg-primary/5 ring-2 ring-primary' : ''}`}
                      key={column}
                      aria-label={`Etapa ${column}`}
                      onDragOver={(event) => {
                        if (
                          !event.dataTransfer.types.includes('application/x-reparosm-order') ||
                          movingId
                        )
                          return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDropStage(column);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                          setDropStage(null);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDropStage(null);
                        const id = event.dataTransfer.getData('application/x-reparosm-order');
                        const order = orders.find((item) => item.id === id);
                        if (order) void moveTo(order, column);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="flex items-center gap-2 text-sm font-semibold">
                          <span
                            aria-hidden="true"
                            className={`size-2 rounded-full ${toneDot[orderStageTone(column)]}`}
                          />
                          {column}
                        </h2>
                        <Badge variant="neutral">{inStage.length}</Badge>
                      </div>
                      {inStage.length ? (
                        inStage.map((order) => (
                          <article
                            className={`grid gap-2 rounded-lg border bg-card p-3 ${movingId === order.id ? 'opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
                            key={order.id}
                            draggable={!movingId}
                            aria-busy={movingId === order.id}
                            onDragStart={(event) => {
                              event.dataTransfer.setData('application/x-reparosm-order', order.id);
                              event.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => setDropStage(null)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2">
                                <Input
                                  type="checkbox"
                                  className="size-4"
                                  checked={selectedIds.has(order.id)}
                                  onChange={() => toggleSelected(order.id)}
                                  aria-label={`Selecionar ordem ${order.code}`}
                                />
                                <strong className="text-sm">{order.code}</strong>
                              </label>
                              {isNotablePriority(order.priority) && (
                                <Badge variant={badgeFor(orderPriorityTone(order.priority))}>
                                  {order.priority}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium">{order.device}</p>
                            <p className="text-sm text-muted-foreground">{order.customer}</p>
                            <div className="flex items-center justify-between gap-2 border-t pt-2">
                              <Button
                                aria-label={`Voltar etapa de ${order.code}`}
                                disabled={Boolean(movingId) || column === orderStages[0]}
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
                                disabled={Boolean(movingId) || column === orderStages.at(-1)}
                                onClick={() => move(order, 1)}
                                size="icon"
                                title="Avançar etapa"
                                type="button"
                                variant="outline"
                              >
                                →
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                className="flex-1"
                                onClick={() => edit(order)}
                                size="sm"
                                type="button"
                                variant="outline"
                                disabled={movingId === order.id}
                              >
                                Editar OS
                              </Button>
                              {!order.payment && (
                                <OrderPaymentStatus
                                  onCharge={() => startCharging(order)}
                                  order={order}
                                />
                              )}
                            </div>
                            {order.payment && <OrderPaymentStatus order={order} />}
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
          parts={initialParts}
        />
      )}
      {modal === 'edit' && editing && (
        <OrderEditModal
          item={editing}
          close={() => setModal(null)}
          parts={initialParts}
          save={save}
        />
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
