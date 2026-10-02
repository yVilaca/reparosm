'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import OrderPaymentDialog from '@/components/order-payment-dialog';
import OrderPaymentStatus from '@/components/order-payment-status';
import { OrderCreateModal, type SaveOrder } from '@/components/order-modals';
import { orderPriorityVariant } from '@/components/orders-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import { formatMoney } from '@/lib/format';
import type { Order, OrderPayment, OrderStage } from '@/lib/types';
import { uploadOrderPhotos } from '@/lib/order-photo-upload';

type OrderRow = Order & { id: string };
const stages: OrderStage[] = [
  'Recebido',
  'Diagnóstico',
  'Aguardando aprovação',
  'Em reparo',
  'Teste final',
  'Retirada',
];

export default function MesaRoute({
  initialOrders,
  defaultWarrantyDays = 90,
}: {
  initialOrders: OrderRow[];
  defaultWarrantyDays?: number;
}) {
  const { notify } = useFeedback();
  const [orders, setOrders] = useState(initialOrders);
  const [modal, setModal] = useState(false);
  const [charging, setCharging] = useState<{ id: string; code: string; total: number } | null>(
    null,
  );
  const save: SaveOrder = async (data, id, photos = []) => {
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
        throw new Error(result.error || 'Não foi possível atualizar a ordem.');
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
      setModal(false);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível atualizar a ordem.',
        'error',
      );
    }
  };
  const move = (order: OrderRow, direction: number) => {
    const index = Math.max(
      0,
      Math.min(stages.length - 1, stages.indexOf(order.stage || 'Recebido') + direction),
    );
    void save({ ...order, stage: stages[index] }, order.id);
  };
  const startCharging = (order: OrderRow) =>
    setCharging({ id: order.id, code: order.code, total: Number(order.total || 0) });
  return (
    <>
      <PageHeader
        title="Mesa"
        description="Fluxo de atendimento carregado no servidor para a conta atual."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => setModal(true)}>
              Nova ordem
            </Button>
          </div>
        }
      />
      {!orders.length ? (
        <EmptyState
          action={<Button onClick={() => setModal(true)}>Criar primeira ordem</Button>}
          description="Crie uma ordem para ela aparecer automaticamente no fluxo."
          title="A Mesa está vazia"
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const inStage = orders.filter((order) => (order.stage || 'Recebido') === stage);
            return (
              <Card className="w-72 shrink-0 gap-3" key={stage}>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-sm">{stage}</CardTitle>
                  <Badge variant="secondary">{inStage.length}</Badge>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {inStage.length ? (
                    inStage.map((order) => (
                      <article className="grid gap-2 rounded-lg border p-3" key={order.id}>
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-sm">{order.code}</strong>
                          <Badge variant={orderPriorityVariant(order.priority)}>
                            {order.priority || 'Normal'}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">{order.device}</p>
                        <p className="text-sm text-muted-foreground">{order.customer}</p>
                        <OrderPaymentStatus onCharge={() => startCharging(order)} order={order} />
                        <div className="flex items-center justify-between gap-2 border-t pt-2">
                          <Button
                            aria-label={`Voltar etapa de ${order.code}`}
                            disabled={stage === stages[0]}
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
                            disabled={stage === stages.at(-1)}
                            onClick={() => move(order, 1)}
                            size="icon"
                            title="Avançar etapa"
                            type="button"
                            variant="outline"
                          >
                            →
                          </Button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      Nenhuma ordem
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {modal && (
        <OrderCreateModal
          close={() => setModal(false)}
          save={save}
          defaultWarrantyDays={defaultWarrantyDays}
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
