'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import OrdersTable from '@/components/orders-table';
import {
  OrderCreateModal,
  OrderEditModal,
  type OrderRow,
  type SaveOrder,
} from '@/components/order-modals';
import type { Order } from '@/lib/types';

export default function OrdersRoute({ initialOrders }: { initialOrders: OrderRow[] }) {
  const { notify } = useFeedback();
  const [orders, setOrders] = useState(initialOrders),
    [modal, setModal] = useState<'create' | 'edit' | null>(null),
    [editing, setEditing] = useState<OrderRow | null>(null),
    [query, setQuery] = useState(''),
    [stage, setStage] = useState('Todas'),
    [priority, setPriority] = useState('Todas');
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
  const save: SaveOrder = async (data: Order, id?: string) => {
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
        throw new Error(result.error || 'Não foi possível salvar a ordem.');
      const saved = { id: result.record.id, ...result.record.data };
      setOrders((current) =>
        id ? current.map((order) => (order.id === id ? saved : order)) : [saved, ...current],
      );
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
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Ordens de serviço</h1>
          <small>Dados carregados no servidor para a conta atual.</small>
        </div>
        <div className="top-actions">
          <Link className="top-action-link" href="/">
            ← Painel completo
          </Link>
          <button className="primary" type="button" onClick={create}>
            + Nova ordem
          </button>
        </div>
      </header>
      <section className="panel order-filters" aria-label="Filtros de ordens">
        <div className="order-filter-head">
          <div>
            <strong>{visible.length}</strong> de {orders.length} ordens visíveis
          </div>
          {filtered && (
            <button
              className="filter-clear"
              type="button"
              onClick={() => {
                setQuery('');
                setStage('Todas');
                setPriority('Todas');
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
        <div className="order-filter-controls">
          <label>
            Buscar
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="OS, cliente ou aparelho"
            />
          </label>
          <label>
            Etapa
            <select value={stage} onChange={(event) => setStage(event.target.value)}>
              {[
                'Todas',
                'Recebido',
                'Diagnóstico',
                'Aguardando aprovação',
                'Em reparo',
                'Teste final',
                'Retirada',
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Prioridade
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              {['Todas', 'Normal', 'Urgente', 'Garantia'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <OrdersTable
        orders={visible}
        emptyMessage={
          orders.length && filtered ? 'Nenhuma ordem corresponde aos filtros.' : undefined
        }
        onCreate={create}
        onEdit={edit}
        onRemoved={(id) => setOrders((current) => current.filter((order) => order.id !== id))}
      />
      {modal === 'create' && <OrderCreateModal close={() => setModal(null)} save={save} />}
      {modal === 'edit' && editing && (
        <OrderEditModal item={editing} close={() => setModal(null)} save={save} />
      )}
    </>
  );
}
