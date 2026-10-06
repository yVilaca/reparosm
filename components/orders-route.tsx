'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useFeedback } from '@/components/feedback';
import OrderPaymentDialog from '@/components/order-payment-dialog';
import OrderPaymentStatus from '@/components/order-payment-status';
import OrdersTable from '@/components/orders-table';
import OrderActions from '@/components/order-actions';
import OrderDetailsDialog from '@/components/order-details-dialog';
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
import { toneDot } from '@/components/ui/tone';
import { Columns3, Eye, Plus, Rows3 } from 'lucide-react';
import { badgeFor, isNotablePriority, orderPriorityTone, orderStageTone } from '@/lib/status-tones';
import { formatMoney } from '@/lib/format';
import type { Order, OrderPayment, OrderStage } from '@/lib/types';
import { uploadOrderPhotos } from '@/lib/order-photo-upload';
import { orderStages } from '@/lib/order-stages';
import { newestFirst } from '@/lib/sorting';

type OrderView = 'grid' | 'kanban';

const filterFields: FilterField[] = [
  { key: 'search', label: 'Busca' },
  { key: 'code', label: 'OS' },
  { key: 'customer', label: 'Cliente' },
  { key: 'device', label: 'Aparelho' },
  { key: 'phone', label: 'WhatsApp' },
  { key: 'stage', label: 'Etapa', options: [...orderStages] },
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

export function edgeScrollSpeed(x: number, width: number) {
  if (width <= 0 || x < 0 || x > width) return 0;
  const edge = Math.min(100, width / 2);
  if (x < edge) return -480 * (1 - x / edge);
  if (x > width - edge) return 480 * (1 - (width - x) / edge);
  return 0;
}

export default function OrdersRoute({
  initialOrders,
  initialParts = [],
  defaultWarrantyDays = 90,
  initialQuery = '',
  view = 'grid',
  startCreating = false,
}: {
  initialOrders: OrderRow[];
  initialParts?: PartRow[];
  defaultWarrantyDays?: number;
  initialQuery?: string;
  view?: OrderView;
  startCreating?: boolean;
}) {
  const { notify } = useFeedback();
  const [orders, setOrders] = useState(initialOrders),
    [modal, setModal] = useState<'create' | 'edit' | null>(startCreating ? 'create' : null),
    [editing, setEditing] = useState<OrderRow | null>(null),
    [viewingId, setViewingId] = useState<string | null>(null),
    [charging, setCharging] = useState<{ id: string; code: string; total: number } | null>(null),
    [filters, setFilters] = useState<Filter[]>(
      initialQuery ? [{ field: 'search', value: initialQuery }] : [],
    ),
    [movingId, setMovingId] = useState<string | null>(null),
    [dropStage, setDropStage] = useState<OrderStage | null>(null),
    [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const viewing = orders.find((order) => order.id === viewingId);
  const boardRef = useRef<HTMLDivElement>(null);
  const scrollBarRef = useRef<HTMLDivElement>(null);
  const [scrollExtent, setScrollExtent] = useState({ width: 0, viewport: 0 });
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const measure = () => {
      const width = board.scrollWidth;
      const viewport = board.clientWidth;
      setScrollExtent((current) =>
        current.width === width && current.viewport === viewport ? current : { width, viewport },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    measure();
    return () => observer.disconnect();
  }, [view]);
  useEffect(() => {
    const board = boardRef.current;
    if (!board || modal || viewingId || charging || movingId) return;
    let frame = 0;
    let speed = 0;
    let last = 0;
    let position = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      speed = 0;
    };
    const step = (now: number) => {
      position = Math.max(
        0,
        Math.min(
          board.scrollWidth - board.clientWidth,
          position + (speed * Math.max(0, Math.min(now - last, 32))) / 400,
        ),
      );
      board.scrollLeft = position;
      last = now;
      if (
        (speed < 0 && board.scrollLeft <= 0) ||
        (speed > 0 && board.scrollLeft >= board.scrollWidth - board.clientWidth)
      )
        stop();
      else frame = requestAnimationFrame(step);
    };
    const panAt = (clientX: number) => {
      const bounds = board.getBoundingClientRect();
      speed = edgeScrollSpeed(clientX - bounds.left, board.clientWidth);
      if (!speed) return stop();
      if (!frame) {
        position = board.scrollLeft;
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.buttons === 0) panAt(event.clientX);
      else stop();
    };
    const drag = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('application/x-reparosm-order')) panAt(event.clientX);
    };
    const dragLeave = (event: DragEvent) => {
      if (!board.contains(event.relatedTarget as Node | null)) stop();
    };
    board.addEventListener('pointermove', pointer);
    board.addEventListener('pointerup', pointer);
    board.addEventListener('pointerdown', stop);
    board.addEventListener('pointerleave', stop);
    board.addEventListener('pointercancel', stop);
    board.addEventListener('dragover', drag);
    board.addEventListener('dragleave', dragLeave);
    board.addEventListener('drop', stop);
    board.addEventListener('dragend', stop);
    window.addEventListener('blur', stop);
    return () => {
      stop();
      board.removeEventListener('pointermove', pointer);
      board.removeEventListener('pointerup', pointer);
      board.removeEventListener('pointerdown', stop);
      board.removeEventListener('pointerleave', stop);
      board.removeEventListener('pointercancel', stop);
      board.removeEventListener('dragover', drag);
      board.removeEventListener('dragleave', dragLeave);
      board.removeEventListener('drop', stop);
      board.removeEventListener('dragend', stop);
      window.removeEventListener('blur', stop);
    };
  }, [view, modal, viewingId, charging, movingId]);
  const visible = orders.filter((order) => matchesOrderFilters(order, filters)).sort(newestFirst);
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
        code?: string;
        record?: { id: string; data: Order };
        paymentDue?: { orderId: string; total: number } | null;
      };
      if (!response.ok || !result.record)
        throw Object.assign(new Error(result.error || 'Não foi possível salvar a ordem.'), {
          code: result.code,
        });
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
        title={view === 'kanban' ? 'Mesa' : 'Ordens de serviço'}
        description={
          view === 'kanban'
            ? 'Organize os atendimentos por etapa.'
            : 'Consulte e gerencie as ordens de serviço.'
        }
        action={
          <>
            <Button asChild variant="outline">
              <Link href={view === 'kanban' ? '/ordens' : '/mesa'}>
                {view === 'kanban' ? <Rows3 aria-hidden="true" /> : <Columns3 aria-hidden="true" />}
                {view === 'kanban' ? 'Lista de OS' : 'Abrir Mesa'}
              </Link>
            </Button>
            <Button onClick={create}>
              <Plus aria-hidden="true" />
              Nova ordem
            </Button>
          </>
        }
      />
      <div className="mb-4 grid gap-3">
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
          stages={orderStages}
          onStageChange={moveTo}
          changingStage={Boolean(movingId)}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          emptyMessage={
            orders.length && filtered ? 'Nenhuma ordem corresponde aos filtros.' : undefined
          }
          onCreate={create}
          onCharge={startCharging}
          onEdit={edit}
          onView={(order) => setViewingId(order.id)}
          onRemoved={(id) => setOrders((current) => current.filter((order) => order.id !== id))}
        />
      ) : (
        <Card className="gap-3 py-3">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2 px-3">
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
          <CardContent className="px-3 pb-1">
            <div
              ref={scrollBarRef}
              className="mb-2 h-4 overflow-x-auto overflow-y-hidden focus-visible:outline-2 focus-visible:outline-ring"
              role="region"
              aria-label="Rolagem horizontal da Mesa"
              tabIndex={0}
              hidden={scrollExtent.width <= scrollExtent.viewport}
              onScroll={(event) => {
                if (
                  boardRef.current &&
                  boardRef.current.scrollLeft !== event.currentTarget.scrollLeft
                )
                  boardRef.current.scrollLeft = event.currentTarget.scrollLeft;
              }}
            >
              <div aria-hidden="true" className="h-px" style={{ width: scrollExtent.width }} />
            </div>
            <div
              ref={boardRef}
              className="overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-ring"
              role="region"
              aria-label="Quadro de atendimentos por etapa"
              tabIndex={0}
              onScroll={(event) => {
                if (
                  scrollBarRef.current &&
                  scrollBarRef.current.scrollLeft !== event.currentTarget.scrollLeft
                )
                  scrollBarRef.current.scrollLeft = event.currentTarget.scrollLeft;
              }}
            >
              {visible.length ? (
                <div className="grid grid-flow-col auto-cols-[minmax(19rem,1fr)] gap-3">
                  {orderStages.map((column) => {
                    const inStage = visible.filter(
                      (order) => (order.stage || 'Recebido') === column,
                    );
                    return (
                      <section
                        className={`grid min-h-40 min-w-0 content-start gap-2 rounded-lg bg-muted/30 p-2 transition-colors ${dropStage === column ? 'ring-2 ring-primary' : ''}`}
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
                              className={`grid gap-1.5 rounded-lg border bg-card p-2.5 ${movingId === order.id ? 'opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
                              key={order.id}
                              draggable={!movingId}
                              aria-busy={movingId === order.id}
                              onDragStart={(event) => {
                                event.dataTransfer.setData(
                                  'application/x-reparosm-order',
                                  order.id,
                                );
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
                              <p className="break-words text-sm font-medium">{order.device}</p>
                              <p className="break-words text-xs text-muted-foreground">
                                {order.customer}
                              </p>
                              <div className="flex items-center justify-between gap-2 border-t pt-2">
                                <Button
                                  aria-label={`Voltar etapa de ${order.code}`}
                                  disabled={Boolean(movingId) || column === orderStages[0]}
                                  onClick={() => move(order, -1)}
                                  size="icon-sm"
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
                                  size="icon-sm"
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
                                  onClick={() => setViewingId(order.id)}
                                  aria-label={`Ver OS ${order.code}`}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  <Eye aria-hidden="true" />
                                  Ver OS
                                </Button>
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
                          <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
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
            </div>
          </CardContent>
        </Card>
      )}
      {viewing && (
        <OrderDetailsDialog
          order={viewing}
          close={() => setViewingId(null)}
          onEdit={() => {
            setViewingId(null);
            edit(viewing);
          }}
          onCharge={() => {
            setViewingId(null);
            startCharging(viewing);
          }}
        />
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
