'use client';
import { useRouter } from 'next/navigation';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import { firstName, trackingState } from '@/lib/order-tracking';
import { orderPrintUrl, type PrintLayout } from '@/lib/print';
import type { OrderRow } from '@/components/order-modals';
export default function OrderActions({
  selectedOrders,
  setSelectedIds,
  onEdit,
  onCharge,
  onRemoved,
  disabled = false,
}: {
  selectedOrders: OrderRow[];
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  onEdit?: (order: OrderRow) => void;
  onCharge?: (order: OrderRow) => void;
  onRemoved?: (id: string) => void;
  disabled?: boolean;
}) {
  const { notify, confirm } = useFeedback();
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const selectedOrder = selectedOrders.length === 1 ? selectedOrders[0] : null;
  const print = (layout: PrintLayout) => {
    const url = orderPrintUrl(
      selectedOrders.map((order) => order.id),
      layout,
    );
    if (!url) {
      notify('Selecione entre 1 e 100 ordens para imprimir.', 'error');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const send = (order: OrderRow) => {
    const phone = order.phone || '';
    if (!hasValidWhatsapp(phone)) {
      notify('Cadastre um WhatsApp válido nesta ordem.', 'error');
      return;
    }
    // Abre a janela já no clique (senão o navegador bloqueia) e preenche quando o
    // link de acompanhamento chega. Sem link, a mensagem vai sem ele.
    const popup = window.open('about:blank', '_blank');
    void (async () => {
      const name = firstName(order.customer);
      let message = `Olá${name ? `, ${name}` : ''}! Atualização da ${order.code} (${order.device}): ${trackingState(order.stage, order.status).title}.`;
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/tracking`, {
          method: 'POST',
        });
        const result = (await response.json()) as { url?: string };
        if (response.ok && result.url) message += ` Acompanhe por aqui: ${result.url}`;
      } catch {}
      const url = whatsappUrl(phone, message);
      if (popup) {
        popup.opener = null;
        popup.location.href = url;
      } else window.open(url, '_blank', 'noopener,noreferrer');
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
    })();
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

  const hasSelection = selectedOrders.length > 0;
  const canCharge = Boolean(
    selectedOrder && onCharge && !selectedOrder.payment && Number(selectedOrder.total || 0) > 0,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={disabled || !hasSelection || Boolean(busy)} size="sm" variant="outline">
          Ações
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>
          {selectedOrders.length === 1
            ? `Ações da ${selectedOrder?.code}`
            : `${selectedOrders.length} ordens selecionadas`}
        </DropdownMenuLabel>
        <DropdownMenuItem disabled={!hasSelection} onSelect={() => print('full')}>
          Imprimir completa
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasSelection} onSelect={() => print('compact')}>
          Imprimir reduzida
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
