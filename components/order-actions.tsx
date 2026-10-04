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
