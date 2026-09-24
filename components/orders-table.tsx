'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { formatMoney, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Order } from '@/lib/types';

type OrderRow = Order & { id: string };

export default function OrdersTable({
  orders,
  onCreate,
  onEdit,
  onRemoved,
}: {
  orders: OrderRow[];
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
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível excluir a ordem.', 'error');
    } finally {
      setBusy('');
    }
  };
  if (!orders.length)
    return (
      <article className="empty-state">
        <div>✦</div>
        <h2>Nenhuma ordem cadastrada</h2>
        <p>Cadastre uma ordem completa com aparelho, senha, custo e previsão.</p>
        {onCreate ? (
          <button className="primary" type="button" onClick={onCreate}>
            Nova ordem
          </button>
        ) : (
          <Link className="primary" href="/">
            Abrir painel completo
          </Link>
        )}
      </article>
    );
  return (
    <article className="panel page-panel order-management">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>OS</th>
              <th>Cliente</th>
              <th>Aparelho</th>
              <th>Etapa</th>
              <th>Total</th>
              <th>Custo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <b>{order.code}</b>
                </td>
                <td>{order.customer || '—'}</td>
                <td>{order.device || '—'}</td>
                <td>
                  <span className="tag progress">{order.stage || 'Recebido'}</span>
                </td>
                <td>{formatMoney(Number(order.total || 0))}</td>
                <td>{formatMoney(Number(order.cost || 0))}</td>
                <td>
                  <div className="row-actions">
                    <button type="button" onClick={() => send(order)}>
                      WhatsApp
                    </button>
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(order)}>
                        Editar
                      </button>
                    )}
                    <button
                      type="button"
                      className="danger"
                      disabled={busy === order.id}
                      onClick={() => void remove(order)}
                    >
                      {busy === order.id ? 'Excluindo…' : 'Excluir'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
