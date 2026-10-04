'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFeedback } from '@/components/feedback';
import OrderPaymentDialog from '@/components/order-payment-dialog';
import { Button } from '@/components/ui/button';
import { whatsappUrl } from '@/lib/format';

type WhatsappMessage = {
  phone: string;
  message: string;
  customer: string;
  kind: string;
  orderId?: string;
};

/** Abre uma conversa e registra exatamente essa mensagem no histórico. */
export function openWhatsapp(
  { phone, message, customer, kind, orderId }: WhatsappMessage,
  notify: (message: string, tone: 'error') => void,
) {
  window.open(whatsappUrl(phone, message), '_blank', 'noopener,noreferrer');
  void fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        ...(orderId ? { orderId } : {}),
        customer,
        phone,
        kind,
        message,
        status: 'Aberto no WhatsApp',
        sentAt: new Date().toISOString(),
      },
    }),
  }).catch(() => notify('A conversa abriu, mas não foi registrada no histórico.', 'error'));
}

export function WhatsappAction({ label, ...message }: WhatsappMessage & { label: string }) {
  const { notify } = useFeedback();
  return (
    <Button onClick={() => openWhatsapp(message, notify)} size="sm" type="button" variant="outline">
      {label}
    </Button>
  );
}

type ChargedOrder = { id: string; code: string; total: number };

export function ReceiveAction({ order }: { order: ChargedOrder }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" type="button">
        Receber
      </Button>
      {open && <ReceiveDialog close={() => setOpen(false)} order={order} />}
    </>
  );
}

// Só existe com o diálogo aberto: o botão não depende do roteador.
function ReceiveDialog({ order, close }: { order: ChargedOrder; close: () => void }) {
  const router = useRouter();
  return (
    <OrderPaymentDialog
      close={close}
      order={order}
      saved={() => {
        close();
        router.refresh();
      }}
    />
  );
}
