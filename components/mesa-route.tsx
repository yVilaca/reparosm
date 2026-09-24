'use client';

import { useState } from 'react';
import Link from 'next/link';
import { OrderCreateModal, type SaveOrder } from '@/components/order-modals';
import { formatMoney } from '@/lib/format';
import type { Order, OrderStage } from '@/lib/types';

type OrderRow = Order & { id: string };
const stages: OrderStage[] = [
  'Recebido',
  'Diagnóstico',
  'Aguardando aprovação',
  'Em reparo',
  'Teste final',
  'Retirada',
];

export default function MesaRoute({ initialOrders }: { initialOrders: OrderRow[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [modal, setModal] = useState(false);
  const save: SaveOrder = async (data, id) => {
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Order };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível atualizar a ordem.');
      const saved = { id: result.record.id, ...result.record.data };
      setOrders((current) =>
        id ? current.map((order) => (order.id === id ? saved : order)) : [saved, ...current],
      );
      setModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível atualizar a ordem.');
    }
  };
  const move = (order: OrderRow, direction: number) => {
    const index = Math.max(
      0,
      Math.min(stages.length - 1, stages.indexOf(order.stage || 'Recebido') + direction),
    );
    void save({ ...order, stage: stages[index] }, order.id);
  };
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Mesa</h1>
          <small>Fluxo de atendimento carregado no servidor para a conta atual.</small>
        </div>
        <div className="top-actions">
          <button className="primary" type="button" onClick={() => setModal(true)}>
            + Nova ordem
          </button>
          <Link className="top-action-link" href="/">
            ← Painel completo
          </Link>
        </div>
      </header>
      {!orders.length ? (
        <article className="empty-state">
          <div>✦</div>
          <h2>A Mesa está vazia</h2>
          <p>Crie uma ordem para ela aparecer automaticamente no fluxo.</p>
          <button className="primary" type="button" onClick={() => setModal(true)}>
            Criar primeira ordem
          </button>
        </article>
      ) : (
        <div className="kanban kanban-enhanced">
          {stages.map((stage) => (
            <section key={stage}>
              <header>
                <span>
                  <i className="flow-dot" />
                  {stage}
                </span>
                <b>{orders.filter((order) => (order.stage || 'Recebido') === stage).length}</b>
              </header>
              {orders
                .filter((order) => (order.stage || 'Recebido') === stage)
                .map((order) => (
                  <article key={`${order.id}-${stage}`}>
                    <div>
                      <b>{order.code}</b>
                      <small>{order.priority}</small>
                    </div>
                    <h4>{order.device}</h4>
                    <p>{order.customer}</p>
                    <footer>
                      <button
                        type="button"
                        disabled={stage === stages[0]}
                        aria-label={`Voltar etapa de ${order.code}`}
                        title="Voltar etapa"
                        onClick={() => move(order, -1)}
                      >
                        ←
                      </button>
                      <span>{formatMoney(Number(order.total || 0))}</span>
                      <button
                        type="button"
                        disabled={stage === stages.at(-1)}
                        aria-label={`Avançar etapa de ${order.code}`}
                        title="Avançar etapa"
                        onClick={() => move(order, 1)}
                      >
                        →
                      </button>
                    </footer>
                  </article>
                ))}
            </section>
          ))}
        </div>
      )}
      {modal && <OrderCreateModal close={() => setModal(false)} save={save} />}
    </>
  );
}
