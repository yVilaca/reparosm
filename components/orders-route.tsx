'use client';

import Link from 'next/link';
import { useState } from 'react';
import OrdersTable from '@/components/orders-table';
import {
  OrderCreateModal,
  OrderEditModal,
  type OrderRow,
  type SaveOrder,
} from '@/components/order-modals';
import type { Order } from '@/lib/types';

export default function OrdersRoute({ initialOrders }: { initialOrders: OrderRow[] }) {
  const [orders, setOrders] = useState(initialOrders),
    [modal, setModal] = useState<'create' | 'edit' | null>(null),
    [editing, setEditing] = useState<OrderRow | null>(null);
  const save: SaveOrder = async (data: Order, id?: string) => {
    try {
      // ponytail: reuse the validated state endpoint until resource routes migrate one module at a time.
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'order', data, id }),
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
      alert(error instanceof Error ? error.message : 'Não foi possível salvar a ordem.');
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
      <OrdersTable
        orders={orders}
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
